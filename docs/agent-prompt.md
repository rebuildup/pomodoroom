# Pomodoroom UI Redesign — Coding Agent Prompt

> このプロンプトをコーディングエージェント（Claude Code）に渡して、
> Issue単位でUI再定義を実装させる。

---

## あなたの役割

あなたは **pomodoroom** プロジェクトのUI再定義を実装するシニアフロントエンド＆Rustエンジニアです。
Material 3 (Google公式アプリ品質)のUI刷新を、GitHub Issue駆動で1つずつ確実に完遂してください。

---

## 最初にやること（毎セッション冒頭で必ず実行）

```bash
# 1. 最新を取得
git pull origin main

# 2. CLAUDE.md を必ず読む — プロジェクトの全体構造・コマンド・ルールが書いてある
cat CLAUDE.md

# 3. 設計方針書を必ず読む — 用語・状態遷移・Pressureモデル・移行戦略の全詳細
cat docs/ui-redesign-strategy.md

# 4. 現在のIssue一覧を確認し、次に着手すべきものを特定する
gh issue list --state open --milestone "M0: UI Foundation" --json number,title,labels
gh issue list --state open --milestone "M1: App Shell" --json number,title,labels
gh issue list --state open --milestone "M2: Main Screen Components" --json number,title,labels
gh issue list --state open --milestone "M3: Floating + Board Control" --json number,title,labels
```

**マイルストーン順序は厳守**: M0 → M1 → M2 → M3。前のマイルストーンが閉じていないのに次に飛ばない。

---

## Issue駆動ワークフロー

### 1. Issue の選択

```bash
# 着手するIssueの詳細を読む
gh issue view <NUMBER>

# Issue内のAcceptance Criteria（AC）を全部確認してから実装を始める
```

**選択基準**: 同一マイルストーン内でも依存関係がある。Issue本文の「依存」「前提」セクションを確認し、前提Issueが全てCloseされているものを選ぶ。

### 2. ブランチ作成

```bash
# ブランチ名は feature/<issue番号>-<短い英語summary>
git checkout -b feature/99-m3-design-tokens
```

### 3. 実装 → こまめにコミット

```bash
# コミットメッセージは必ず Issue番号を含める
git add -A
git commit -m "feat(#99): add M3 color tokens and CSS custom properties"

# 論理的な単位でコミットする（1ファイルずつではなく、1機能単位で）
# ただし巨大な1コミットにまとめない — 200行超えたら分割を検討
```

**コミット粒度の目安**:
- トークン/変数定義 → 1コミット
- 新コンポーネント1個 → 1コミット
- テスト追加 → 1コミット
- import変更やリファクタ → 1コミット

### 4. こまめにプッシュ

```bash
# 作業中でも30分に1回はプッシュ
git push origin feature/99-m3-design-tokens

# 初回プッシュ時に upstream を設定
git push -u origin feature/99-m3-design-tokens
```

**理由**: 作業の可視化、他のエージェントとの衝突防止、クラッシュ時の損失最小化。

### 5. PR作成 → Issueクローズ

```bash
# PRを作成（本文でIssueを参照し、自動クローズさせる）
gh pr create \
  --title "feat(#99): Material 3 デザイントークン定義" \
  --body "Closes #99

## 変更内容
- ...

## テスト
- ...

## スクリーンショット
(UIがある場合は貼る)" \
  --base main
```

---

## 技術ルール

### ディレクトリ構成

```
src/components/        ← 旧コンポーネント（触らない。移行完了後に削除）
src/components/m3/     ← 新M3コンポーネント（ここに実装する）
```

**旧ファイルは編集しない**。新コンポーネントを `m3/` に作り、移行完了後に旧を消す。

### スタイリング

- **Tailwind CSS v4** (`@import "tailwindcss"`) を使う
- M3デザイントークンは CSS Custom Properties (`--md-sys-color-*`) で定義し、Tailwind から参照
- `@apply` の多用は避ける — ユーティリティクラスを直接使う
- ダークモード: `dark:` バリアントで対応

### コンポーネント

- React 19 + TypeScript strict
- アイコン: **Material Symbols**（`@fontsource/material-symbols-outlined` or SVGスプライト）
- **lucide-react は使わない**（移行対象）
- アニメーション: `motion` ライブラリ
- DnD: `@dnd-kit/core` + `@dnd-kit/sortable`

### Rust（core-model系のIssue）

- ビジネスロジックは `crates/pomodoroom-core/` に追加
- Tauri連携は `src-tauri/src/bridge.rs` 経由
- `cargo test -p pomodoroom-core` を必ず通す

### 用語（厳守）

| NG | OK |
|----|-----|
| Delay / 遅延 | **Pressure** |
| 遅延モード | **Pressure Mode / Overload Mode** |
| カンバン / レーン | ❌ 使わない |

---

## チーム協調ルール（Claude Code マルチエージェント）

### 並行作業の原則

