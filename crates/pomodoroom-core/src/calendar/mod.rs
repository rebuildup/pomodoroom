//! Calendar database and sharding module.

pub mod shard;

pub use shard::{
    AggregatedView, CalendarShardId, RoutingContext, ShardConfig, ShardPolicy, ShardRouter,
};
