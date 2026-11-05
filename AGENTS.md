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
| `reel/` | キャラクター付きリール動画のレンダラー(Python + ffmpeg)。使い方は `reel/README.md` |
| `src/reel/` | リール台本の自動生成(Claude)、確認用Issueの作成・読み取り、Instagram投稿 |
| `src/reel/teachings.ts` | 「お金の教え」の引用と出典(固定。Claudeに出典を作らせない) |
| `src/publish/instagram.ts` | Instagramリール投稿(resumable upload) |
| `data/reels.json` | リールに使ったニュース・教えの履歴(GitHub Actionsが自動更新) |
| `.github/workflows/reel-generate.yml` / `reel-publish.yml` | リールの毎日生成→Issueで確認→承認ラベルで投稿 |

## コマンド

```bash
npm install          # 依存関係のインストール
npm run typecheck    # 型チェック(変更後は必ず実行)
npm run dry-run      # 実際には投稿せず、生成文面をコンソールに表示
npm start            # 本番実行(実際にSNSへ投稿される)
python3 reel/make_reel.py reel/scripts/talmud_money.json out/talmud_money.mp4  # 台本からリール動画を作る
npm run reel:check     # reel/queue/ の台本をチェック(台本を書いたら必ず実行)
npm run reel:generate  # reel/queue/ から台本を1本取り出し out/reel/ に書く(reel/done/ へ移動する)
npm run reel:render    # out/reel/script.json を動画にする
DRY_RUN=true npm run reel:publish  # 投稿せずに投稿内容を表示
```

テストフレームワークは未導入です。変更後は最低限 `npm run typecheck` を通してください。

## 作業ルール

- **`npm start` は実行しない。** 実際にSNSへ投稿されてしまいます。動作確認は `npm run dry-run` を使ってください(ただし `ANTHROPIC_API_KEY` が必要です)。
- **秘密情報をコミットしない。** APIキーやトークンは `.env`(gitignore済み)か GitHub Secrets にのみ置きます。`.env.example` には空の値だけを書きます。
- **`npm run reel:publish` を `DRY_RUN=true` なしで実行しない。** 実際にInstagramへ投稿されます。
- **`data/posted.json` / `data/reels.json` を手で編集しない。** ワークフローが自動でコミットするファイルです。
- **リールは必ず人の確認を通す。** `reel-publish.yml` の「オーナーが承認ラベルを付けたときだけ投稿」という条件を外さないでください。
- **作業ブランチを分ける。** エージェントごとに別ブランチで作業し、`main` に直接pushしないでください(例: Claude Code は `claude/...`、Codex は `codex/...`)。
- **コンプライアンス上の制約を緩めない。** `summarize.ts` のプロンプトにある「断定的な投資助言・価格予測をしない」制限や、`config.ts` の免責文(`DISCLAIMER`)を削除・弱体化しないでください。変更が必要な場合は人間に確認を取ります。
- ES Modules(`"type": "module"`)なので、相対importには `.js` 拡張子を付けます(例: `import { x } from "./config.js"`)。
- TypeScript は `strict` モードです。`any` の多用は避けてください。

## リール台本を書くとき(エージェントの仕事)

チビボスのリール台本は、Claude API ではなく **エージェント(Claude Code / Codex)が書いて `reel/queue/` に置く**運用です。毎日12時のワークフローがファイル名順に1本ずつ取り出して動画にし、確認用Issueを作ります。

- ファイル名は `NNN_<内容>.json`(連番。続きの番号を使う)。形式は `reel/queue/` の既存ファイルを参照: `title` / `caption` / `scenes[]`(`headline` / `note` / `lines[]` = `text`・`pose`・`secs`)
- 4〜5シーン、合計18〜35秒。見出しは1行12文字以内、セリフは1行18文字以内・2行まで
- ポーズ名は `reel/character/poses.json` の `names` から選ぶ(一覧と意味は `reel/README.md`)
- 「お金の教え」の引用と出典は `src/reel/teachings.ts` の文言をそのまま使う。新しい教えを使う場合は、先に出典を確認して `teachings.ts` に追加し、人間に確認を取る
- ニュースを題材にする場合は、記事にない数字や事実を書かない。`note` に `出典：<媒体名>` を入れる
- 断定的な投資助言(「今買うべき」「必ず上がる」等)・価格予測・過度に不安を煽る表現は書かない
- 民族や宗教の属性とお金を結びつける表現(「ユダヤ人は金持ち」等)は書かない
- キャプションに免責文・DM誘導文は書かない(コードが自動で付ける)
- 書いたら `npm run reel:check` でエラー0を確認し、`python3 reel/make_reel.py reel/queue/<file>.json out/check.mp4` で見た目も確認する

## 既知の注意点

- 開発環境からは外部ネットワークに接続できないことがあり、`config.ts` のRSSフィードは疎通確認ができていません。
- Xの文字数制限は簡易的な判定(`X_SAFE_LENGTH`)で切り詰めています。厳密な重み付きカウントではありません。
