//! Calendar database and sharding module.

pub mod shard;
pub mod signed;

pub use shard::{
    AggregatedView, CalendarShardId, RoutingContext, ShardConfig, ShardPolicy, ShardRouter,
};
pub use signed::{
    compute_hmac_signature, generate_signing_key, CalendarEventDescription, SCHEMA_VERSION,
    SignedEventPayload, SignatureError,
};
