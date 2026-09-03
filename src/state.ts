import fs from "node:fs/promises";
import path from "node:path";
import type { PostedRecord } from "./types.js";

const STATE_PATH = path.join(process.cwd(), "data", "posted.json");
const MAX_HISTORY = 500;

export async function loadPostedLinks(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    const records = JSON.parse(raw) as PostedRecord[];
    return new Set(records.map((r) => r.link));
  } catch {
    return new Set();
  }
}

export async function recordPosted(records: PostedRecord[]): Promise<void> {
  if (records.length === 0) return;
  let existing: PostedRecord[] = [];
  try {
    existing = JSON.parse(await fs.readFile(STATE_PATH, "utf-8"));
  } catch {
    existing = [];
  }
  const merged = [...existing, ...records].slice(-MAX_HISTORY);
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}
