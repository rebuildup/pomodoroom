//! Signed event payloads for tamper detection in calendar storage.
//!
//! Events stored in calendar descriptions include HMAC signatures
//! to detect tampering and corruption.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current schema version for signed events
pub const SCHEMA_VERSION: &str = "1.0";

/// Signed event payload with HMAC signature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedEventPayload {
    /// Schema version for compatibility
    pub schema_version: String,
    /// Event type identifier
    pub event_type: String,
    /// Event data (the actual payload)
    pub data: serde_json::Value,
    /// Timestamp when the event was created
    pub created_at: String,
    /// Unique identifier for this event
    pub event_id: String,
    /// Device/node that created this event
    pub device_id: String,
    /// HMAC signature of the above fields
    pub signature: String,
    /// Optional metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

impl SignedEventPayload {
    /// Create a new signed event payload
    pub fn new(
        event_type: String,
        data: serde_json::Value,
        event_id: String,
        device_id: String,
        signing_key: &[u8],
    ) -> Self {
        let created_at = chrono::Utc::now().to_rfc3339();
        let schema_version = SCHEMA_VERSION.to_string();

        let payload_without_signature = PayloadToSign {
            schema_version: &schema_version,
            event_type: &event_type,
            data: &data,
            created_at: &created_at,
            event_id: &event_id,
            device_id: &device_id,
        };

        let signature = compute_hmac_signature(&payload_without_signature, signing_key);

        Self {
            schema_version,
            event_type,
            data,
            created_at,
            event_id,
            device_id,
            signature,
            metadata: None,
        }
    }

    /// Verify the signature of this payload
    pub fn verify(&self, signing_key: &[u8]) -> Result<bool, SignatureError> {
        let payload_to_sign = PayloadToSign {
            schema_version: &self.schema_version,
            event_type: &self.event_type,
            data: &self.data,
            created_at: &self.created_at,
            event_id: &self.event_id,
            device_id: &self.device_id,
        };

        let expected_signature = compute_hmac_signature(&payload_to_sign, signing_key);

        // Use constant-time comparison to prevent timing attacks
        if self.signature.len() != expected_signature.len() {
            return Ok(false);
        }

        let mut result = 0u8;
        for (a, b) in self.signature.bytes().zip(expected_signature.bytes()) {
            result |= a ^ b;
        }

        Ok(result == 0)
    }

    /// Add metadata to the payload
    pub fn with_metadata(mut self, metadata: HashMap<String, String>) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Serialize to JSON string for embedding
    pub fn to_embedded_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Parse from embedded JSON string
    pub fn from_embedded_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Check if schema version is compatible
    pub fn is_schema_compatible(&self, max_supported_version: &str) -> bool {
        // Simple version comparison - in production use semver
        self.schema_version.as_str() <= max_supported_version
    }
}

/// Internal struct for HMAC signature computation
#[derive(Debug, Serialize)]
pub struct PayloadToSign<'a> {
    schema_version: &'a str,
    event_type: &'a str,
    data: &'a serde_json::Value,
    created_at: &'a str,
    event_id: &'a str,
    device_id: &'a str,
}

/// Compute HMAC-SHA256 signature
pub fn compute_hmac_signature(payload: &PayloadToSign, key: &[u8]) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let payload_json = serde_json::to_string(payload).expect("Failed to serialize payload");

    let mut mac =
        HmacSha256::new_from_slice(key).expect("HMAC can take keys of any size");
    mac.update(payload_json.as_bytes());

    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

/// Generate a signing key from a seed
pub fn generate_signing_key(seed: &str) -> Vec<u8> {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.update(b"pomodoroom-signing-key-v1");
    hasher.finalize().to_vec()
}

/// Errors related to signature operations
#[derive(Debug, Clone, thiserror::Error)]
pub enum SignatureError {
    #[error("Invalid signature format")]
    InvalidFormat,

    #[error("Signature verification failed")]
    VerificationFailed,

    #[error("Incompatible schema version: {0}")]
    IncompatibleSchema(String),

    #[error("Missing required field: {0}")]
    MissingField(String),
}

/// Calendar event description with embedded signed payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEventDescription {
    /// Human-readable description
    pub description: String,
    /// Embedded signed event payload (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signed_payload: Option<String>,
}

impl CalendarEventDescription {
    /// Create a new event description
    pub fn new(description: String) -> Self {
        Self {
            description,
            signed_payload: None,
        }
    }

