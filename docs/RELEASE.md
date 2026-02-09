# Pomodoroom リリース手順

このドキュメントでは、Pomodoroom のアップデート機能とリリース方法を説明します。

## 事前準備（初回のみ）

### 1. Tauri 署名キーの生成

アップデート機能には署名キーが必要です。以下のコマンドで生成します：

```bash
# Tauri CLIがインストールされていない場合はインストール
cargo install tauri-cli

# 署名キーを生成（パスワードを設定）
cargo tauri signer generate -w ~/.tauri/pomodoroom.key
```

生成されたファイル：
- `~/.tauri/pomodoroom.key` - 秘密鍵（絶対に公開しない）
- `~/.tauri/pomodoroom.key.pub` - 公開鍵

### 2. GitHub Secrets の設定

リポジトリの Settings > Secrets and variables > Actions で以下を追加：

| Secret 名 | 値 |
|-----------|-----|
| `TAURI_SIGNING_PRIVATE_KEY` | `pomodoroom.key` の内容全体 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | キー生成時に設定したパスワード |

### 3. tauri.conf.json の pubkey 設定

`src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に公開鍵を設定：

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/rebuildup/pomodoroom-desktop/releases/latest/download/latest.json"
      ],
      "pubkey": "公開鍵の内容をここに貼り付け"
    }
  }
}
```

## リリース手順

### 方法1: Git タグを使用（推奨）

```bash
# バージョンを更新
# 1. src-tauri/tauri.conf.json の version を更新
# 2. package.json の version を更新
# 3. src-tauri/Cargo.toml の version を更新

# コミット
git add -A
git commit -m "chore: bump version to 1.1.0"

# タグを作成してプッシュ
git tag v1.1.0
git push origin main --tags
```

### 方法2: GitHub Actions の手動実行

1. GitHub リポジトリの Actions タブを開く
2. "Release" ワークフローを選択
3. "Run workflow" をクリック
4. バージョン番号を入力（例: `1.1.0`）
5. "Run workflow" を実行

## ビルド成果物

リリースには以下のファイルが自動生成されます：

| プラットフォーム | ファイル |
|-----------------|---------|
| Windows | `Pomodoroom_x.x.x_x64-setup.exe`, `Pomodoroom_x.x.x_x64_en-US.msi` |
| macOS (Intel) | `Pomodoroom_x.x.x_x64.dmg` |
| macOS (Apple Silicon) | `Pomodoroom_x.x.x_aarch64.dmg` |
| Linux | `Pomodoroom_x.x.x_amd64.deb`, `Pomodoroom_x.x.x_amd64.AppImage` |

## アップデート確認

アプリ内で Settings > Updates から更新を確認できます。

## トラブルシューティング

### 署名エラー
- `TAURI_SIGNING_PRIVATE_KEY` が正しく設定されているか確認
- パスワードが空でないか確認

### アップデートが検出されない
- `tauri.conf.json` の `pubkey` が公開鍵と一致しているか確認
- `endpoints` の URL が正しいか確認
- リリースが draft でなく published になっているか確認
