#!/usr/bin/env python3
"""Create GitHub issues from brainstorming results."""
import json
import subprocess
import time

issues = [
    {"title": "[Core] コンテキスト対応の優先度計算", "body": "## カテゴリ\nMVP Core\n\n## 説明\n現在の状況（エネルギーレベル、時間帯、直前のタスク種別）に応じて動的に優先度を再計算。朝は創作的作業、夜はルーチンワークなど。\n\n## 優先度\n高"},
    {"title": "[Core] エネルギー追跡・予測", "body": "## カテゴリ\nMVP Core\n\n## 説明\n各タスク完了後にエネルギー消費量を記録。類似タスクの所要エネルギーを予測・提案。\n\n## 優先度\n高"},
    {"title": "[Core] 作業容量見積もり", "body": "## カテゴリ\nMVP Core\n\n## 説明\nユーザーの1日の作業容量を学習。無理のないスケジューリングを実現。\n\n## 優先度\n高"},
    {"title": "[Core] 時間ギャップ自動検出", "body": "## カテゴリ\nMVP Core\n\n## 説明\nGoogle Calendarの会議間隙（15分、30分、1時間）を自動検出し、最適なタスクを提案。\n\n## 優先度\n高"},
    {"title": "[Core] デッドライン対応スケジューリング", "body": "## カテゴリ\nMVP Core\n\n## 説明\nNotion/Linearの期限を考慮し、余裕を持ってスケジュール。\n\n## 優先度\n高"},
    {"title": "[Core] 選択肢の提示とワンクリック採用", "body": "## カテゴリ\nMVP Core\n\n## 説明\n「次はこれをやる」という提案を表示し、ワンクリックで採用。拒否も簡単に。\n\n## 優先度\n高"},
    {"title": "[Core] タスクプールと過去履歴", "body": "## カテゴリ\nMVP Core\n\n## 説明\n小さなタスクをプールしておき、隙間時間に提案。過去の履歴を学習に活用。\n\n## 優先度\n高"},
    {"title": "[Core] プロジェクトベースのフィルタリング", "body": "## カテゴリ\nMVP Core\n\n## 説明\n現在集中したいプロジェクトのタスクのみを提案対象にするフィルタ。\n\n## 優先度\n高"},
    {"title": "[Enhancement] スマートタスク分割", "body": "## カテゴリ\nEnhancement\n\n## 説明\n大きなタスクを自動的に25分単位のサブタスクに分割。\n\n## 優先度\n中"},
    {"title": "[Enhancement] 依存関係グラフ", "body": "## カテゴリ\nEnhancement\n\n## 説明\nタスク間の依存関係を可視化・管理。先行タスク完了後に自動提案。\n\n## 優先度\n中"},
    {"title": "[Enhancement] 定期タスクテンプレート", "body": "## カテゴリ\nEnhancement\n\n## 説明\n毎週のレポート、毎月の請求処理など、定期タスクをテンプレート化。\n\n## 優先度\n中"},
    {"title": "[Enhancement] 作業統計ダッシュボード", "body": "## カテゴリ\nEnhancement\n\n## 説明\n1日の完了タスク、集中時間、エネルギー消費を可視化。\n\n## 優先度\n中"},
    {"title": "[Enhancement] クイックキャプチャ", "body": "## カテゴリ\nEnhancement\n\n## 説明\nアイデア浮かんだら即座にキャプチャ。後で詳細化・スケジューリング。\n\n## 優先度\n中"},
    {"title": "[Enhancement] タグベースのコンテキスト切り替え", "body": "## カテゴリ\nEnhancement\n\n## 説明\n「#codding」「#writing」タグで、同じ種類のタスクを連続提案。\n\n## 優先度\n中"},
    {"title": "[Enhancement] タスク難易度見積もり", "body": "## カテゴリ\nEnhancement\n\n## 説明\n各タスクの難易度をユーザーに見積もらせ、スコアリングに反映。\n\n## 優先度\n中"},
    {"title": "[Enhancement] 休憩提案エンジン", "body": "## カテゴリ\nEnhancement\n\n## 説明\n連続稼働時間やエネルギー消費に基づき、最適な休憩タイミングを提案。\n\n## 優先度\n中"},
    {"title": "[Enhancement] タスクバッチ処理", "body": "## カテゴリ\nEnhancement\n\n## 説明\nメール返信、簡易UI調整など、同種タスクをまとめて提案。\n\n## 優先度\n中"},
    {"title": "[Enhancement] タイムトラッキング統合", "body": "## カテゴリ\nEnhancement\n\n## 説明\n各タスクの実際の所要時間を記録。予測精度を向上。\n\n## 優先度\n中"},
    {"title": "[Enhancement] タスク優先度手動調整", "body": "## カテゴリ\nEnhancement\n\n## 説明\nAIの提案に対し、ユーザーが手動で優先度を微調整可能。\n\n## 優先度\n中"},
    {"title": "[Enhancement] タスク完了通知連携", "body": "## カテゴリ\nEnhancement\n\n## 説明\nNotion/Linearのタスク完了を自動反映。ステータス更新。\n\n## 優先度\n中"},
    {"title": "[UI] タイムラインビュー", "body": "## カテゴリ\nUI/UX\n\n## 説明\n1日のスケジュールを横長タイムラインで可視化。\n\n## 優先度\n高"},
    {"title": "[UI] 次のタスク提案カード", "body": "## カテゴリ\nUI/UX\n\n## 説明\nメイン画面に目立つカードで「次はこれ」を提案。採用/スキップボタン。\n\n## 優先度\n高"},
    {"title": "[UI] タスク詳細ドロワー", "body": "## カテゴリ\nUI/UX\n\n## 説明\nタスククリックでサイドドロワーが開き、詳細を表示。\n\n## 優先度\n中"},
    {"title": "[UI] エネルギーレベルインジケーター", "body": "## カテゴリ\nUI/UX\n\n## 説明\n現在のエネルギーレベルを色とアイコンで視覚化。\n\n## 優先度\n中"},
    {"title": "[UI] コンテキスト切替ボタン", "body": "## カテゴリ\nUI/UX\n\n## 説明\n「集中モード」「メールモード」など、ワンタップでコンテキスト切替。\n\n## 優先度\n中"},
    {"title": "[UI] タスクプール表示", "body": "## カテゴリ\nUI/UX\n\n## 説明\n隙間時間用小タスク一覧をサイドパネルで表示。\n\n## 優先度\n中"},
    {"title": "[UI] 統計ダッシュボード", "body": "## カテゴリ\nUI/UX\n\n## 説明\n日次/週次の生産性統計をグラフで表示。\n\n## 優先度\n中"},
    {"title": "[UI] タスク依存関係グラフ", "body": "## カテゴリ\nUI/UX\n\n## 説明\nタスク間の依存関係をノードグラフで可視化。\n\n## 優先度\n低"},
    {"title": "[AI] AIタスク推論", "body": "## カテゴリ\nAI/ML\n\n## 説明\nLLMを使い、タスクの自然言語説明から優先度・難易度を推論。\n\n## 優先度\n中"},
    {"title": "[AI] 動的スケジューリングAI", "body": "## カテゴリ\nAI/ML\n\n## 説明\nユーザーの作業パターンを学習し、スケジューリング精度を向上。\n\n## 優先度\n中"},
    {"title": "[AI] タスク自動分割", "body": "## カテゴリ\nAI/ML\n\n## 説明\nLLMで大タスクを自動的に25分単位に分割。\n\n## 優先度\n中"},
    {"title": "[AI] エネルギー消費予測", "body": "## カテゴリ\nAI/ML\n\n## 説明\n過去のデータから各タスクのエネルギー消費を予測。\n\n## 優先度\n中"},
    {"title": "[AI] スマートタスク提案", "body": "## カテゴリ\nAI/ML\n\n## 説明\n現在の状況に最適なタスクをAIで提案。\n\n## 優先度\n中"},
    {"title": "[API] Notion双向同期", "body": "## カテゴリ\nAPI Integration\n\n## 説明\nNotionタスク完了をpomodoroomに反映。\n\n## 優先度\n高"},
    {"title": "[API] Linearステータス連動", "body": "## カテゴリ\nAPI Integration\n\n## 説明\nLinearのState Transitionをポモドーロ完了に連動。\n\n## 優先度\n高"},
    {"title": "[API] GitHub Issue紐付け", "body": "## カテゴリ\nAPI Integration\n\n## 説明\n作業中のIssueを自動的に紐付け。\n\n## 優先度\n中"},
    {"title": "[API] Discord/Slack進捗通知", "body": "## カテゴリ\nAPI Integration\n\n## 説明\nポモドーロ完了時にステータス更新。\n\n## 優先度\n中"},
    {"title": "[API] Webhookリアルタイム更新", "body": "## カテゴリ\nAPI Integration\n\n## 説明\n外部サービスのWebhookを受け取り、即座にTimeline更新。\n\n## 優先度\n高"},
    {"title": "[API] 差分同期", "body": "## カテゴリ\nAPI Integration\n\n## 説明\n前回からの差分のみを取得。効率化。\n\n## 優先度\n高"},
    {"title": "[Settings] コンテキスト設定", "body": "## カテゴリ\nSettings\n\n## 説明\n「朝は創作」「夜はルーチン」など、時間帯によるコンテキスト設定。\n\n## 優先度\n中"},
    {"title": "[Settings] 優先度重み調整", "body": "## カテゴリ\nSettings\n\n## 説明\n緊急度・重要度・エネルギーなどの重みを調整可能。\n\n## 優先度\n中"},
    {"title": "[Settings] 連携サービス選択", "body": "## カテゴリ\nSettings\n\n## 説明\n使用する統合サービスを選択・優先順位設定。\n\n## 優先度\n中"},
    {"title": "[Settings] 通知設定", "body": "## カテゴリ\nSettings\n\n## 説明\nタスク提案通知、休憩リマインダーのオンオフ。\n\n## 優先度\n中"},
    {"title": "[Settings] テーマ切替", "body": "## カテゴリ\nSettings\n\n## 説明\nライト/ダークテーマ、カラーカスタマイズ。\n\n## 優先度\n低"},
    {"title": "[Collab] チームタスク割当", "body": "## カテゴリ\nCollaboration\n\n## 説明\nチームメンバーにタスクを割当・進捗共有。\n\n## 優先度\n低"},
    {"title": "[Collab] 進捗共有ダッシュボード", "body": "## カテゴリ\nCollaboration\n\n## 説明\nチーム全体の進捗を可視化。\n\n## 優先度\n低"},
    {"title": "[Advanced] 自然言語タスク入力", "body": "## カテゴリ\nAdvanced\n\n## 説明\n「来週までにレポート書く」を自動解析・スケジュール。\n\n## 優先度\n中"},
    {"title": "[Advanced] タスクテンプレートAI生成", "body": "## カテゴリ\nAdvanced\n\n## 説明\n「四半期レポート作成」テンプレートをAIが自動生成。\n\n## 優先度\n低"},
    {"title": "[Advanced] 週次レビュー自動生成", "body": "## カテゴリ\nAdvanced\n\n## 説明\n1週間の作業内容をNotionページに自動生成。\n\n## 優先度\n中"},
    {"title": "[Advanced] カレンダー統合", "body": "## カテゴリ\nAdvanced\n\n## 説明\nApple Calendar/Outlook対応。CalDAVで統一的アクセス。\n\n## 優先度\n中"},
    {"title": "[Advanced] Todoist統合", "body": "## カテゴリ\nAdvanced\n\n## 説明\nTodoistタスクをTimelineItemに統合。\n\n## 優先度\n中"},
    {"title": "[Advanced] オフラインキャッシュ", "body": "## カテゴリ\nAdvanced\n\n## 説明\nTimelineItemをSQLiteに永続化、オフラインでも参照可能。\n\n## 優先度\n中"},
    {"title": "[Advanced] バックグラウンド同期", "body": "## カテゴリ\nAdvanced\n\n## 説明\n5分ごとにバックグラウンドでTimeline更新。\n\n## 優先度\n中"},
    {"title": "[Advanced] タイムラインズーム", "body": "## カテゴリ\nAdvanced\n\n## 説明\n1時間/1日/1週間など異なる時間スケールでタイムライン表示。\n\n## 優先度\n中"},
    {"title": "[Advanced] キーボードショートカット", "body": "## カテゴリ\nAdvanced\n\n## 説明\n全操作をキーボードのみで完結可能にする。\n\n## 優先度\n中"},
    {"title": "[Advanced] アコーディオン式パネル", "body": "## カテゴリ\nAdvanced\n\n## 説明\nパネルを折りたたみ可能にし、必要な情報だけを表示。\n\n## 優先度\n中"},
    {"title": "[Advanced] 色による視覚的ステータス表示", "body": "## カテゴリ\nAdvanced\n\n## 説明\nタスクの緊急度を色で一目でわかるようにする。\n\n## 優先度\n中"},
    {"title": "[Advanced] モバイル対応", "body": "## カテゴリ\nAdvanced\n\n## 説明\nスマホからでもタスク確認・更新可能。\n\n## 優先度\n低"},
]

for issue in issues:
    result = subprocess.run(
        ["gh", "issue", "create", "--title", issue["title"], "--body", issue["body"]],
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    if result.returncode == 0:
        print(f"Created: {issue['title']}")
    else:
        print(f"Failed: {issue['title']}: {result.stderr}")
    time.sleep(1)

print("\nDone!")
