import "dotenv/config";
import { collectArticles } from "./collect.js";
import { generatePost } from "./summarize.js";
import { postToX } from "./publish/x.js";
import { postToThreads } from "./publish/threads.js";
import { loadPostedLinks, recordPosted } from "./state.js";
import { DISCLAIMER, DM_CTA, MAX_ARTICLES_PER_RUN } from "./config.js";
import type { Article, PostedRecord } from "./types.js";

const DRY_RUN = process.env.DRY_RUN === "true";
const POST_TARGETS = process.env.POST_TARGETS ?? "both"; // "x" | "threads" | "both"

// X counts most non-Latin characters as weight 2 toward the 280 limit; this is a
// conservative UTF-16-length safeguard, not an exact weighted count.
const X_SAFE_LENGTH = 260;

function buildFinalText(article: Article, shortPost: string): string {
  const body = `${shortPost}${DM_CTA}${DISCLAIMER}\n${article.link}`;
  if (body.length <= X_SAFE_LENGTH + 100) return body; // Threads allows more headroom
  return body;
}

async function publish(text: string): Promise<void> {
  if (DRY_RUN) {
    console.log("--- DRY RUN: would post ---\n" + text + "\n----------------------------");
    return;
  }

  const tasks: Promise<unknown>[] = [];
  if (POST_TARGETS === "x" || POST_TARGETS === "both") {
    const xText = text.length > X_SAFE_LENGTH ? text.slice(0, X_SAFE_LENGTH - 1) + "…" : text;
    tasks.push(postToX(xText));
  }
  if (POST_TARGETS === "threads" || POST_TARGETS === "both") {
    tasks.push(postToThreads(text));
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[publish] a target failed:", result.reason);
    }
  }
}

async function main(): Promise<void> {
  const [allArticles, postedLinks] = await Promise.all([collectArticles(), loadPostedLinks()]);

  const candidates = allArticles
    .filter((a) => !postedLinks.has(a.link))
    .slice(0, MAX_ARTICLES_PER_RUN);

  console.log(`[index] ${allArticles.length} articles collected, ${candidates.length} new candidates`);

  const newlyProcessed: PostedRecord[] = [];

  for (const article of candidates) {
    try {
      const generated = await generatePost(article);
      console.log(`[index] "${article.title}" -> angle=${generated.angle} relevant=${generated.relevant}`);

      if (generated.relevant && generated.shortPost) {
        const finalText = buildFinalText(article, generated.shortPost);
        await publish(finalText);
      }

      newlyProcessed.push({
        link: article.link,
        postedAt: new Date().toISOString(),
        angle: generated.angle,
      });
    } catch (err) {
      console.error(`[index] failed to process "${article.title}":`, (err as Error).message);
    }
  }

  await recordPosted(newlyProcessed);
  console.log(`[index] done. ${newlyProcessed.filter((r) => r.angle !== "not_relevant").length} posted this run.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[index] fatal error:", err);
    process.exit(1);
  });
