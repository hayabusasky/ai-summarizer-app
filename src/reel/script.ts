import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "../config.js";
import type { Article } from "../types.js";
import type { Teaching } from "./teachings.js";

export interface ReelLine {
  text: string;
  pose: string;
  secs: number;
}

export interface ReelScene {
  image?: string; // 背景画像(リポジトリ直下からの相対パス)。Codexが作成する
  headline: string[];
  note?: string;
  lines: ReelLine[];
}

export interface ReelScript {
  footer: string;
  scenes: ReelScene[];
}

export interface GeneratedReel {
  script: ReelScript;
  caption: string;
}

export const REEL_FOOTER = "※本動画は解説であり、投資助言ではありません。";

// 動画の第一声は必ずこれ(固定)
export const GREETING = "よう、ボスだ。";

const POSE_DESCRIPTIONS: Record<string, string> = {
  smile: "にっこり(あいさつ・締め)",
  explain: "手を差し出して説明",
  think: "あごに手を当てて考える(問いかけ)",
  shrug: "両手を広げる(「どうでしょう?」)",
  point: "人差し指を立てる(ポイント提示)",
  talk: "手を振りながら話す",
  smug: "腕を組んでニヤリ(自信)",
  explain2: "手を差し出して説明",
  hand_chest: "胸に手を当てる(実感・共感)",
  talk2: "手を振りながら話す",
  hands_clasped: "手を組む(落ち着いて語る)",
  explain3: "手を差し出して説明",
};

export function loadPoseNames(): string[] {
  const cfgPath = path.join(process.cwd(), "reel", "character", "poses.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as { names: string[][] };
  return cfg.names.flat();
}

// APIキーなしでもキュー台本だけで動くよう、クライアントは使うときに作る
let client: Anthropic | undefined;

function systemPrompt(poses: string[]): string {
  const poseList = poses.map((p) => `- ${p}: ${POSE_DESCRIPTIONS[p] ?? ""}`).join("\n");
  return `あなたは純金の販売事業者のSNSで、キャラクター「ボス」(サングラスの頼れる兄貴分)が話す縦型リール動画の台本を書きます。

動画の構成:
- 4〜5シーン、合計18〜35秒
- 各シーンは「見出し(headline)」と、チビボスのセリフ(lines)からなる
- headline: 1〜4行、各行12文字以内。強調したい語句は *アスタリスク* で囲むと金色になる
- lines[].text: 1行18文字以内、最大2行(改行は\\n)。話し言葉で、親しみやすく
- lines[].secs: 1.5〜5秒。文字数が多いほど長く(目安: 1秒あたり7文字)
- lines[].pose: 次のいずれか
${poseList}
- 最初のセリフは必ず「${GREETING}」で始める(例: "${GREETING}\\n今日は〜の話だ")
- 最後のセリフは「じゃあ、またな。」で締める
- DMへの誘導は書かない

厳守事項:
- 「今買うべき」「必ず上がる」等の断定的な投資助言・価格予測は書かない
- 不安を過度に煽らない。事実ベースで落ち着いたトーン
- 与えられた情報にない数字・事実・引用を作らない
- 民族や宗教の属性とお金を結びつける表現(「ユダヤ人は金持ち」等)は書かない
- 絵文字は使わない
- 免責文・出典表記はこちらで付けるので書かない

caption: Instagramの投稿文(150〜300文字、ハッシュタグ3〜5個を末尾に)。免責文は書かない。

出力は次のJSONのみ。前後に説明文やコードフェンスは付けないこと。
{
  "relevant": boolean,
  "quoteSceneIndex": number,
  "scenes": [{ "headline": string[], "lines": [{ "text": string, "pose": string, "secs": number }] }],
  "caption": string
}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Claude did not return parseable JSON: ${trimmed.slice(0, 200)}`);
  }
}

