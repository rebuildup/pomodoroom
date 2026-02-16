# Issue #227 Break Debt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** スヌーズ/スキップされた休憩を break debt として記録し、次回以降の休憩に返済分を上乗せしつつ、UI に残高を表示する。

**Architecture:** フロントエンドに小さな `break-debt-policy` ユーティリティを追加し、ActionNotification の操作イベント（skip/extend）で負債を加算、休憩通知表示時に返済を計算して残高を更新する。永続化は `localStorage` を使い、返済上限は `maxBreakMinutes` でクランプする。

**Tech Stack:** TypeScript, Vitest, React (ActionNotificationView)

---

### Task 1: Break Debt モデルを TDD で追加

**Files:**
- Create: `src/utils/break-debt-policy.ts`
- Test: `src/utils/break-debt-policy.test.ts`

**Step 1: Write failing tests**
- debt 加算（skip/snooze）
- 次回休憩で返済（上限 cap を超えない）
- 準拠サイクルで debt 減衰
- localStorage 永続化ロード/セーブ

**Step 2: Run tests to verify failures**
- `pnpm vitest run src/utils/break-debt-policy.test.ts`

**Step 3: Implement minimal policy**
- `accrueBreakDebt`
- `applyBreakRepayment`
- `decayBreakDebt`
- `loadBreakDebtState` / `saveBreakDebtState`

**Step 4: Run tests to verify pass**
- `pnpm vitest run src/utils/break-debt-policy.test.ts`

### Task 2: ActionNotificationView へ統合

**Files:**
- Modify: `src/views/ActionNotificationView.tsx`

**Step 1: Integrate debt read/repay on break notification render**
- 休憩通知表示時に返済候補を計算
- 返済後の debt を保存
- 表示 break 分に repayment を反映

**Step 2: Integrate debt accrual on skip/extend for break deferral**
- `skip` または break 通知上の `extend` 実行時に debt 加算

**Step 3: Show debt balance in UI**
- ActionNotificationView に `休憩負債: Xm` を表示

### Task 3: Verification

**Files:**
- Modify if needed: `src/views/ActionNotificationView.tsx`
- Test: existing test suite subsets

**Step 1: Run focused tests**
- `pnpm vitest run src/utils/break-debt-policy.test.ts`

**Step 2: Run project checks required by autopilot**
- `pnpm run check`
- `cargo test -p pomodoroom-core`
- `cargo test -p pomodoroom-cli -- --test-threads=1`
