//! Core error types for pomodoroom-core.
//!
//! This module defines a comprehensive error hierarchy using thiserror
//! for better error handling and reporting across the library.

use std::path::PathBuf;
use thiserror::Error;

/// Core error type for pomodoroom-core.
#[derive(Error, Debug)]
pub enum CoreError {
    /// Database-related errors
    #[error("Database error: {0}")]
    Database(#[from] DatabaseError),

    /// Configuration-related errors
    #[error("Configuration error: {0}")]
    Config(#[from] ConfigError),

    /// Integration-related errors
    #[error("Integration error for '{service}': {message}")]
    Integration {
        service: String,
        message: String,
        #[source]
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    /// OAuth-related errors
    #[error("OAuth error: {0}")]
    OAuth(#[from] OAuthError),

    /// Validation errors
    #[error("Validation error: {0}")]
    Validation(#[from] ValidationError),

    /// IO errors
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization/deserialization errors
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Generic errors with context
    #[error("{0}")]
    Custom(String),
}

/// Database-specific errors.
#[derive(Error, Debug)]
pub enum DatabaseError {
    /// Failed to open database connection
    #[error("Failed to open database at {path}: {source}")]
    OpenFailed {
        path: PathBuf,
        #[source]
        source: rusqlite::Error,
    },

    /// Query execution failed
    #[error("Query failed: {0}")]
    QueryFailed(String),

    /// Migration failed
    #[error("Database migration failed: {0}")]
    MigrationFailed(String),

    /// Connection pool exhausted
    #[error("Database connection pool exhausted")]
    PoolExhausted,

    /// Database is locked
    #[error("Database is locked")]
    Locked,
}

/// Configuration-specific errors.
#[derive(Error, Debug)]
pub enum ConfigError {
    /// Failed to load configuration
    #[error("Failed to load configuration from {path}: {message}")]
    LoadFailed { path: PathBuf, message: String },

    /// Failed to save configuration
    #[error("Failed to save configuration to {path}: {message}")]
    SaveFailed { path: PathBuf, message: String },

    /// Invalid configuration value
    #[error("Invalid configuration value for '{key}': {message}")]
    InvalidValue { key: String, message: String },

    /// Missing required configuration key
    #[error("Missing required configuration key: {0}")]
    MissingKey(String),

    /// Failed to parse configuration
    #[error("Failed to parse configuration: {0}")]
    ParseFailed(String),
}

/// OAuth-specific errors.
#[derive(Error, Debug)]
pub enum OAuthError {
    /// Authorization failed
    #[error("Authorization failed: {0}")]
    AuthorizationFailed(String),

    /// Token exchange failed
    #[error("Token exchange failed: {0}")]
    TokenExchangeFailed(String),

    /// Token refresh failed
    #[error("Token refresh failed: {0}")]
    TokenRefreshFailed(String),

    /// Callback timeout
    #[error("OAuth callback timeout: no callback received within {timeout_secs} seconds")]
    CallbackTimeout { timeout_secs: u64 },

    /// Invalid callback
    #[error("Invalid OAuth callback: {0}")]
    InvalidCallback(String),

    /// Access token expired
    #[error("Access token expired and no refresh token available")]
    TokenExpired,

    /// Not authenticated
    #[error("Not authenticated with {service}")]
    NotAuthenticated { service: String },

    /// Credentials not configured
    #[error("OAuth credentials not configured for {service}")]
    CredentialsNotConfigured { service: String },
}

/// Validation errors.
#[derive(Error, Debug)]
pub enum ValidationError {
    /// Invalid time range
    #[error("Invalid time range: end_time ({end}) must be greater than start_time ({start})")]
    InvalidTimeRange {
        start: chrono::DateTime<chrono::Utc>,
        end: chrono::DateTime<chrono::Utc>,
    },

    /// Empty collection
    #[error("Empty collection: {0}")]
    EmptyCollection(String),

    /// Out of bounds
    #[error("Index {index} out of bounds for {collection} (length: {len})")]
    OutOfBounds {
        collection: String,
        index: usize,
        len: usize,
    },

    /// Invalid value
    #[error("Invalid value for '{field}': {message}")]
    InvalidValue { field: String, message: String },
}

// Helper implementations for converting from other error types

impl From<rusqlite::Error> for DatabaseError {
    fn from(err: rusqlite::Error) -> Self {
        match &err {
            rusqlite::Error::SqliteFailure(err, _msg) => {
                if err.code == rusqlite::ErrorCode::DatabaseLocked {
                    DatabaseError::Locked
                } else {
                    DatabaseError::QueryFailed(err.to_string())
                }
            }
            _ => DatabaseError::QueryFailed(err.to_string()),
        }
    }
}

impl From<Box<dyn std::error::Error + Send + Sync>> for CoreError {
    fn from(err: Box<dyn std::error::Error + Send + Sync>) -> Self {
        CoreError::Custom(err.to_string())
    }
}

impl From<tokio::time::error::Elapsed> for OAuthError {
    fn from(_: tokio::time::error::Elapsed) -> Self {
        OAuthError::CallbackTimeout { timeout_secs: 300 }
    }
}

/// Result type alias for CoreError
pub type Result<T, E = CoreError> = std::result::Result<T, E>;
