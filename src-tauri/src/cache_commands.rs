//! Tauri commands for generic cache operations using SQLite KV store.
//!
//! Provides TTL-based caching with JSON serialization, backed by the
//! Database's key-value table instead of localStorage.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

use pomodoroom_core::storage::Database;

/// Cache entry with data, timestamp, and optional TTL
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry<T> {
    data: T,
    timestamp: i64, // Unix timestamp in milliseconds
    ttl: Option<i64>, // Time to live in milliseconds
}

/// Cache result with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheResult {
    pub data: Option<serde_json::Value>,
    pub is_stale: bool,
    pub last_updated: Option<i64>,
}

/// Get cached data by key with TTL check
#[tauri::command]
pub fn cmd_cache_get(
    db: State<'_, Mutex<Database>>,
    key: String,
    ttl: Option<i64>, // Default TTL in milliseconds (None = no expiration check)
) -> Result<CacheResult, String> {
    let db = db.lock().map_err(|e| format!("Lock error: {e}"))?;
    
    match db.kv_get(&key).map_err(|e| e.to_string())? {
        None => Ok(CacheResult {
            data: None,
            is_stale: false,
            last_updated: None,
        }),
        Some(json_str) => {
            // Deserialize as generic JSON value
            let entry: CacheEntry<serde_json::Value> = serde_json::from_str(&json_str)
                .map_err(|e| format!("Cache parse error: {e}"))?;
            
            let now = chrono::Utc::now().timestamp_millis();
            let age = now - entry.timestamp;
            let effective_ttl = ttl.or(entry.ttl);
            let is_stale = effective_ttl.map_or(false, |t| age > t);
            
            Ok(CacheResult {
                data: Some(entry.data),
                is_stale,
                last_updated: Some(entry.timestamp),
            })
        }
    }
}

/// Set cached data by key with optional TTL
#[tauri::command]
pub fn cmd_cache_set(
    db: State<'_, Mutex<Database>>,
    key: String,
    data: serde_json::Value,
    ttl: Option<i64>, // TTL in milliseconds (None = no expiration)
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Lock error: {e}"))?;
    
    let entry = CacheEntry {
        data,
        timestamp: chrono::Utc::now().timestamp_millis(),
        ttl,
    };
    
    let json_str = serde_json::to_string(&entry)
        .map_err(|e| format!("Serialization error: {e}"))?;
    
    db.kv_set(&key, &json_str).map_err(|e| e.to_string())
}

/// Delete cached data by key
#[tauri::command]
pub fn cmd_cache_delete(
    db: State<'_, Mutex<Database>>,
    key: String,
) -> Result<bool, String> {
    let db = db.lock().map_err(|e| format!("Lock error: {e}"))?;
    
    let existed = db.kv_get(&key).map_err(|e| e.to_string())?.is_some();
    
    // SQLite doesn't have a DELETE that returns affected rows easily,
    // so we just execute and return whether it existed before
    db.conn().execute("DELETE FROM kv WHERE key = ?1", [&key])
        .map_err(|e| e.to_string())?;
    
    Ok(existed)
}

/// Clear all cache entries with a specific prefix
#[tauri::command]
pub fn cmd_cache_clear_prefix(
    db: State<'_, Mutex<Database>>,
    prefix: String,
) -> Result<usize, String> {
    let db = db.lock().map_err(|e| format!("Lock error: {e}"))?;
    
    let pattern = format!("{prefix}%");
    let affected = db.conn().execute(
        "DELETE FROM kv WHERE key LIKE ?1",
        [&pattern],
    ).map_err(|e| e.to_string())?;
    
    Ok(affected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pomodoroom_core::storage::Database;
    
    #[test]
    fn test_cache_lifecycle() {
        let db = Database::open_memory().unwrap();
        let db_state = Mutex::new(db);
        
        // Set cache
        let data = serde_json::json!({"foo": "bar"});
        cmd_cache_set(
            State::from(&db_state),
            "test:key".to_string(),
            data.clone(),
            Some(60000), // 1 minute TTL
        ).unwrap();
        
        // Get cache
        let result = cmd_cache_get(
            State::from(&db_state),
            "test:key".to_string(),
            None,
        ).unwrap();
        
        assert!(result.data.is_some());
        assert_eq!(result.data.unwrap(), data);
        assert!(!result.is_stale);
        
        // Delete cache
        let existed = cmd_cache_delete(
            State::from(&db_state),
            "test:key".to_string(),
        ).unwrap();
        
        assert!(existed);
        
        // Verify deletion
        let result = cmd_cache_get(
            State::from(&db_state),
            "test:key".to_string(),
            None,
        ).unwrap();
        
        assert!(result.data.is_none());
    }
}
