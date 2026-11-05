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

- ファイル名は `NNN_<内容>.json`(連番。続きの番号を使う)。鮮度が大事なニュース台本は `000_news_<内容>.json` にして、次の回に優先して使われるようにする。形式は `reel/queue/` の既存ファイルを参照: `title` / `caption` / `scenes[]`(`headline` / `note` / `lines[]` = `text`・`pose`・`secs`)
- 第一声は必ず `よう、ボスだ。`(最初のシーンの最初のセリフ。例: `よう、ボスだ。\n今日は〜の話だ`)。最後のセリフは `じゃあ、またな。`
- **DMへの誘導は書かない**(セリフ・見出し・キャプションすべて)
- 各シーンに背景画像の指示 `image_prompt`(何を写すか)と、保存先 `image`(`reel/backgrounds/<台本ファイル名>/<シーン番号>.jpg`)を書く。画像そのものは Codex が作る(下の「背景画像を作るとき」)
- 4〜5シーン、合計18〜35秒。見出しは1行12文字以内、セリフは1行18文字以内・2行まで
- ポーズ名は `reel/character/poses.json` の `names` から選ぶ(一覧と意味は `reel/README.md`)
- 「お金の教え」の引用と出典は `src/reel/teachings.ts` の文言をそのまま使う。新しい教えを使う場合は、先に出典を確認して `teachings.ts` に追加し、人間に確認を取る
- ニュースを題材にする場合は、記事にない数字や事実を書かない。`note` に `出典：<媒体名>` を入れる
- 断定的な投資助言(「今買うべき」「必ず上がる」等)・価格予測・過度に不安を煽る表現は書かない
- 民族や宗教の属性とお金を結びつける表現(「ユダヤ人は金持ち」等)は書かない
- キャプションに免責文は書かない(コードが自動で付ける)
- 書いたら `npm run reel:check` でエラー0を確認し、`python3 reel/make_reel.py reel/queue/<file>.json out/check.mp4` で見た目も確認する

## 背景画像を作るとき(Codexの仕事)

リールの背景画像は **Codex が画像生成で作る**運用です。背景画像が揃っていない台本は、毎日のワークフローが自動で飛ばします(揃うまで動画にならない)。

1. `npm run reel:check` を実行し、「背景画像が未作成」と出たシーンを確認する
2. そのシーンの `image_prompt` に、次の共通スタイルを付けて画像を生成する
   - 縦長 9:16(1080×1920 以上)、写実的な静物・風景写真
   - 暗めで落ち着いた、金色と茶色を基調にしたトーン
   - **人物・顔・手を入れない。文字・数字・ロゴ・国旗・宗教的シンボルを入れない**
   - 画面の下半分はシンプルに(キャラクターと字幕が重なるため。主役は上半分に)
   - 実在の企業・銀行のロゴや建物を特定できる形で描かない
3. JPEG(1枚500KB程度まで)で、台本の `image` に書かれたパス(`reel/backgrounds/<台本ファイル名>/<シーン番号>.jpg`)に保存する
4. `npm run reel:check` で未作成が消えたことを確認し、`python3 reel/make_reel.py reel/queue/<file>.json out/check.mp4` で見た目を確認する
5. `codex/...` ブランチにコミットしてpushする(`main` に直接pushしない)

台本の内容(セリフ・見出し・キャプション)は変更しないこと。画像の指示に合う画像が作れない場合は、`image_prompt` を変えずに人間に相談する。

## 既知の注意点

- 開発環境からは外部ネットワークに接続できないことがあり、`config.ts` のRSSフィードは疎通確認ができていません。
- Xの文字数制限は簡易的な判定(`X_SAFE_LENGTH`)で切り詰めています。厳密な重み付きカウントではありません。
