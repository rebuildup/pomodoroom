# Pomodoroom v2 再構築 — Claude Code チーム連携プロンプト

> **このドキュメントは claude-code エージェントに渡す指示書です。**
> issue 単位で作業する際に、毎回このプロンプトを先頭に含めてください。

---

## 🚨 最重要コンテキスト：なぜ再構築が必要か

前回の issue 群を消化した結果、以下の **致命的ギャップ** が残った：

1. **全 UI がモックデータで動いている** — `useTaskState` / `useTaskStateMap` が実装済みだが ShellView から一切接続されていない
2. **タイマーとタスク状態遷移が独立** — `useTauriTimer` はタイマーのみ制御。「タスクを開始 → タイマースタート → 完了 → タスク DONE」のフローが未実装
3. **NowHub / Anchor にタスク操作ボタンがない** — Play/Pause/Skip のみ。仕様が要求する「完了」「延長」「中断」「先送り」が欠落
4. **Anchor/Ambient モデルが UI に反映されていない** — 仕様の中核概念が未実装
5. **TaskBoard のコールバックが未バインド** — `onTaskStateChange` が ShellView から渡されていない
6. **Pressure モデルが UI 未接続** — 計算ロジックも自動モード遷移も未実装

---

## 📐 アプリケーション設計原則

### コアコンセプト：3種のタスク分類

| 分類 | 定義 | 数 |
|------|------|-----|
| **Anchor** | 今この瞬間に最も注意を向けるべき作業 | 最大1つ |
| **Ambient** | 待機状態だが裏で進行している意識があるタスク | 複数 |
| **Passive** | SNS・動画など作業の合間に挿入されがちな非生産行動 | 記録のみ |

### タスク状態遷移（厳格に守ること）

```
          開始            完了
READY ─────────> RUNNING ─────────> DONE
  ^     先送り      |    延長(タイマーリセット)
  |   (優先度下げ)  |       ↓
  |                 +───> RUNNING
  |     中断
  |      |
  |      v       再開
  |   PAUSED ─────────> RUNNING
  |
  +----- (初期状態 / タスク作成時)
```

- `RUNNING` タスクは常に最大 **1つ** = これが **Anchor**
- `PAUSED` タスク群 = これが **Ambient**
- 不正遷移は `throw InvalidTransitionError`（`types/task-state.ts` に定義済み）

### 操作→状態遷移マッピング

| 操作 | 遷移 | UIからの実行箇所 |
|------|------|------------------|
| 開始 | READY → RUNNING | NowHub / TaskBoard / NextTaskCandidates |
| 完了 | RUNNING → DONE | NowHub / TaskBoard / Anchor |
| 延長 | RUNNING → RUNNING (タイマーリセット) | NowHub / TaskBoard / Anchor |
| 中断 | RUNNING → PAUSED | NowHub / TaskBoard / Anchor |
| 再開 | PAUSED → RUNNING | NowHub / TaskBoard / Anchor |
| 先送り | READY → READY (優先度下げ) | NowHub / NextTaskCandidates |

---

## 🏗️ アーキテクチャ制約

### 既存コードの活用（捨てずに接続する）

以下は **実装済みだが未接続** のモジュール。新規作成ではなく **接続** が必要：

| モジュール | ファイル | 状態 |
|-----------|---------|------|
| タスク状態管理 | `hooks/useTaskState.ts` | ✅ 完成・未接続 |
| 状態遷移モデル | `types/task-state.ts` | ✅ 完成・未接続 |
| スケジューラ | `hooks/useScheduler.ts` | ✅ 完成・未接続 |
| Pressure 型 | `types/pressure.ts` | ✅ 完成・未接続 |
| タスク提案ロジック | `m3/NextTaskCandidates.tsx` | ✅ ロジック完成・モックデータ |

### ディレクトリルール

```
src/components/m3/    ← 全ての新UI（M3コンポーネント）
src/hooks/            ← ビジネスロジックフック  
src/types/            ← 型定義（変更は慎重に）
src/views/            ← ページレベルのビュー
```

### 技術スタック（変更不可）

- React 19 + TypeScript 5 + Vite 7
- Tailwind CSS v4（`@import "tailwindcss"`）
- Tauri 2.x（デスクトップ）
- Material 3 デザイン準拠

### スタイルルール

- Material 3 カラートークン準拠（`index.css` に定義済み）
- **文字色への色使用を極力排除**（白/黒/グレー系のみ）
- グラデーション、影、ホバーアニメーションを **制限**
- 動きは状態遷移に紐づく **明示的な意味を持つもののみ**

---

## 📋 Phase 構成と依存関係

```
Phase 0: データ層接続（全UIの土台）
    ↓
Phase 1: Timer/Dashboard（メイン体験）
    ↓
Phase 2: TaskBoard（タスク準備画面）
    ↓  
Phase 3: Schedule（スケジュール画面）  
    ↓
Phase 4: Stats（統計画面）
    ↓
Phase 5: Settings + Floating UI（仕上げ）
```

**禁止**: Phase N+1 の issue に着手する前に Phase N の全 issue が完了していること。

---

## ⚠️ 作業時の絶対ルール

### DO（必ずやること）

1. **issue 着手前に `CLAUDE.md` と `docs/ui-redesign-strategy.md` を読む**
2. **既存の型定義 (`types/task-state.ts`) を変更せず使う** — 遷移モデルは確定済み
3. **`useTaskStateMap` を ShellView のタスク状態管理に使う**
4. **タイマー操作時に必ずタスク状態遷移も実行する**
5. **各 issue 完了時にビルド確認** (`pnpm run build` がエラーなし)
6. **コンポーネントの props は既存の型を拡張、不要な新型を作らない**

### DON'T（絶対やらないこと）

1. **モックデータでUIを埋めない** — 実データに接続するか、空状態を正しく表示する
2. **`types/task-state.ts` の遷移ルールを変更しない**
3. **新しい状態管理ライブラリを追加しない**（useState + useReducer + カスタムフック）
4. **Phase を飛ばして先の機能を実装しない**
5. **1 issue で複数の Phase にまたがる変更をしない**
6. **UI刷新より先にスケジューラ高度化に突っ込まない**

---

## 🔍 検証チェックリスト（各 issue 完了時）

```
□ pnpm run build がエラーなしで完了する
□ pnpm run test がパスする（既存テストが壊れていない）
□ 変更したコンポーネントが実データ（または正しい空状態）で動作する
□ タスク状態遷移が types/task-state.ts の VALID_TRANSITIONS に準拠している
□ Material 3 の色・タイポグラフィルールに従っている
□ console.error / console.warn が新たに出ていない
```

---

## 📁 主要ファイルマップ

```
src/views/ShellView.tsx          ← アプリ全体のオーケストレーター（要改修の中心）
src/components/m3/NowHub.tsx     ← タイマー+Anchor表示（要改修）
src/components/m3/TaskBoard.tsx  ← タスクボード（要改修）
src/components/m3/Anchor.tsx     ← フローティングタイマー（要改修）
src/components/m3/TaskCard.tsx   ← タスクカード（要改修）
src/components/m3/TimerControls.tsx ← タイマー操作ボタン（要拡張）
src/components/m3/NextTaskCandidates.tsx ← 次タスク提案（要接続）
src/hooks/useTaskState.ts        ← タスク状態管理（接続のみ）
src/hooks/useTauriTimer.ts       ← タイマーフック（接続のみ）
src/hooks/useScheduler.ts        ← スケジューラ（接続のみ）
src/types/task-state.ts          ← 状態遷移定義（変更不可）
src/types/pressure.ts            ← Pressure型定義（参照）
```
