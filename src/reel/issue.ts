// レビュー用 Issue 本文の組み立てと読み取り。
// 承認時はこの本文から台本とキャプションを読み直すので、Issue を編集すれば内容を修正できる。
import type { ReelScript } from "./script.js";

const CAPTION_START = "<!-- caption:start -->";
const CAPTION_END = "<!-- caption:end -->";

export const APPROVE_LABEL = "reel-approved";

export function renderIssueBody(args: {
  kind: "news" | "teaching";
  label: string;
  ref: string;
  caption: string;
  script: ReelScript;
}): string {
  const source = args.kind === "news" ? `ニュース: [${args.label}](${args.ref})` : `教え: ${args.label}(${args.ref})`;
  return `チビボスのリール動画ができました。

**元ネタ** ${source}

## 確認の手順
1. このIssueの下にあるワークフロー実行(Actions)から \`reel-preview\` をダウンロードして動画を確認する
2. 直したい場合は、このIssue本文のキャプションや台本(JSON)を編集する
3. OKなら、ラベル **\`${APPROVE_LABEL}\`** を付ける → 動画を作り直してInstagramに投稿します
4. 投稿しない場合は、このIssueをそのまま閉じる

## キャプション
${CAPTION_START}
${args.caption}
${CAPTION_END}

## 台本
\`\`\`json
${JSON.stringify(args.script, null, 2)}
\`\`\`
`;
}

export function parseIssueBody(body: string): { caption: string; script: ReelScript } {
  const start = body.indexOf(CAPTION_START);
  const end = body.indexOf(CAPTION_END);
  if (start < 0 || end < start) throw new Error("caption markers not found in issue body");
  const caption = body.slice(start + CAPTION_START.length, end).trim();

  const match = body.slice(end).match(/```json\s*([\s\S]*?)```/);
  if (!match) throw new Error("```json script block not found in issue body");
  const script = JSON.parse(match[1]) as ReelScript;
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) throw new Error("script has no scenes");
  return { caption, script };
}