async function ask(userMessage: string, poses: string[]): Promise<any> {
  client ??= new Anthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt(poses),
    messages: [{ role: "user", content: userMessage }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Claude response contained no text block");
  return extractJson(block.text);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// Claudeの出力を検証し、レンダラーが確実に扱える形に整える。
function cleanScenes(rawScenes: unknown, poses: string[]): ReelScene[] {
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    throw new Error("reel script has no scenes");
  }
  const scenes: ReelScene[] = rawScenes.slice(0, 6).map((s: any) => {
    const headline = (Array.isArray(s?.headline) ? s.headline : [])
      .filter((l: unknown): l is string => typeof l === "string" && l.trim() !== "")
      .slice(0, 4);
    const lines: ReelLine[] = (Array.isArray(s?.lines) ? s.lines : [])
      .filter((l: any) => typeof l?.text === "string" && l.text.trim() !== "")
      .slice(0, 4)
      .map((l: any) => ({
        text: l.text.split("\n").slice(0, 2).join("\n"),
        pose: poses.includes(l.pose) ? l.pose : "explain",
        secs: clamp(Number(l.secs) || 3, 1.5, 5),
      }));
    const scene: ReelScene = { headline, lines };
    if (typeof s?.note === "string" && s.note.trim() !== "") scene.note = s.note.trim();
    if (typeof s?.image === "string" && s.image.trim() !== "") scene.image = s.image.trim();
    return scene;
  });
  const usable = scenes.filter((s) => s.lines.length > 0);
  if (usable.length === 0) throw new Error("reel script has no spoken lines");
  // 第一声が「よう、ボスだ。」で始まっていなければ、あいさつを先頭に足す
  const first = usable[0].lines[0];
  if (!first.text.startsWith(GREETING)) {
    usable[0].lines.unshift({ text: GREETING, pose: "smile", secs: 1.5 });
  }
  return usable;
}

// Claude Code が書いて reel/queue/ に置いた台本を検証する(出典の note はそのまま使う)。
export function sanitizeQueued(raw: any, poses: string[]): GeneratedReel {
  const caption = typeof raw?.caption === "string" ? raw.caption.trim() : "";
  if (!caption) throw new Error("queued reel has no caption");
  return { script: { footer: REEL_FOOTER, scenes: cleanScenes(raw?.scenes, poses) }, caption };
}

export function sanitize(raw: any, poses: string[], note: { index: number; text: string }): GeneratedReel {
  const usable = cleanScenes(raw?.scenes, poses);
  const idx = clamp(Number.isInteger(note.index) ? note.index : 0, 0, usable.length - 1);
  usable[idx].note = note.text;

  const caption = typeof raw.caption === "string" ? raw.caption.trim() : "";
  return { script: { footer: REEL_FOOTER, scenes: usable }, caption };
}

export async function reelFromArticle(article: Article): Promise<GeneratedReel | null> {
  const poses = loadPoseNames();
  const raw = await ask(
    [
      "次の経済ニュースを題材に台本を書いてください。",
      "金(ゴールド)を持つことを考えるきっかけになるニュース(金価格の高騰・インフレ・円安などの通貨リスク・地政学リスク・中央銀行の金購入)でなければ relevant: false とし、scenes は空配列にしてください。",
      "quoteSceneIndex にはニュースの事実を紹介しているシーンの番号(0始まり)を入れてください。",
      "",
      `見出し: ${article.title}`,
      `出典: ${article.sourceName}`,
      article.summarySnippet ? `概要: ${article.summarySnippet}` : "",
    ].join("\n"),
    poses,
  );
  if (!raw?.relevant) return null;
  return sanitize(raw, poses, { index: Number(raw.quoteSceneIndex), text: `出典：${article.sourceName}` });
}

export async function reelFromTeaching(teaching: Teaching): Promise<GeneratedReel> {
  const poses = loadPoseNames();
  const raw = await ask(
    [
      "「お金の教え」シリーズの台本を書いてください。relevant は true にしてください。",
      "次の引用を、どこか1シーンの headline にそのまま(改行位置は自由)使ってください。引用の言い回しは変えないこと。",
      "quoteSceneIndex にはその引用を載せたシーンの番号(0始まり)を入れてください。",
      "最初のシーンは「ユダヤの知恵に学ぶお金の教え」のような導入にしてください。",
      "",
      `引用: ${teaching.quote}`,
      `意味: ${teaching.gist}`,
    ].join("\n"),
    poses,
  );
  return sanitize(raw, poses, { index: Number(raw?.quoteSceneIndex), text: `出典：${teaching.source}` });
}