    /// Attach a signed payload to this description
    pub fn with_signed_payload(mut self, payload: &SignedEventPayload) -> Result<Self, serde_json::Error> {
        let payload_json = payload.to_embedded_json()?;
        self.signed_payload = Some(payload_json);
        Ok(self)
    }

    /// Serialize for calendar event description
    pub fn to_calendar_format(&self) -> String {
        if let Some(payload) = &self.signed_payload {
            format!(
                "{}\n\n---\nPOMODOROOM_SIGNED\n{}",
                self.description, payload
            )
        } else {
            self.description.clone()
        }
    }

    /// Parse from calendar event description
    pub fn from_calendar_format(text: &str) -> Result<Self, SignatureError> {
        if let Some(pos) = text.find("\n\n---\nPOMODOROOM_SIGNED\n") {
            let description = text[..pos].to_string();
            let payload_json = text[pos + 23..].to_string(); // Skip marker + newline

            // Validate that it's a valid signed payload
            let _payload: SignedEventPayload = serde_json::from_str(&payload_json)
                .map_err(|_| SignatureError::InvalidFormat)?;

            Ok(Self {
                description,
                signed_payload: Some(payload_json),
            })
        } else {
            // No signed payload, just a plain description
            Ok(Self {
                description: text.to_string(),
                signed_payload: None,
            })
        }
    }

    /// Extract and verify the signed payload if present
    pub fn extract_payload(&self, signing_key: &[u8]) -> Result<Option<SignedEventPayload>, SignatureError> {
        if let Some(payload_json) = &self.signed_payload {
            let payload: SignedEventPayload = serde_json::from_str(payload_json)
                .map_err(|_| SignatureError::InvalidFormat)?;

            if !payload.verify(signing_key)? {
                return Err(SignatureError::VerificationFailed);
            }

            Ok(Some(payload))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_signing_key() -> Vec<u8> {
        generate_signing_key("test-seed")
    }

    #[test]
    fn signed_event_round_trip() {
        let key = test_signing_key();

        let payload = SignedEventPayload::new(
            "timer_completed".to_string(),
            json!({"duration_min": 25, "task_id": "t123"}),
            "evt-001".to_string(),
            "device-1".to_string(),
            &key,
        );

        assert!(payload.verify(&key).unwrap());
    }

    #[test]
    fn signature_fails_with_wrong_key() {
        let key1 = test_signing_key();
        let key2 = generate_signing_key("different-seed");

        let payload = SignedEventPayload::new(
            "timer_completed".to_string(),
            json!({"duration_min": 25}),
            "evt-001".to_string(),
            "device-1".to_string(),
            &key1,
        );

        assert!(!payload.verify(&key2).unwrap());
    }

    #[test]
    fn calendar_description_embedding() {
        let key = test_signing_key();

        let payload = SignedEventPayload::new(
            "session_start".to_string(),
            json!({"focus": true}),
            "evt-002".to_string(),
            "mobile".to_string(),
            &key,
        );

        let desc = CalendarEventDescription::new("Focus session started".to_string())
            .with_signed_payload(&payload)
            .unwrap();

        let calendar_text = desc.to_calendar_format();
        assert!(calendar_text.contains("Focus session started"));
        assert!(calendar_text.contains("POMODOROOM_SIGNED"));

        // Parse back
        let parsed = CalendarEventDescription::from_calendar_format(&calendar_text).unwrap();
        assert!(parsed.signed_payload.is_some());

        let extracted = parsed.extract_payload(&key).unwrap();
        assert!(extracted.is_some());
        assert_eq!(extracted.unwrap().event_type, "session_start");
    }

    #[test]
    fn schema_version_check() {
        let payload = SignedEventPayload {
            schema_version: "2.0".to_string(),
            event_type: "test".to_string(),
            data: json!({}),
            created_at: chrono::Utc::now().to_rfc3339(),
            event_id: "test".to_string(),
            device_id: "test".to_string(),
            signature: "dummy".to_string(),
            metadata: None,
        };

        assert!(!payload.is_schema_compatible("1.5"));
        assert!(payload.is_schema_compatible("2.0"));
        assert!(payload.is_schema_compatible("3.0"));
    }

    #[test]
    fn plain_description_without_payload() {
        let desc = CalendarEventDescription::new("Just a simple note".to_string());
        let text = desc.to_calendar_format();
        assert_eq!(text, "Just a simple note");

        let parsed = CalendarEventDescription::from_calendar_format(&text).unwrap();
        assert_eq!(parsed.description, "Just a simple note");
        assert!(parsed.signed_payload.is_none());
    }
}
