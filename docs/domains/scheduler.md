# Scheduler Agent 仕様書

> **上位規範:** [CORE_POLICY.md](file:///c:/Users/rebui/Desktop/pomodoroom/CORE_POLICY.md)
> **役割定義:** [AGENTS.md](file:///c:/Users/rebui/Desktop/pomodoroom/AGENTS.md) §1.2
> **技術詳細:** [CLAUDE.md](file:///c:/Users/rebui/Desktop/pomodoroom/CLAUDE.md)

---

## 1. 責務の境界

### やること

- 日次スケジュールの自動生成
- スケジュールの動的再計算（トリガー条件に基づく）
- Pressure値の算出とモード遷移判定
- 次タスク候補の選定と理由付け（最大2〜3件）
- タスク優先度のスコアリング
- 休憩の配置ロジック
- コンテキストスイッチコストの最小化

### やらないこと

- UIの表示・レンダリング（→ UI/Dialog Agent）
- Google Calendar との通信（→ Integrator Agent）
- ユーザー入力の受付（→ UI/Dialog Agent）
- OAuth認証（→ Integrator Agent）

---

## 2. Pressure モデル — 数理的定義

### 2.1 基本計算式

```
Pressure(t) = remaining_work(t) − remaining_capacity(t)
```

**remaining_work(t):**
```
remaining_work = Σ (task.estimated_minutes − task.elapsed_minutes)
                 for task in tasks
                 where task.state ∈ {ready, running, paused}
                   AND task.category = 'active'
```

**remaining_capacity(t):**
```
remaining_capacity = (sleep_time − current_time)
                   − Σ fixed_event.duration
                   − estimated_break_time
```

- `sleep_time`: DailyTemplate の `sleep` フィールド（デフォルト 23:00）
- `fixed_event.duration`: 固定予定の合計時間
- `estimated_break_time`: 残りのフォーカスセッション数 × 平均休憩時間

### 2.2 正規化

実用上、rawなPressure値を正規化して扱う:

```
normalized_pressure = Pressure(t) / remaining_capacity(t)
```

- `normalized_pressure ≤ 0.0`: Normal モード
- `0.0 < normalized_pressure ≤ 0.5`: Pressure モード
- `normalized_pressure > 0.5`: Overload モード

> [!IMPORTANT]
> 閾値 `0.5` は初期値。`crates/pomodoroom-core/src/bayesian_tuner.rs` のベイジアンチューニングにより、ユーザーの実績データに基づいて動的に調整される。

### 2.3 Pressure が介入にどう影響するか

**Pressure は「介入（通知）の頻度と強さを決定する動的パラメータ」である。**

| モード | Active空白時の介入 | Floating許可 | 次タスク提案の強さ |
|--------|-------------------|-------------|-------------------|
| Normal | 5分後にソフト提案 | ✅ 許可 | 提案型（選択可能） |
| Pressure | 1分後に催促 | ❌ 禁止 | 催促型（強く推奨） |
| Overload | 30秒後に警告 | ❌ 禁止 | 警告型 + タスク削減提案 |

**Pressureが高い場合のシステム挙動:**
1. Floating タスクへの逃避を禁止
2. Active への復帰をより強力に、かつ高頻度に促す
3. Overload 時はタスクの削減・延期を積極的に提案

### 2.4 再計算トリガー

以下のイベントが発生した時、Pressure を再計算する:

| トリガー | 発生源 |
|----------|--------|
| タスクの状態変更（開始/完了/中断/再開） | UI/Dialog |
| タスクの追加/削除 | UI/Dialog |
| タスクの見積もり変更 | UI/Dialog |
| 固定予定の追加/変更 | Integrator（Calendar同期） |
| 時間経過（5分ごと） | タイマー |
| Google Calendar からの同期完了 | Integrator |

---

## 3. スケジュール生成アルゴリズム

### 3.1 入力

| データ | ソース |
|--------|--------|
| DailyTemplate | `daily_template` テーブル |
| タスク一覧 | `tasks` テーブル（state ≠ done） |
| カレンダーイベント | Google Calendar（Integrator経由） |
| 現在時刻 | システム |

### 3.2 出力

```rust
pub struct ScheduledBlock {
    pub id: String,
    pub block_type: BlockType,    // focus, break, routine, calendar
    pub task_id: Option<String>,
    pub start_time: DateTime,
    pub end_time: DateTime,
    pub locked: bool,             // ユーザー固定 or 自動
    pub label: Option<String>,
    pub lane: Option<i32>,
}
```

### 3.3 生成ステップ

```
1. DailyTemplate から時間枠を生成（wake_up 〜 sleep）
2. 固定予定（fixed_events + Calendar events）を配置 → locked = true
3. 空きスロットを特定
4. タスクを優先度スコア順にソート
5. 各空きスロットにタスクを割り当て
   - Active候補 = 最高スコアのタスク
   - Floating候補 = 低負荷タスク（短時間スロット向け）
6. 休憩を挿入（Progressive Schedule or カスタム）
7. Pressure を計算し、モードを判定
```

### 3.4 タスク優先度スコアリング

```
score = base_priority
      + deadline_urgency_bonus    // デッドライン近いほど加点
      + context_continuity_bonus  // 前タスクと同グループなら加点
      − energy_mismatch_penalty   // 現在のエネルギーと不一致なら減点
      + paused_resume_bonus       // 中断中タスクは少し加点（コンテキスト維持）
```

---

## 4. コンテキストの数理モデル

### 4.1 自動記録されるコンテキスト

タスクが中断される際、Scheduler は以下を**自動で**記録する（ユーザー入力不要）:

```rust
pub struct PauseContext {
    pub task_id: String,
    pub pause_reason: PauseReason,        // 自動分類
    pub elapsed_at_pause: i32,            // 中断時の経過時間（分）
    pub paused_at: DateTime,
    pub operation_history: OperationLog,  // 操作履歴
}

pub struct OperationLog {
    pub start_count: u32,       // 開始回数
    pub pause_count: u32,       // 中断回数
    pub extend_count: u32,      // 延長回数
    pub postpone_count: u32,    // 先送り回数
    pub first_started_at: DateTime,
}

pub enum PauseReason {
    UserInitiated,           // ユーザーが手動で中断
    ExternalBlock,           // 外部要因（Wait状態）
    HigherPriorityPreempt,   // より高優先度のタスクに割り込まれた
    ScheduledBreak,          // 休憩時間に到達
}
```

### 4.2 再開時のコンテキスト再構成

再開時、Scheduler は UI/Dialog Agent に以下を提供する。
コンテキストはメタデータと関係性から**数理的に導出**される:

```rust
pub struct ResumeContext {
    pub task: Task,
    pub time_since_pause: Duration,
    pub pause_reason: PauseReason,
    pub remaining_estimate: i32,       // 残り見積もり（分）
    pub operation_history: OperationLog,
    pub related_tasks: Vec<TaskRelation>, // 同一プロジェクト・同一タグのタスク
    pub tag_context: TagContext,        // タグの共起関係から導出した文脈
}

pub struct TagContext {
    pub co_occurring_tags: Vec<(String, f32)>,  // 共起タグと相関度
    pub project_affinity: f32,                   // プロジェクトとの親和性
}
```

---

## 5. 関連ファイル一覧

| ファイル | 役割 |
|----------|------|
| `crates/pomodoroom-core/src/scheduler/mod.rs` | スケジューラのエントリポイント |
| `crates/pomodoroom-core/src/scheduler/auto_fill.rs` | 自動スロット埋め |
| `crates/pomodoroom-core/src/scoring.rs` | タスク優先度スコアリング |
| `crates/pomodoroom-core/src/focus_windows.rs` | フォーカスウインドウ計算 |
| `crates/pomodoroom-core/src/long_break_placement.rs` | 長休憩配置ロジック |
| `crates/pomodoroom-core/src/context_switch.rs` | コンテキストスイッチコスト |
| `crates/pomodoroom-core/src/bayesian_tuner.rs` | ベイジアンパラメータチューニング |
| `crates/pomodoroom-core/src/simulation.rs` | スケジュールシミュレーション |
| `crates/pomodoroom-core/src/timer/schedule.rs` | プログレッシブスケジュール定義 |

---

## 6. テスト基準

```bash
# 全テスト実行
cargo test -p pomodoroom-core

# スケジューラ関連のみ
cargo test -p pomodoroom-core scheduler
cargo test -p pomodoroom-core scoring
```

**テストすべき境界条件:**
- タスクが0件の場合のスケジュール生成
- 残り時間が0の場合のPressure計算（ゼロ除算回避）
- 全スロットが固定予定で埋まっている場合
- Overload → Normal へのモード復帰
- 深夜をまたぐスケジュール
