# Pomodoroom Mobile

React Native版 Pomodoroom の最小実装スパイク

## 機能

- タスク一覧表示
- 次のタスク候補表示（優先度スコアリング）
- 休憩提案（ポモドーロテクニック対応）
- SQLite によるローカルストレージ

## 技術スタック

- Expo SDK 52
- React Native 0.76
- TypeScript 5
- React Navigation 7
- React Native Paper (Material Design 3)
- expo-sqlite

## 開発

```bash
# 依存関係のインストール
cd mobile
npm install

# 開発サーバーの起動
npm start

# テストの実行
npm test

# Lint
npm run lint

# 型チェック
npm run type-check
```

## プロジェクト構造

```
mobile/
├── src/
│   ├── components/     # 再利用可能なUIコンポーネント
│   ├── screens/        # 画面コンポーネント
│   ├── hooks/          # カスタムReactフック
│   ├── services/       # API・ストレージサービス
│   ├── types/          # TypeScript型定義
│   └── utils/          # ユーティリティ関数
├── App.tsx
└── package.json
```

## 仕様

### タスク状態
- READY: 準備中
- RUNNING: 実行中
- PAUSED: 一時停止
- DONE: 完了

### 優先度スコアリング
- 基本スコア: 優先度 × 10
- 期限ボーナス:
  - 超過: +100
  - 1日以内: +50
  - 3日以内: +20
- ポモドーロサイズ(25分以下): +5

### 休憩提案
- 25分毎に短休憩（5分）を提案
- 4ポモドーロ毎に長休憩（15分）を提案