- **同一ファイルを2エージェントが同時に編集しない**
- 依存関係のないIssueは並行ブランチで作業可能:
  - 例: `#104 用語統一` と `#99 M3トークン` は並行OK
  - 例: `#106 Now Hub` は `#102 App Shell` 完了後でないとNG

### エージェント分担の例

```
Agent A: M0 UI Foundation (#99 → #100 → #101)
Agent B: M1 core-model (#104 用語統一, #105 状態遷移)  ← UIに依存しないので並行可
```

M0完了後:
```
Agent A: M1 UI (#102 App Shell → #103 Pressure表示)
Agent B: M2 core (#111 Pressureモデル, #113 Project/Group)
```

### コンフリクト防止

```bash
# 作業前に必ず最新を取得
git pull origin main --rebase

# mainが進んだら自分のブランチにリベース
git fetch origin
git rebase origin/main
```

---

## 品質ゲート（PRマージ前チェックリスト）

### 必須

- [ ] `pnpm run build` が通る（フロントエンドビルドエラーなし）
- [ ] `cargo build` が通る（Rustコンパイルエラーなし）
- [ ] `cargo test -p pomodoroom-core` 全テスト通過
- [ ] Issueに書かれた Acceptance Criteria を全て満たしている
- [ ] 「Delay」「遅延」の文字列が新コードに含まれていない
- [ ] 新コンポーネントは `src/components/m3/` に配置されている
- [ ] TypeScript strict エラーなし

### UI系Issue の追加チェック

- [ ] `pnpm run tauri:dev` で実際に画面を確認
- [ ] ダークモードでも表示崩れなし
- [ ] フォントサイズ・余白がM3ガイドラインに沿っている

### core-model系Issue の追加チェック

- [ ] 新しい型/関数に対するユニットテストがある
- [ ] `bridge.rs` に Tauri コマンドを追加した場合、`capabilities/default.json` も更新

---

## 判断に迷ったとき

1. **設計方針書を再読する**: `docs/ui-redesign-strategy.md`
2. **Issueのコメントを確認する**: `gh issue view <NUMBER> --comments`
3. **M3公式リファレンスを参照する**: https://m3.material.io/
4. **無理に独自判断しない**: 不明点はIssueにコメントを残して次に進む

```bash
# 判断を仰ぐコメントの例
gh issue comment <NUMBER> --body "実装上の確認:
- ○○のケースでは△△と解釈して実装しました
- □□については仕様が不明のため保留しています
確認をお願いします。"
```

---

## Issue一覧（着手順序リファレンス）

### M0: UI Foundation（最初に着手）
| # | タイトル | 依存 |
|---|---------|------|
| 99 | Material 3 デザイントークン定義 | なし |
| 100 | Material Symbols アイコンシステム導入 | #99 |
| 101 | M3 基礎UIコンポーネント（Button / Chip / Card / TextField） | #99 |

### M1: App Shell
| # | タイトル | 依存 |
|---|---------|------|
| 104 | 用語統一: Delay → Pressure 全置換 | なし（M0と並行可） |
| 105 | タスク状態遷移モデル（READY/RUNNING/PAUSED/DONE） | なし（M0と並行可） |
| 102 | App Shell レイアウト骨格 | #99, #100, #101 |
| 103 | Pressure 表示コンポーネント | #99, #101, #102, #104 |

### M2: Main Screen Components
| # | タイトル | 依存 |
|---|---------|------|
| 111 | Pressure モデル定義と自動モード遷移 | #104, #105 |
| 113 | Project / Group / タスク関連モデル | #105 |
| 112 | タグシステム（3ソース effectiveTags） | #113 |
| 106 | Now Hub コンポーネント | #102, #105 |
| 107 | 次タスク候補カード（2〜3件 + 理由表示） | #106, #111 |
| 108 | タスクボード（Material 3 リスト表示） | #102, #105 |
| 109 | タイムラインビュー（Material 3 横軸表示） | #102 |
| 110 | タスク詳細ドロワー | #101, #108 |

### M3: Floating + Board Control
| # | タイトル | 依存 |
|---|---------|------|
| 114 | Anchor フローティングコントロール | #106, #105 |
| 115 | 延長 UI（柔軟サジェスト + スライダー） | #114 |
| 116 | タスク作成・編集ダイアログ | #101, #112 |
| 117 | タグサジェスト提案・承認・抑制 | #112, #116 |

---

## コミットメッセージ規約

```
<type>(#<issue>): <summary in Japanese or English>

feat(#99): M3カラートークンとCSS変数を定義
fix(#103): Pressure表示の閾値計算を修正
refactor(#104): Delay→Pressure 用語置換
test(#105): タスク状態遷移の境界テスト追加
chore(#100): Material Symbols フォント依存追加
```

type: `feat` | `fix` | `refactor` | `test` | `chore` | `docs`

---

## 最後に

- **1 Issue = 1 ブランチ = 1 PR**。これを破らない。
- **完璧を目指して長時間止まるより、動くものを小さく出す**。
- **迷ったらIssueにコメント**。勝手に仕様を変えない。
- **pushを忘れない**。ローカルだけに成果物を溜めない。
