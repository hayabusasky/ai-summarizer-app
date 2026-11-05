// リール台本を1本選び、レビュー用ファイルを out/reel/ に書き出す。
// 動画のレンダリングと Issue 作成は .github/workflows/reel-generate.yml が行う。
//
// 台本の出どころ(優先順):
//   1. reel/queue/*.json  … Claude Code が書いて置いた台本(ファイル名順に1本)。使ったら reel/done/ へ移す
//   2. REEL_API_FALLBACK=true のときだけ、Claude API でニュース/教えから台本を自動作成
// どちらもなければ何もせず終了する(generated=false)。
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { collectArticles } from "../collect.js";
import { DISCLAIMER, DM_CTA } from "../config.js";
import { loadPoseNames, reelFromArticle, reelFromTeaching, sanitizeQueued, type GeneratedReel } from "./script.js";
import { TEACHINGS } from "./teachings.js";
import { loadReelState, saveReelState } from "./state.js";
import { renderIssueBody, type ReelSourceKind } from "./issue.js";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "out", "reel");
const QUEUE_DIR = path.join(ROOT, "reel", "queue");
const DONE_DIR = path.join(ROOT, "reel", "done");
const MAX_NEWS_CHECKS = Number(process.env.REEL_MAX_NEWS_CHECKS ?? 3);
const API_FALLBACK = process.env.REEL_API_FALLBACK === "true";

interface Picked {
  reel: GeneratedReel;
  kind: ReelSourceKind;
  ref: string; // キューのファイル名 / 記事URL / 教えID
  label: string;
}

async function pickQueued(): Promise<Picked | null> {
  let files: string[];
  try {
    files = (await fs.readdir(QUEUE_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  const file = files[0];
  const raw = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, file), "utf-8"));
  const reel = sanitizeQueued(raw, loadPoseNames());
  await fs.mkdir(DONE_DIR, { recursive: true });
  await fs.rename(path.join(QUEUE_DIR, file), path.join(DONE_DIR, file));
  const label = typeof raw.title === "string" && raw.title ? raw.title : file;
  console.log(`[reel] using queued script ${file} (${files.length - 1} left in queue)`);
  return { reel, kind: "queued", ref: file, label };
}

async function pickNews(used: Set<string>): Promise<Picked | null> {
  const articles = (await collectArticles()).filter((a) => !used.has(a.link)).slice(0, MAX_NEWS_CHECKS);
  for (const article of articles) {
    try {
      const reel = await reelFromArticle(article);
      if (reel) return { reel, kind: "news", ref: article.link, label: article.title };
      console.log(`[reel] skip (not relevant): ${article.title}`);
    } catch (err) {
      console.error(`[reel] failed on "${article.title}":`, (err as Error).message);
    }
  }
  return null;
}

async function pickTeaching(usedOrder: string[]): Promise<Picked> {
  // 未使用のものを優先し、全部使い切ったら一番昔に使ったものから再利用する
  const unused = TEACHINGS.find((t) => !usedOrder.includes(t.id));
  const teaching =
    unused ?? TEACHINGS.find((t) => t.id === usedOrder.find((id) => TEACHINGS.some((x) => x.id === id)))!;
  const reel = await reelFromTeaching(teaching);
  return { reel, kind: "teaching", ref: teaching.id, label: teaching.quote };
}

async function setOutput(generated: boolean): Promise<void> {
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `generated=${generated}\n`);
}

async function main(): Promise<void> {
  const state = await loadReelState();
  let picked = await pickQueued();
  if (!picked && API_FALLBACK) {
    picked = (await pickNews(new Set(state.usedLinks))) ?? (await pickTeaching(state.usedTeachings));
  }
  if (!picked) {
    console.log("[reel] queue is empty (reel/queue/). Ask Claude Code to write more scripts. Nothing generated.");
    await setOutput(false);
    return;
  }

  const caption = `${picked.reel.caption}${DM_CTA}${DISCLAIMER}`.slice(0, 2200);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "script.json"), JSON.stringify(picked.reel.script, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "caption.txt"), caption + "\n");
  await fs.writeFile(
    path.join(OUT_DIR, "issue.md"),
    renderIssueBody({ kind: picked.kind, label: picked.label, ref: picked.ref, caption, script: picked.reel.script }),
  );
  const kindLabel = { queued: "台本", news: "ニュース", teaching: "教え" }[picked.kind];
  await fs.writeFile(path.join(OUT_DIR, "title.txt"), `[リール確認] ${kindLabel}: ${picked.label.slice(0, 40)}\n`);

  if (picked.kind === "news") state.usedLinks.push(picked.ref);
  if (picked.kind === "teaching") {
    state.usedTeachings = [...state.usedTeachings.filter((id) => id !== picked.ref), picked.ref];
  }
  await saveReelState(state);
  await setOutput(true);
  console.log(`[reel] generated ${picked.kind} reel: ${picked.label}`);
}

main().catch((err) => {
  console.error("[reel] fatal error:", err);
  process.exit(1);
});
