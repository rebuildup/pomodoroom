# Offline Cache System

Pomodoroomのオフラインキャッシュシステムは、データをlocalStorageにキャッシュしてネットワークがない状態でもアプリを動作させます。

## Features

- **LocalStorage-based caching**: データをブラウザに永続化
- **TTL (Time-to-Live) support**: データの鮮度管理
- **Online/offline detection**: 自動的なオンライン/オフライン検知
- **Auto-refresh**: オンライン復帰時の自動データ更新
- **Stale data indication**: 古いデータの視覚的表示
- **Error handling**: ネットワークエラー時のフォールバック

## Core Modules

### `cacheManager.ts`

基本的なキャッシュ操作を提供するユーティリティモジュールです。

```typescript
import { cacheGet, cacheSet, cacheDelete, DEFAULT_TTL } from '@/utils/cacheManager';

// Get cached data
const result = cacheGet<Task[]>('cache:tasks', DEFAULT_TTL.MEDIUM);
console.log(result.data); // Cached data or null
console.log(result.isStale); // Whether data is stale
console.log(result.lastUpdated); // Date or null

// Set cached data
cacheSet('cache:tasks', tasks, DEFAULT_TTL.MEDIUM);

// Delete cache
cacheDelete('cache:tasks');

// Get or set pattern (fetch if stale/missing)
const data = await cacheGetOrSet(
  'cache:tasks',
  async () => await fetchTasks(),
  DEFAULT_TTL.MEDIUM
);
```

### `useOfflineCache.ts`

Reactフックでオフラインキャッシュを使用します。

```typescript
import { useOfflineCache, DEFAULT_TTL } from '@/hooks/useOfflineCache';

function TaskList() {
  const {
    data,        // Cached tasks or null
    isStale,     // Whether data is stale
    lastUpdated, // Date or null
    isOnline,    // Current online status
    isLoading,   // Fetch in progress
    error,       // Error from last fetch
    save,        // Manually save to cache
    clear,       // Clear cache
    refresh,     // Force refresh
    invalidate,  // Mark as stale
  } = useOfflineCache<Task[]>({
    key: 'cache:tasks',
    ttl: DEFAULT_TTL.MEDIUM,
    fetchFn: async () => await invoke('cmd_get_tasks'),
    enabled: true,
    onOnlineRefresh: true,
  });

  if (isLoading && !data) return <div>Loading...</div>;
  if (error && !data) return <div>Error: {error.message}</div>;

  return (
    <div>
      <OfflineStatus isOnline={isOnline} isStale={isStale} />
      {data?.map(task => <TaskCard key={task.id} task={task} />)}
    </div>
  );
}
```

## Pre-configured Hooks

`useCachedData.ts`に共通データ用のフックが用意されています。

```typescript
import {
  useCachedTasks,
  useCachedProjects,
  useCachedSchedule,
  useCachedDailyTemplate,
  useCachedCalendarEvents,
  useCachedStats,
  useCachedIntegrations,
} from '@/hooks/useCachedData';

// Task list with 15min cache
const { data: tasks, isStale, refresh } = useCachedTasks(
  async () => await invoke('cmd_get_tasks')
);

// Project list with 1hr cache
const { data: projects } = useCachedProjects(
  async () => await invoke('cmd_get_projects')
);

// Schedule with 5min cache (changes frequently)
const { data: schedule } = useCachedSchedule(
  async () => await invoke('cmd_get_schedule')
);
```

## UI Components

### OfflineIndicator

オンライン/オフライン状態を表示します。

```typescript
import OfflineIndicator from '@/components/OfflineIndicator';

<OfflineIndicator compact />
<OfflineIndicator showLabel />
```

### CacheStamper

キャッシュの鮮度を表示します。

```typescript
import CacheStamper from '@/components/CacheStamper';

<CacheStamper
  lastUpdated={lastUpdated}
  isStale={isStale}
  compact
/>
```

### StaleDataBanner

古いデータ警告バナーを表示します。

```typescript
import { StaleDataBanner } from '@/components/CacheStamper';

<StaleDataBanner
  show={isStale && !isOnline}
  onRefresh={refresh}
  isRefreshing={isLoading}
  message="Tasks may be outdated"
/>
```

## Cache Invalidation

```typescript
import {
  invalidateTaskCache,
  invalidateProjectCache,
  invalidateScheduleCache,
  invalidateAllCaches,
} from '@/hooks/useCachedData';

// Invalidate specific caches
invalidateTaskCache();
invalidateProjectCache();

// Invalidate ALL caches (use with caution)
invalidateAllCaches();

// Invalidate by prefix
import { cacheClearPrefix } from '@/utils/cacheManager';
cacheClearPrefix('cache:calendar');
```

## Google Calendar with Cache

```typescript
import { useCachedGoogleCalendar } from '@/hooks/useCachedGoogleCalendar';

function CalendarPanel() {
  const {
    state,
    events,
    isStale,
    isOnline,
    isLoading,
    refresh,
    clearCache,
  } = useCachedGoogleCalendar();

  return (
    <div>
      <div className="flex items-center gap-2">
        <OfflineIndicator compact />
        {isStale && <span className="text-yellow-500">Cached data</span>}
      </div>
      {/* Calendar content */}
    </div>
  );
}
```

## TTL Presets

```typescript
DEFAULT_TTL.SHORT    // 5 minutes  - frequently changing data
DEFAULT_TTL.MEDIUM   // 15 minutes - standard cache duration
DEFAULT_TTL.LONG     // 1 hour     - rarely changing data
DEFAULT_TTL.VERY_LONG // 24 hours  - almost static data
```

Recommended usage:
- Tasks: MEDIUM (15min)
- Projects: LONG (1hr)
- Schedule: SHORT (5min)
- Calendar events: MEDIUM (15min)
- Stats: SHORT (5min)
- Templates: VERY_LONG (24hr)
- Integration configs: VERY_LONG (24hr)

## Testing Offline Mode

To test offline functionality in development:

1. Open DevTools (F12)
2. Go to Network tab
3. Select "Offline" throttling
4. Reload the app
5. Cached data should be displayed

Or use Chrome DevTools:
- Application > Service Workers > Offline checkbox

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Component                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              useOfflineCache Hook                      │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │            cacheManager.ts                      │  │  │
│  │  │  - cacheGet()                                   │  │  │
│  │  │  - cacheSet()                                   │  │  │
│  │  │  - cacheDelete()                                │  │  │
│  │  │  - cacheGetOrSet()                              │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  localStorage    │
                   │  (Browser API)   │
                   └─────────────────┘
```

## File Structure

```
src/
├── hooks/
│   ├── useOfflineCache.ts     # Main hook implementation
│   ├── useCachedData.ts        # Pre-configured hooks
│   └── useCachedGoogleCalendar.ts  # Calendar with cache
├── utils/
│   └── cacheManager.ts         # Core cache utilities
└── components/
    ├── OfflineIndicator.tsx    # Online status display
    └── CacheStamper.tsx        # Freshness indicator
```
