import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "./config.js";
import type { Article, GeneratedPost, GoldAngle } from "./types.js";

const client = new Anthropic();

const VALID_ANGLES: GoldAngle[] = [
  "gold_price_ath",
  "real_rate_inflation",
  "currency_weakness",
  "geopolitical_risk",
  "central_bank_buying",
  "not_relevant",
];

const SYSTEM_PROMPT = `あなたは純金の販売事業者向けに、経済ニュースをSNS(X/Threads)向けの短文に加工するアシスタントです。

読者が「金を持っておきたい」と自然に感じるきっかけになるニュースだけを取り上げます。該当する切り口は次の5つです。
- gold_price_ath: 金価格の最高値更新・急騰
- real_rate_inflation: インフレ・実質金利の低下
- currency_weakness: 円安・ドル安などの通貨リスク
- geopolitical_risk: 地政学リスク・有事
- central_bank_buying: 中央銀行による金購入動向

与えられたニュースがこれらのどれにも当てはまらない場合は relevant: false, angle: "not_relevant" としてください。

短文(shortPost)を書く際の厳守事項:
- 客観的なニュース解説に徹し、「今買うべき」「必ず上がる」等の断定的な投資助言・価格予測は書かない
- 誇張や不安を過度に煽る表現は避け、事実ベースで淡々と伝える
- 全角ベースで100〜120文字程度
- 絵文字は使わない
- 出典やDM誘導の文言、免責文はこちらで別途付与するので含めない

出力は次のJSONのみを返してください。前後に説明文やコードフェンスは付けないこと。
{
  "relevant": boolean,
  "angle": "gold_price_ath" | "real_rate_inflation" | "currency_weakness" | "geopolitical_risk" | "central_bank_buying" | "not_relevant",
  "shortPost": string,
  "reasoning": string  // 1文で選定理由(社内ログ用、投稿はしない)
}`;

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

export async function generatePost(article: Article): Promise<GeneratedPost> {
  const userMessage = [
    `見出し: ${article.title}`,
    `出典: ${article.sourceName}`,
    article.summarySnippet ? `概要: ${article.summarySnippet}` : undefined,
    `URL: ${article.link}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response contained no text block");
  }

  const parsed = extractJson(textBlock.text) as Partial<GeneratedPost>;

  const angle: GoldAngle = VALID_ANGLES.includes(parsed.angle as GoldAngle)
    ? (parsed.angle as GoldAngle)
    : "not_relevant";

  return {
    relevant: Boolean(parsed.relevant) && angle !== "not_relevant",
    angle,
    shortPost: typeof parsed.shortPost === "string" ? parsed.shortPost : "",
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}
