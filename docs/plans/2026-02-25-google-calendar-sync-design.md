# Google Calendar Sync Design

**Date:** 2026-02-25
**Status:** Design Approved
**Author:** Claude Code

## Overview

全データをGoogleカレンダーに同期して、マルチデバイス共有とモバイル化を実現する。

### Key Decisions

| 項目 | 決定事項 |
|------|----------|
| データ範囲 | 完全移行（セッション、タスク、プロジェクト、設定、プロファイル、統計） |
| オフライン対応 | ローカルファースト（常時ローカル動作、オンライン時にバックグラウンド同期） |
| データマッピング | 全データをカレンダーイベントとして保存 |
| コンフリクト解決 | 基本マージ、解決不能ならユーザー選択 |
| 既存データ移行 | しない（新規データから両方に保存） |
| 保存先 | 専用カレンダー「Pomodoroom」を自動作成 |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Pomodoroom App                          │
├─────────────────────────────────────────────────────────────┤
│  Timer Engine  │  Scheduler  │  Config Manager  │  Stats    │
└───────┬────────┴──────┬──────┴────────┬─────────┴─────┬─────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Sync Layer (新規)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │ Local Store │◄─┤ Sync Engine │◄─┤ Conflict Resolver│    │
│  │  (SQLite)   │  │             │  │   (Merge/User)   │    │
│  └─────────────┘  └──────┬──────┘  └──────────────────┘    │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼ (online sync)
              ┌────────────────────────┐
              │   Google Calendar API  │
              │  (専用カレンダー作成)    │
              └────────────────────────┘
```

## Data Mapping

### 同期対象全データ

| # | データ型 | イベント種別 | 形式 |
|---|----------|--------------|------|
| 1 | Task | `[TASK]` | 時間指定/終日 |
| 2 | Project | `[PROJECT]` | 終日 |
| 3 | ProjectReference | `[PROJREF]` | 終日 |
| 4 | Group | `[GROUP]` | 終日 |
| 5 | DailyTemplate | `[TEMPLATE]` | 終日 |
| 6 | FixedEvent | `[FIXED]` | 終日 |
| 7 | ScheduleBlock | `[BLOCK]` | 時間指定 |
| 8 | SessionRecord | `[SESSION]` | 時間指定 |
| 9 | Stats | `[STATS]` | 終日（日次） |
| 10 | Config | `[CONFIG]` | 終日（最新） |
| 11 | ProfilePack | `[PROFILE]` | 終日 |
| 12 | ProfileBackup | `[PROFBACKUP]` | 終日 |
| 13 | ProfilePerformance | `[PROFPERF]` | 終日（週次） |
| 14 | OperationLogRow | `[OPLOG]` | 終日 |

### Event Format

```json
{
  "summary": "[TASK] Implement OAuth sync",
  "start": { "date": "2024-01-15" },
  "end": { "date": "2024-01-16" },
  "description": "{...JSON data...}",
  "extendedProperties": {
    "private": {
      "pomodoroom_type": "task",
      "pomodoroom_id": "task-abc-123",
      "pomodoroom_version": "1",
      "pomodoroom_updated": "2024-01-15T10:30:00Z"
    }
  }
}
```

## Sync Engine

### 頻繁更新への対応

| 問題 | 解決策 |
|------|--------|
| APIレート制限 | バッチ処理（10アイテム or 30秒） |
| 過剰な更新 | デバウンス（3秒集約） |
| コンフリクト増加 | 時間戳ベース判定 |
| オフライン更新 | ローカルキュー |
| 差分転送量 | 変更フィールドのみ |

### 同期フロー

```
起動時     → 即時プル
手動同期   → 即時双方向同期
自動同期   → オンライン検出時30秒後
定期同期   → 5分ごと（変更があれば）
```

## Conflict Resolution

### コンフリクトパターン

| パターン | 解決策 |
|----------|--------|
| ローカルのみ更新 | ローカルをカレンダーへ上書き |
| リモートのみ更新 | リモートをローカルへ適用 |
| 同時更新 | 各フィールドLWW or マージ |
| 削除競合 | 削除優先 |
| 設定競合 | LWW（最新勝ち） |

### State Merge

```
DONE > RUNNING > PAUSED > READY
```

## Implementation Plan

### Milestones

| フェーズ | 目的 | 優先度 |
|----------|------|--------|
| M0: Foundation | インフラ整備 | P0 |
| M1: Read Path | リモート → ローカル | P0 |
| M2: Write Path | ローカル → リモート | P0 |
| M3: Conflict | コンフリクト解決 | P1 |
| M4: Polish | UX向上 | P2 |

### New File Structure

```
crates/pomodoroom-core/src/sync/
├── mod.rs              # 公開インターフェース
├── calendar_client.rs  # Google Calendar API ラッパー
├── event_codec.rs      # Event ↔ データ型 変換
├── device_id.rs        # デバイスID管理
└── types.rs            # 同步関連の型定義
```

## Risks

| リスク | 軽減策 |
|--------|--------|
| Google API レート制限 | バッチ処理、指数バックオフ |
| イベントサイズ制限 | 説明欄圧縮 |
| オフライン期間長 | 増分同期 |
| コンフリクト爆発 | 自動マージ強化 |
| カレンダー混在 | 専用カレンダー分離 |
