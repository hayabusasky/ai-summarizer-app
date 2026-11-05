# AGENTS.md

AIコーディングエージェント(Codex / Claude Code など)向けのプロジェクトガイドです。人間向けの説明は `README.md` を参照してください。

## プロジェクト概要

経済ニュースをRSSで収集し、Claude APIで「金(ゴールド)を持っておきたくなる」切り口の短文に要約して、X / Threads に自動投稿する Node.js + TypeScript のパイプラインです。純金販売の集客(発信)部分だけを自動化しており、DM対応・購入・発送は意図的に自動化していません。

処理の流れ: `collect.ts`(RSS収集) → `summarize.ts`(Claudeで分類・要約) → `publish/`(X・Threadsへ投稿) → `state.ts`(投稿済みURLを記録して重複防止)

## ディレクトリ構成

| パス | 役割 |
|---|---|
| `src/index.ts` | エントリーポイント。全体の処理順序を制御 |
| `src/config.ts` | RSSフィード一覧、使用モデル、免責文・DM誘導文などの定数 |
| `src/collect.ts` | RSSフィードから記事を取得 |
| `src/summarize.ts` | Claude APIへのプロンプトと応答(JSON)の解析 |
| `src/publish/x.ts` / `src/publish/threads.ts` | 各SNSへの投稿処理 |
| `src/state.ts` | `data/posted.json` の読み書き |
| `src/types.ts` | 共通の型定義 |
| `data/posted.json` | 投稿済み記事の履歴(GitHub Actionsが自動更新) |
| `.github/workflows/post.yml` | 1日2回(JST 8時・18時)の自動実行 |
| `reel/` | キャラクター付きリール動画の生成ツール(Python + ffmpeg)。使い方は `reel/README.md` |

## コマンド

```bash
npm install          # 依存関係のインストール
npm run typecheck    # 型チェック(変更後は必ず実行)
npm run dry-run      # 実際には投稿せず、生成文面をコンソールに表示
npm start            # 本番実行(実際にSNSへ投稿される)
python3 reel/make_reel.py reel/scripts/talmud_money.json out/talmud_money.mp4  # リール動画の生成
```

テストフレームワークは未導入です。変更後は最低限 `npm run typecheck` を通してください。

## 作業ルール

- **`npm start` は実行しない。** 実際にSNSへ投稿されてしまいます。動作確認は `npm run dry-run` を使ってください(ただし `ANTHROPIC_API_KEY` が必要です)。
- **秘密情報をコミットしない。** APIキーやトークンは `.env`(gitignore済み)か GitHub Secrets にのみ置きます。`.env.example` には空の値だけを書きます。
- **`data/posted.json` を手で編集しない。** ワークフローが自動でコミットするファイルです。
- **作業ブランチを分ける。** エージェントごとに別ブランチで作業し、`main` に直接pushしないでください(例: Claude Code は `claude/...`、Codex は `codex/...`)。
- **コンプライアンス上の制約を緩めない。** `summarize.ts` のプロンプトにある「断定的な投資助言・価格予測をしない」制限や、`config.ts` の免責文(`DISCLAIMER`)を削除・弱体化しないでください。変更が必要な場合は人間に確認を取ります。
- ES Modules(`"type": "module"`)なので、相対importには `.js` 拡張子を付けます(例: `import { x } from "./config.js"`)。
- TypeScript は `strict` モードです。`any` の多用は避けてください。

## 既知の注意点

- 開発環境からは外部ネットワークに接続できないことがあり、`config.ts` のRSSフィードは疎通確認ができていません。
- Xの文字数制限は簡易的な判定(`X_SAFE_LENGTH`)で切り詰めています。厳密な重み付きカウントではありません。
