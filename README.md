# Pomodoroom Desktop

Tauri + React + TypeScript + Tailwind CSS v4 で構築されたポモドーロデスクトップアプリケーション

## プロジェクト構成

```
pomodoroom-desktop/
├── src/                    # React フロントエンド
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css           # Tailwind v4 (@import "tailwindcss")
├── src-tauri/              # Rust バックエンド
│   ├── src/
│   │   └── main.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── docs/reference/my-web-2025/  # リファレンスコード
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js       # Tailwind v4: autoprefixerのみ
```

## 開発コマンド

プロジェクトフォルダ (C:\Users\rebui\Desktop\pomodoroom-desktop) で実行:

```bash
# フロントエンド開発サーバー (Vite)
npm run dev

# Tauri 開発モード (フロントエンド + デスクトップアプリ)
npm run tauri:dev

# 本番ビルド
npm run build

# Tauri アプリビルド
npm run tauri:build
```

## トラブルシューティング

### ウィンドウが表示されない場合

プロセスは実行中だがウィンドウが見えない場合:

1. プロセスを確認:
```bash
tasklist | findstr pomodoroom
```

2. PowerShellでウィンドウ位置をリセット:
```powershell
cd C:\Users\rebui\Desktop\pomodoroom-desktop
powershell -ExecutionPolicy Bypass -File ..\check_window_pos.ps1
```

### ポート1420が使用中の場合

```bash
# Nodeプロセスを停止
taskkill /F /IM node.exe

# または特定のポートを殺す
netstat -ano | findstr :1420
taskkill /F /PID <PID>
```

### ビルドエラー "access denied"

```bash
# Cargoキャッシュをクリア
cd src-tauri
cargo clean

# プロセスを全て停止
taskkill /F /IM pomodoroom-desktop.exe
taskkill /F /IM cargo.exe
taskkill /F /IM rustc.exe
```

## 依存関係

### Frontend
- React 19.2.4
- TypeScript 5.9.3
- Vite 7.3.1
- Tailwind CSS 4.1.18 (v4形式: `@import "tailwindcss"`)
- Autoprefixer 10.4.24

### Backend
- Rust
- Tauri 2.x
- tauri-plugin-opener

## Tailwind CSS v4 メモ

- PostCSS設定は最小限 (autoprefixerのみ)
- `@import "tailwindcss"` を index.css で使用
- `@tailwind` ディレクティブは使用しない

## 次のステップ

1. メインのポモドーロタイマー機能を実装
2. デスクトップ通知を追加
3. グローバルショートカットを設定
4. システムトレイアイコンを追加
