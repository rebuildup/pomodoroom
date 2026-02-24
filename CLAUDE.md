# CLAUDE.md

> **❗ 最初に [CORE_POLICY.md](file:///c:/Users/rebui/Desktop/pomodoroom/CORE_POLICY.md) を読むこと。**
> 本プロジェクトの思想・原則・絶対ルールが定義されている。
> これを読まずに実装を始めてはならない。
>
> **運用規定:** [AGENTS.md](file:///c:/Users/rebui/Desktop/pomodoroom/AGENTS.md) — 役割分担・開発プロトコル
> **担当ドメイン仕様:** `docs/domains/` 配下の各仕様書

本文書は **技術実装の詳細** に特化した環境設定ドキュメントである。
思想・原則については CORE_POLICY.md、役割分担については AGENTS.md を参照すること。

---

## Project Overview

Pomodoroom は CLI ファーストのタスク管理・集中支援システム。
Rust コアライブラリ（pomodoroom-core）にすべてのビジネスロジックを実装し、
CLI バイナリと Tauri デスクトップアプリの両方から同一のコアを利用する。

**Tech Stack:**
- Core: Rust (pomodoroom-core library)
- CLI: Rust + clap (pomodoroom-cli binary)
- Desktop: Tauri 2.x (pomodoroom-desktop)
- Frontend: React 19 + TypeScript 5 + Vite 7
- Styling: Tailwind CSS v4 (`@import "tailwindcss"`)
- Storage: SQLite (ローカルDB) + Google Calendar (リモートDB)
- Config: TOML (`~/.pomodoroom/config.toml`)
- Secrets: OS Keyring (OAuth tokens)

---

## Cargo Workspace

```
Cargo.toml                     # [workspace] root
crates/
  pomodoroom-core/             # Library: engine, storage, integrations, scheduler
  pomodoroom-cli/              # Binary: standalone CLI
src-tauri/                     # Binary: Tauri desktop GUI
  src/
    main.rs                    # Entry point + plugin init
    bridge.rs                  # Tauri commands wrapping core (timer, config, stats)
    schedule_commands.rs       # Task/project/schedule commands
    integration_commands.rs    # Integration commands
    window.rs                  # PureRef-style window management
    tray.rs                    # System tray with context menu
```

---

## Frontend Structure

```
src/
  main.tsx                     # Entry point, window routing
  App.tsx                      # Root component
  components/
    m3/                        # ← 全ての新 M3 コンポーネント
  views/                       # ページレベルのビュー
    ShellView.tsx              #   メイン画面
    MiniTimerView.tsx          #   フロートタイマー (280x280)
    StatsView.tsx              #   統計ダッシュボード
    SettingsView.tsx           #   設定
  hooks/                       # React hooks (状態管理・API連携)
  types/                       # TypeScript 型定義
  utils/                       # ユーティリティ関数
  lib/                         # 共有ライブラリ
  stores/                      # 状態ストア
  index.css                    # M3 デザイントークン (CSS Custom Properties)
```

Window routing: `getCurrentWindow().label` determines which view renders.

---

## Core Library Structure

```
crates/pomodoroom-core/src/
  lib.rs                       # エントリポイント
  error.rs                     # エラー型定義
  events.rs                    # イベント型定義
  timer/
    engine.rs                  # タイマーステートマシン
    schedule.rs                # プログレッシブスケジュール
  task/                        # タスク状態マシン
  storage/
    database.rs                # SQLite (ローカルキャッシュ)
    config.rs                  # TOML設定管理
  scheduler/                   # 自動スケジューリング
  scoring.rs                   # タスク優先度スコアリング
  integrations/                # 外部サービス統合
  sync/                        # Google Calendar 双方向同期
  calendar/                    # カレンダーデータ操作
  focus_windows.rs             # フォーカスウインドウ計算
  bayesian_tuner.rs            # ベイジアンパラメータ調整
```

---

## Common Commands

### Development

```bash
# Build all Rust crates (core + cli + desktop)
cargo build

# Run CLI commands
cargo run -p pomodoroom-cli -- timer status
cargo run -p pomodoroom-cli -- config list
cargo run -p pomodoroom-cli -- schedule list
cargo run -p pomodoroom-cli -- task list

# Start Tauri development mode (frontend + desktop app)
pnpm run tauri:dev

# Run core tests
cargo test -p pomodoroom-core

# Run frontend build check
pnpm run build
```

### Building

```bash
# Build frontend only
pnpm run build

# Build Tauri application for production
pnpm run tauri:build
```

---

## Coding Conventions

### Rust

- エラーは `crates/pomodoroom-core/src/error.rs` の型を使用
- 新しい IPC コマンドは `#[tauri::command]` で `bridge.rs` or `schedule_commands.rs` に追加
- コマンド追加時は `src-tauri/capabilities/default.json` も更新
- テスト: `cargo test -p pomodoroom-core` を必ず通す

### TypeScript / React

- React 19 + TypeScript strict
- アイコン: **Material Symbols** のみ（lucide-react は禁止）
- アニメーション: `motion` ライブラリ
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`
- 新コンポーネントは `src/components/m3/` に配置
- 既存の型定義 (`src/types/`) は慎重に変更

### Styling

- Tailwind CSS v4 (`@import "tailwindcss"`)
- M3 デザイントークン: CSS Custom Properties (`--md-sys-color-*`)
- 文字色は白/黒/グレー系のみ（色を文字に使わない）
- `@apply` の多用は避ける
- ダークモード: `dark:` バリアント

### 用語（厳守）

| NG | OK |
|----|----|
| Delay / 遅延 | **Pressure** |
| 遅延モード | **Pressure Mode / Overload Mode** |
| Anchor | **Active** |
| Ambient | **Wait / Floating** |
| Passive | （使わない） |

---

## Development Workflow

```
1. CORE_POLICY.md を読む
2. AGENTS.md で自分の役割を確認
3. 担当ドメインの仕様書を読む (docs/domains/*.md)
4. crates/pomodoroom-core/ にロジックを追加
5. crates/pomodoroom-cli/ でCLI公開
6. src-tauri/src/bridge.rs でTauriブリッジ
7. src/components/m3/ でReact UI構築
8. cargo test -p pomodoroom-core && pnpm run build
```

---

## Timer Engine

Wall-clock-based state machine (`now_ms()`, no internal threads):
1. `engine.start()` → Running
2. `engine.tick()` → periodic update (frontend: `setInterval`)
3. `engine.pause()` / `engine.resume()` / `engine.skip()` / `engine.reset()`

State transitions: `Idle → Running → (Paused | Completed) → Idle`

---

## Key Reference Documents

| ドキュメント | 内容 |
|---|---|
| [CORE_POLICY.md](file:///c:/Users/rebui/Desktop/pomodoroom/CORE_POLICY.md) | 思想・原則・絶対ルール |
| [AGENTS.md](file:///c:/Users/rebui/Desktop/pomodoroom/AGENTS.md) | 役割分担・開発プロトコル |
| [docs/domains/scheduler.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/domains/scheduler.md) | Scheduler仕様 |
| [docs/domains/ui-dialog.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/domains/ui-dialog.md) | UI/Dialog仕様 |
| [docs/domains/integrator.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/domains/integrator.md) | Integrator仕様 |
| [docs/ARCHITECTURE.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/ARCHITECTURE.md) | アーキテクチャ詳細 |
| [docs/DATA_MODEL.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/DATA_MODEL.md) | データモデル詳細 |
| [docs/CLI_REFERENCE.md](file:///c:/Users/rebui/Desktop/pomodoroom/docs/CLI_REFERENCE.md) | CLIコマンドリファレンス |

---

## Troubleshooting (Windows)

### Process won't die
```powershell
taskkill /F /IM pomodoroom-desktop.exe
taskkill /F /IM cargo.exe
taskkill /F /IM rustc.exe
```

### Port 1420 in use
```powershell
netstat -ano | findstr :1420
taskkill /F /PID <PID>
```
