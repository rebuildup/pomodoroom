# Quick Start Guide

## プロジェクトフォルダで再起動する手順

### 1. ターミナルを開く

PowerShell または CMD を開き、プロジェクトフォルダに移動:

```bash
cd C:\Users\rebui\Desktop\pomodoroom-desktop
```

### 2. 既存プロセスを停止

```powershell
# PowerShell の場合
taskkill /F /IM pomodoroom-desktop.exe -ErrorAction SilentlyContinue
taskkill /F /IM node.exe -ErrorAction SilentlyContinue

# CMD の場合
taskkill /F /IM pomodoroom-desktop.exe 2>nul
taskkill /F /IM node.exe 2>nul
```

### 3. 開発サーバーを起動

```bash
npm run tauri:dev
```

または、バッチファイルを使用:

```bash
start.bat
```

### 4. ウィンドウが表示されない場合

別のPowerShellウィンドウで:

```powershell
cd C:\Users\rebui\Desktop\pomodoroom-desktop
powershell -ExecutionPolicy Bypass -File scripts\check_window_pos.ps1
```

## トラブルシューティング

### ポート 1420 が使用中

```powershell
netstat -ano | findstr :1420
taskkill /F /PID <PID>
```

### ビルドエラー

```bash
cd src-tauri
cargo clean
cd ..
npm run tauri:dev
```

## プロジェクト構造

```
pomodoroom-desktop/
├── src/              # React アプリ
├── src-tauri/        # Rust バックエンド
├── scripts/          # 診断スクリプト
├── start.bat         # 簡易起動スクリプト
├── README.md         # 詳細ドキュメント
└── QUICKSTART.md     # このファイル
```
