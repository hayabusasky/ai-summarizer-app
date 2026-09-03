import Parser from "rss-parser";
import { FEED_SOURCES, MAX_ARTICLE_AGE_HOURS } from "./config.js";
import type { Article } from "./types.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; ai-summarizer-app/0.1; +https://github.com/)",
  },
});

function isRecent(publishedAt: string | undefined): boolean {
  if (!publishedAt) return true; // keep items with no date rather than dropping them
  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(published)) return true;
  const ageHours = (Date.now() - published) / (1000 * 60 * 60);
  return ageHours <= MAX_ARTICLE_AGE_HOURS;
}

export async function collectArticles(): Promise<Article[]> {
  const results: Article[] = [];

  for (const source of FEED_SOURCES) {
    try {
      const feed = await parser.parseURL(source.url);
      for (const item of feed.items) {
        if (!item.link || !item.title) continue;
        if (!isRecent(item.isoDate ?? item.pubDate)) continue;
        results.push({
          sourceName: source.name,
          title: item.title,
          link: item.link,
          publishedAt: item.isoDate ?? item.pubDate,
          summarySnippet: item.contentSnippet ?? item.content,
        });
      }
    } catch (err) {
      console.error(`[collect] failed to fetch ${source.name} (${source.url}):`, (err as Error).message);
    }
  }

  return results;
}
