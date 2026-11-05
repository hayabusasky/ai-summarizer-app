import fs from "node:fs/promises";

// Instagram Graph API の Reels 投稿。動画は公開URLを用意せず、resumable upload で直接送る。
// 手順: コンテナ作成(upload_type=resumable) → rupload に動画を送信 → 処理完了を待つ → 公開
// NOTE: 開発環境からはAPIに接続できず未検証。初回は手動実行で動作確認してください。
const API_VERSION = process.env.IG_API_VERSION ?? "v23.0";
const GRAPH_HOST = process.env.IG_GRAPH_HOST ?? "graph.facebook.com";
const UPLOAD_HOST = "rupload.facebook.com";

function credentials(): { userId: string; token: string } {
  const { IG_USER_ID, IG_ACCESS_TOKEN } = process.env;
  if (!IG_USER_ID || !IG_ACCESS_TOKEN) {
    throw new Error("Missing Instagram credentials (IG_USER_ID / IG_ACCESS_TOKEN)");
  }
  return { userId: IG_USER_ID, token: IG_ACCESS_TOKEN };
}

async function graph(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://${GRAPH_HOST}/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method });
  const body = await res.json();
  if (!res.ok) throw new Error(`Instagram API error (${res.status}): ${JSON.stringify(body)}`);
  return body;
}

async function waitUntilReady(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { status_code, status } = await graph("GET", containerId, { fields: "status_code,status", access_token: token });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new Error(`Instagram media processing failed: ${status_code} ${status ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error("Instagram media processing timed out (10 min)");
}

export async function postReelToInstagram(videoPath: string, caption: string): Promise<string> {
  const { userId, token } = credentials();
  const video = await fs.readFile(videoPath);

  const container = await graph("POST", `${userId}/media`, {
    media_type: "REELS",
    upload_type: "resumable",
    caption,
    share_to_feed: "true",
    access_token: token,
  });

  const upload = await fetch(`https://${UPLOAD_HOST}/ig-api-upload/${API_VERSION}/${container.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(video.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: video,
  });
  if (!upload.ok) {
    throw new Error(`Instagram upload error (${upload.status}): ${await upload.text()}`);
  }

  await waitUntilReady(container.id, token);
  const published = await graph("POST", `${userId}/media_publish`, { creation_id: container.id, access_token: token });
  return published.id;
}
