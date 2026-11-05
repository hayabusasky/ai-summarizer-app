// リール台本を1本作り、レビュー用ファイルを out/reel/ に書き出す。
// 動画のレンダリングと Issue 作成は .github/workflows/reel-generate.yml が行う。
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { collectArticles } from "../collect.js";
import { DISCLAIMER, DM_CTA } from "../config.js";
import { reelFromArticle, reelFromTeaching, type GeneratedReel } from "./script.js";
import { TEACHINGS } from "./teachings.js";
import { loadReelState, saveReelState } from "./state.js";
import { renderIssueBody } from "./issue.js";

const OUT_DIR = path.join(process.cwd(), "out", "reel");
const MAX_NEWS_CHECKS = Number(process.env.REEL_MAX_NEWS_CHECKS ?? 3);

interface Picked {
  reel: GeneratedReel;
  kind: "news" | "teaching";
  ref: string; // 記事URL or 教えID
  label: string;
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

async function main(): Promise<void> {
  const state = await loadReelState();
  const picked = (await pickNews(new Set(state.usedLinks))) ?? (await pickTeaching(state.usedTeachings));

  const caption = `${picked.reel.caption}${DM_CTA}${DISCLAIMER}`.slice(0, 2200);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "script.json"), JSON.stringify(picked.reel.script, null, 2) + "\n");
  await fs.writeFile(path.join(OUT_DIR, "caption.txt"), caption + "\n");
  await fs.writeFile(
    path.join(OUT_DIR, "issue.md"),
    renderIssueBody({ kind: picked.kind, label: picked.label, ref: picked.ref, caption, script: picked.reel.script }),
  );
  const kindLabel = picked.kind === "news" ? "ニュース" : "教え";
  await fs.writeFile(path.join(OUT_DIR, "title.txt"), `[リール確認] ${kindLabel}: ${picked.label.slice(0, 40)}\n`);

  if (picked.kind === "news") state.usedLinks.push(picked.ref);
  else state.usedTeachings = [...state.usedTeachings.filter((id) => id !== picked.ref), picked.ref];
  await saveReelState(state);

  console.log(`[reel] generated ${picked.kind} reel: ${picked.label}`);
}

main().catch((err) => {
  console.error("[reel] fatal error:", err);
  process.exit(1);
});
