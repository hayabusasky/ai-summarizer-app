export interface FeedSource {
  name: string;
  url: string;
}

export interface Article {
  sourceName: string;
  title: string;
  link: string;
  publishedAt: string | undefined;
  summarySnippet: string | undefined;
}

export type GoldAngle =
  | "gold_price_ath" // 金価格の最高値・急騰更新
  | "real_rate_inflation" // インフレ・実質金利
  | "currency_weakness" // 円安・ドル安などの通貨リスク
  | "geopolitical_risk" // 地政学リスク・有事
  | "central_bank_buying" // 中央銀行の金購入動向
  | "not_relevant";

export interface GeneratedPost {
  angle: GoldAngle;
  relevant: boolean;
  shortPost: string;
  reasoning: string;
}

export interface PostedRecord {
  link: string;
  postedAt: string;
  angle: GoldAngle;
}
