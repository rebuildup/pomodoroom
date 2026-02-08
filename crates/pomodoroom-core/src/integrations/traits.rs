use crate::storage::database::SessionRecord;

/// Every external service integration implements this trait.
/// Integrations are stateless between calls -- credentials come from
/// the OS keyring, looked up by `name()`.
pub trait Integration: Send + Sync {
    /// Unique identifier (e.g. "google", "notion", "linear").
    fn name(&self) -> &str;

    /// Human-readable display name.
    fn display_name(&self) -> &str;

    /// Whether the user has authenticated with this service.
    fn is_authenticated(&self) -> bool;

    /// Start the OAuth/API-key flow. Opens browser if needed.
    fn authenticate(&mut self) -> Result<(), Box<dyn std::error::Error>>;

    /// Remove stored credentials.
    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>>;

    /// Called when a focus session starts.
    fn on_focus_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Ok(()) // default no-op
    }

    /// Called when a break session starts.
    fn on_break_start(
        &self,
        _step_label: &str,
        _duration_min: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Ok(()) // default no-op
    }

    /// Called when any session completes.
    fn on_session_complete(
        &self,
        _session: &SessionRecord,
    ) -> Result<(), Box<dyn std::error::Error>> {
        Ok(()) // default no-op
    }
}
