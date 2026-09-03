import type { FeedSource } from "./types.js";

// NOTE: verify these RSS feeds still resolve before relying on them in production -
// this project could not reach the network to test them at build time.
// Add/remove feeds freely; the pipeline just needs title + link + (optional) summary per item.
export const FEED_SOURCES: FeedSource[] = [
  { name: "NHK経済", url: "https://www.nhk.or.jp/rss/news/cat5.xml" },
  { name: "Yahoo!ニュース 経済", url: "https://news.yahoo.co.jp/rss/categories/business.xml" },
  { name: "ロイター ビジネス", url: "https://assets.wor.jp/rss/rdf/reuters/business.rdf" },
];

export const MAX_ARTICLE_AGE_HOURS = 48;

export const MAX_ARTICLES_PER_RUN = Number(process.env.MAX_ARTICLES_PER_RUN ?? 3);

export const CLAUDE_MODEL = "claude-opus-5";

export const DISCLAIMER =
  "\n\n※本投稿は経済ニュースの解説であり、投資助言ではありません。ご判断は自己責任でお願いします。";

export const DM_CTA =
  "\n\n詳しい解説やご相談はDMまで。";
