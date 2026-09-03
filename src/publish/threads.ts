const GRAPH_BASE = "https://graph.threads.net/v1.0";

async function graphPost(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url.toString(), { method: "POST" });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Threads API error (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

// Two-step publish flow per Meta's Threads API: create a media container, then publish it.
export async function postToThreads(text: string): Promise<string> {
  const { THREADS_USER_ID, THREADS_ACCESS_TOKEN } = process.env;
  if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
    throw new Error("Missing Threads credentials (THREADS_USER_ID / THREADS_ACCESS_TOKEN)");
  }

  const container = await graphPost(`${THREADS_USER_ID}/threads`, {
    media_type: "TEXT",
    text,
    access_token: THREADS_ACCESS_TOKEN,
  });

  const publish = await graphPost(`${THREADS_USER_ID}/threads_publish`, {
    creation_id: container.id,
    access_token: THREADS_ACCESS_TOKEN,
  });

  return publish.id;
}
