import fs from "node:fs/promises";
import path from "node:path";

const STATE_PATH = path.join(process.cwd(), "data", "reels.json");
const MAX_LINKS = 500;

export interface ReelState {
  usedLinks: string[]; // リールにしたニュース記事のURL
  usedTeachings: string[]; // 使った教えのID(古い順)
}

export async function loadReelState(): Promise<ReelState> {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_PATH, "utf-8")) as Partial<ReelState>;
    return { usedLinks: raw.usedLinks ?? [], usedTeachings: raw.usedTeachings ?? [] };
  } catch {
    return { usedLinks: [], usedTeachings: [] };
  }
}

export async function saveReelState(state: ReelState): Promise<void> {
  const trimmed = { ...state, usedLinks: state.usedLinks.slice(-MAX_LINKS) };
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(trimmed, null, 2) + "\n", "utf-8");
}
