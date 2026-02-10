# Pomodoroom UI再定義 設計方針書

> このドキュメントは、UI再定義プロジェクトの設計意図・用語・移行戦略を
> 一元化したものです。個別issueの背景と全体像を接続します。

## 1. 設計目標

**Google公式アプリに近い操作体験**を実現する。
具体的には Material 3 (Material You) をデザイン基準とし、
アイコン・色・タイポグラフィ・コンポーネントを統一する。

### 優先順位（不変）
1. UI基盤（テーマ / アイコン / 基礎コンポーネント）
2. App Shell（画面骨格）
3. メイン画面コンポーネント
4. フローティング+ボード操作導線
5. スケジューラ高度化・AI（UI刷新完了後）

**禁止**: UI刷新より先にスケジューラ高度化に突っ込むこと。

---

## 2. 用語規約

### 廃止語 → 置換語
| 廃止 | 置換 | 理由 |
|------|------|------|
| 遅延 (Delay) | **Pressure** | 「常に遅れてる」感を出さず「負荷がどれだけ乗ってるか」で提示する |
| 遅延モード | **Pressure Mode / Overload Mode** | 同上 |

### 固定用語（英語のまま使用）
以下は業界標準・固有名詞のため日本語化しない:
- **Material 3 / M3** — Google のデザインシステム名
- **Anchor** — フローティングコントロールの概念名
- **Pressure** — 当プロジェクト固有の負荷指標名
- **effectiveTags** — 3ソース統合タグの技術用語

### タグ語彙（15個固定）
```
deep, shallow, admin, communication, review,
blocked, waiting, async, interrupt, resume,
scope, timebox, routine, quickwin, maintenance
```

---

## 3. タスク状態遷移モデル

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

### 操作一覧
| 操作 | 遷移 | 実行可能箇所 |
|------|------|-------------|
| 開始 | READY → RUNNING | Anchor / ボード / 候補カード |
| 先送り | READY → READY (優先度下げ) | Anchor / 候補カード |
| 完了 | RUNNING → DONE | Anchor / ボード |
| 延長 | RUNNING → RUNNING (タイマーリセット) | Anchor / ボード |
| 中断 | RUNNING → PAUSED | Anchor / ボード |
| 再開 | PAUSED → RUNNING | Anchor / ボード |

**不正遷移（例: DONE → RUNNING）は throw する。**

---

## 4. Pressure モデル

```
Backlog Pressure = remaining_work - remaining_capacity
```

- `remaining_work`: READY + RUNNING タスクの見積もり合計
- `remaining_capacity`: 本日の残り時間 − 固定予定 − 休憩

### 自動モード遷移
- Pressure ≤ 0 → **Normal Mode**（余裕あり）
- Pressure > 0 → **Pressure Mode**（負荷超過）
- Pressure >> 閾値 → **Overload Mode**（破綻）

**遷移はユーザーに選ばせない（自動）。**

---

## 5. Project / Group / Tag 構造

```
Project (name, defaultTags, color)
  └── Group の一種になり得る
Group
  └── Project が Group を兼ねる場合がある
Task
  ├── project: Project | null  ← null許可
  ├── group: Group | null
  ├── manualTags: Tag[]
  ├── suggestedTags: Tag[]     ← 承認制
  └── effectiveTags = union(project.defaultTags, manualTags, suggestedTags)
```

### タグの3ソース
1. **プロジェクト由来** (`project.defaultTags`)
2. **手動付与**
3. **サジェスト承認**（状態変化時に再提案、承認制・無視可能）

### サジェスト制御（固定値）
- 最大提示: 3件
- 表示時間: 4秒
- クールダウン: 15秒

---

## 6. 次タスク候補の提示

- 提示件数: **2〜3件**（超えない）
- 各候補に **短い理由 (why) を必ず添える**
  - 例: 「中断中」「同グループ文脈継続」「固定予定まで短いので短時間候補」
- 多数提示してユーザーに選択責任を返す → **禁止**

---

## 7. 旧UI → 新UI 移行戦略

### ディレクトリ構成
```
src/components/        ← 旧コンポーネント（移行完了後に削除）
src/components/m3/     ← 新M3コンポーネント
```

### 移行フェーズ

#### Phase 1: 共存期間
- 新コンポーネントを `m3/` に並行実装
- 旧コンポーネントはそのまま維持
- 画面単位で段階的に新UIに切替

#### Phase 2: 切替
- 全画面が新Shell/新コンポーネントで動作確認
- `App.tsx` のルート構造を新Shellに切替

#### Phase 3: クリーンアップ
- 旧コンポーネントファイルの削除
- `grep -r` で import 残存チェック
- package.json から不要な依存（lucide-react等）を除去

### 置換マッピング
| 旧コンポーネント | 新コンポーネント | 移行先 |
|-----------------|-----------------|--------|
| `Dock.tsx` | Navigation Rail (App Shell) | M1 |
| `AccordionGroup.tsx` | App Shell パネル構造 | M1 |
| `TitleBar.tsx` | Top App Bar | M1 |
| `PomodoroTimer.tsx` | Now Hub タイマー | M2 |
| `MiniTimer.tsx` | Anchor フローティング | M3 |
| `NowHub.tsx` | m3/NowHub.tsx | M2 |
| `FocusHub.tsx` | Now Hub に吸収 | M2 |
| `TaskBoard.tsx` | m3/TaskBoard.tsx | M2 |
| `TaskStream.tsx` | タスクボードに統合 | M2 |
| `BoardPanel.tsx` | タスクボードに吸収 | M2 |
| `TaskPool.tsx` | フィルタ機能として統合 | M2 |
| `TaskDetailDrawer.tsx` | m3/TaskDetailDrawer.tsx | M2 |
| `NextTaskCard.tsx` | m3/NextTaskCandidates.tsx | M2 |
| `TimelineView.tsx` | m3/TimelineView.tsx | M2 |

### 共存期間の制約
- 旧/新どちらからもタスク操作が動作すること
- 状態遷移は core-model (#105) 経由で統一されるため、UI層のみの差し替えで済む

---

## 8. マイルストーン概要

| MS | 名称 | 目標 | Issue範囲 |
|----|------|------|-----------|
| M0 | UI Foundation | M3トークン・アイコン・基礎コンポーネント確立 | #99〜#101 |
| M1 | App Shell | 画面骨格・Pressure概念・状態遷移モデル確立 | #102〜#105 |
| M2 | Main Screen Components | 主要画面コンポーネント・旧UI完全置換 | #106〜#113 |
| M3 | Floating + Board Control | 操作導線完成・サジェスト機能 | #114〜#117 |

### M0完了後に手が付けられるもの
- M1 App Shell（M0のトークン・コンポーネントが前提）
- #104 用語統一（M0と並行可能）
- #105 状態遷移モデル（UIに依存しない）

### M1完了後に手が付けられるもの
- M2 全コンポーネント（ShellとトークンとモデルがあればUI構築可能）

### M2完了後に手が付けられるもの
- M3 フローティング + ダイアログ + サジェスト

---

## 9. 禁止事項（破綻防止）

1. 「重なり許容」なのに「遅延（Delay）」表記で押し切る
2. 次候補を多数提示してユーザーに選択責任を返す
3. タグ提案を強制承認にする
4. UI刷新より先にスケジューラ高度化に突っ込む
5. レーン運用（カンバン風）に戻す
6. 延長に上限を設ける
