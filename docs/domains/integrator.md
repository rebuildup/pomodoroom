# Integrator Agent 仕様書

> **上位規範:** [CORE_POLICY.md](file:///c:/Users/rebui/Desktop/pomodoroom/CORE_POLICY.md)
> **役割定義:** [AGENTS.md](file:///c:/Users/rebui/Desktop/pomodoroom/AGENTS.md) §1.4
> **技術詳細:** [CLAUDE.md](file:///c:/Users/rebui/Desktop/pomodoroom/CLAUDE.md)
> **データモデル:** [docs/DATA_MODEL.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/DATA_MODEL.md)

---

## 1. 責務の境界

### やること

- Google Calendar との双方向同期
- SQLite ↔ Calendar イベントのデータマッピング
- OAuth認証フローの管理
- コンフリクト検出（解決はUI/Dialog Agentに委譲）
- オフライン時のキューイングと復帰時の一括同期
- データ整合性の保証

### やらないこと

- スケジュール計算・タスク優先度判定（→ Scheduler Agent）
- UIの表示・ダイアログの描画（→ UI/Dialog Agent）
- Pressure値の算出（→ Scheduler Agent）

---

## 2. 同期モデル

### 2.1 データフロー

```
┌─────────────┐                    ┌──────────────────┐
│   SQLite     │                    │ Google Calendar  │
│ (ローカルDB)  │    双方向同期       │ (リモートDB)     │
│              │ ◀═══════════════▶  │                  │
└──────┬──────┘                    └────────┬─────────┘
       │                                    │
       │  ローカル操作                       │  他デバイス/
       │  (CLI/GUI)                         │  ブラウザ操作
       ▼                                    ▼
  ローカル変更                          リモート変更
    キュー                               検出
       │                                    │
       └──────────▶ 同期エンジン ◀───────────┘
                       │
                 コンフリクト？
                  ├─ No → 自動マージ
                  └─ Yes → UI/Dialog Agent に委譲
```

### 2.2 同期ルール

| ケース | 処理 |
|--------|------|
| ローカルのみ変更 | ローカル → リモートに push |
| リモートのみ変更 | リモート → ローカルに pull（**リモート優先**） |
| 両方変更（コンフリクト） | UI/Dialog Agent に解決を委譲 |
| オフライン中のローカル変更 | キューに蓄積 → オンライン復帰時に一括 push |

### 2.3 同期タイミング

| トリガー | 方向 |
|----------|------|
| ローカルでタスク操作 | ローカル → リモート（即座） |
| アプリ起動時 | リモート → ローカル（初回 pull） |
| 定期ポーリング（5分間隔） | リモート → ローカル |
| Google Calendar Webhook（将来） | リモート → ローカル（即座） |
| ユーザーが手動同期を実行 | 双方向 |

---

## 3. Google Calendar メタデータ設計

### 3.1 カレンダー構成

Pomodoroom 専用のカレンダーを作成し、データ管理に使用する:

| カレンダー名 | 用途 |
|---|---|
| `pomodoroom-tasks` | タスクデータの保存 |
| `pomodoroom-schedule` | スケジュールブロックの保存 |
| `pomodoroom-projects` | プロジェクト/リファレンスの保存 |

### 3.2 タスク → Calendar イベント マッピング

タスクは Google Calendar イベントとして以下のように保存する:

| Calendar フィールド | SQLite カラム | 説明 |
|---|---|---|
| `summary` | `title` | タスク名 |
| `start.dateTime` | `created_at` | 作成日時（または予定開始時刻） |
| `end.dateTime` | （計算値） | `start + estimated_minutes` |
| `status` | `state` | `confirmed`=ready/running, `cancelled`=done |
| `colorId` | `energy` | high=11(赤), medium=5(黄), low=2(緑) |
| `description` | — | **構造化JSONメタデータ**（下記参照） |
| `extendedProperties.private` | — | **機械読み取り用メタデータ**（下記参照） |

### 3.3 `description` フィールドの構造

`description` にはユーザー向けの説明と、末尾に区切り線付きでJSON メタデータを埋め込む:

```
ユーザーが入力した説明文がここに入る。
複数行可能。

───────── pomodoroom-metadata ─────────
{
  "version": 1,
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "state": "running",
  "category": "active",
  "priority": 75,
  "estimated_minutes": 90,
  "elapsed_minutes": 45,
  "completed_pomodoros": 2,
  "estimated_pomodoros": 4,
  "tags": ["deep", "review"],
  "project_id": "proj-123",
  "project_name": "Website Redesign",
  "group_name": null,
  "energy": "high",
  "pause_reason": null,
  "pressure_at_creation": 0.3
}
```

### 3.4 `extendedProperties.private` の構造

Google Calendar API の拡張属性（最大容量制限あり）で機械読み取り用のキーデータを保存:

```json
{
  "pomodoroom_version": "1",
  "pomodoroom_id": "550e8400-e29b-41d4-a716-446655440000",
  "pomodoroom_type": "task",
  "pomodoroom_state": "running",
  "pomodoroom_priority": "75",
  "pomodoroom_energy": "high",
  "pomodoroom_project": "proj-123",
  "pomodoroom_updated": "2025-01-09T12:00:00Z"
}
```

> [!IMPORTANT]
> `extendedProperties.private` の各値は**文字列のみ**（Google Calendar APIの制約）。
> 数値は文字列に変換して格納する。

### 3.5 スケジュールブロック → Calendar イベント マッピング

| Calendar フィールド | ScheduleBlock カラム | 説明 |
|---|---|---|
| `summary` | `label` or タスク名 | ブロックのラベル |
| `start.dateTime` | `start_time` | ブロック開始時刻 |
| `end.dateTime` | `end_time` | ブロック終了時刻 |
| `colorId` | `block_type` | focus=9(青), break=2(緑), routine=5(黄) |
| `extendedProperties.private.pomodoroom_type` | — | `"schedule_block"` |
| `extendedProperties.private.pomodoroom_block_type` | `block_type` | `"focus"`, `"break"`, etc. |
| `extendedProperties.private.pomodoroom_task_id` | `task_id` | 関連タスクID |
| `extendedProperties.private.pomodoroom_locked` | `locked` | `"true"` / `"false"` |

### 3.6 プロジェクト → Calendar イベント マッピング

プロジェクトは**終日イベント**として保存:

| Calendar フィールド | Project カラム | 説明 |
|---|---|---|
| `summary` | `name` | `[PROJECT] プロジェクト名` |
| `start.date` | `created_at` | 作成日（日付のみ） |
| `end.date` | `deadline` | デッドライン（なければ作成日+365日） |
| `extendedProperties.private.pomodoroom_type` | — | `"project"` |
| `extendedProperties.private.pomodoroom_id` | `id` | プロジェクトID |

---

## 4. コンフリクト解決

### 4.1 コンフリクトの検出

コンフリクトは以下の条件で検出する:

```
同一 pomodoroom_id のデータに対し:
  ローカルの updated_at ≠ リモートの pomodoroom_updated
  AND
  ローカルにもリモートにも前回同期以降の変更がある
```

### 4.2 コンフリクト解決フロー

```
1. コンフリクトを検出
2. ConflictInfo を生成:
   - task_id
   - local_version (SQLiteのデータ)
   - remote_version (Calendarのデータ)
   - conflict_fields (どのフィールドが異なるか)
3. UI/Dialog Agent に ConflictInfo を渡す
4. ユーザーが「ローカル」or「リモート」を選択
5. 選択された方で両方を上書き
```

### 4.3 自動解決（コンフリクトを避ける）

| ケース | 自動処理 |
|--------|---------|
| 変更フィールドが異なる | 各フィールドの最新値をマージ |
| タイムスタンプがリモートの方が新しい | リモートを採用 |
| リモートで削除された | ローカルでも削除（確認ダイアログあり） |

---

## 5. OAuth認証フロー

### 5.1 認証情報の保存

```
OS Keyring
├── Service: "pomodoroom"
└── Entry: "pomodoroom-google"
    └── JSON: { accessToken, refreshToken, expiresIn, tokenType, scope }
```

### 5.2 トークンリフレッシュ

```
1. API呼び出し時に accessToken の有効期限を確認
2. 期限切れの場合:
   a. refreshToken を使って新しい accessToken を取得
   b. Keyring を更新
   c. リトライ
3. refreshToken も無効な場合:
   a. ユーザーに再認証を要求（介入ダイアログ）
```

---

## 6. エラーハンドリングとリトライ

| エラー | リトライ | フォールバック |
|--------|---------|---------------|
| ネットワークエラー | 3回、エクスポネンシャルバックオフ | オフラインキューに蓄積 |
| 認証エラー (401) | トークンリフレッシュ後に1回 | 再認証ダイアログ |
| レートリミット (429) | Retry-After ヘッダに従う | 遅延キュー |
| サーバーエラー (5xx) | 3回、エクスポネンシャルバックオフ | エラーログ + 次回同期待ち |
| データ不整合 | リトライなし | コンフリクト解決フロー起動 |

---

## 7. 関連ファイル一覧

| ファイル | 役割 |
|----------|------|
| `crates/pomodoroom-core/src/integrations/mod.rs` | Integration trait 定義 |
| `crates/pomodoroom-core/src/integrations/google_calendar.rs` | Google Calendar実装 |
| `crates/pomodoroom-core/src/sync/` | 同期エンジン |
| `crates/pomodoroom-core/src/calendar/` | カレンダーデータ操作 |
| `crates/pomodoroom-core/src/storage/database.rs` | SQLite操作 |
| `crates/pomodoroom-core/src/storage/config.rs` | TOML設定管理 |
| `crates/pomodoroom-cli/src/commands/auth.rs` | 認証CLIコマンド |
| `crates/pomodoroom-cli/src/commands/sync.rs` | 同期CLIコマンド |
| `src-tauri/src/integration_commands.rs` | Tauri統合コマンド |

---

## 8. テスト基準

```bash
# 統合テスト
cargo test -p pomodoroom-core integrations
cargo test -p pomodoroom-core sync
cargo test -p pomodoroom-core calendar

# モック付き同期テスト
cargo test -p pomodoroom-core sync -- --include-ignored
```

**テストすべきシナリオ:**
- ローカル変更 → リモート同期の正常フロー
- リモート変更 → ローカル反映の正常フロー
- コンフリクト検出の正確性
- オフライン → オンライン復帰時のキュー消化
- トークン期限切れ → リフレッシュ → リトライ
- Google Calendar API のレートリミット対応
- `description` 内のメタデータJSON のパース/生成
- `extendedProperties` の文字列変換の正確性
