// out/reel/reel.mp4 と caption.txt を Instagram リールに投稿する。
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { postReelToInstagram } from "../publish/instagram.js";

const DRY_RUN = process.env.DRY_RUN === "true";

async function main(): Promise<void> {
  const dir = path.join(process.cwd(), "out", "reel");
  const videoPath = path.join(dir, "reel.mp4");
  const caption = (await fs.readFile(path.join(dir, "caption.txt"), "utf-8")).trim();
  await fs.access(videoPath);

  if (DRY_RUN) {
    console.log(`--- DRY RUN: would post reel ${videoPath} ---\n${caption}\n----------------------------`);
    return;
  }
  const id = await postReelToInstagram(videoPath, caption);
  console.log(`[reel] posted to Instagram: media id ${id}`);
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `media_id=${id}\n`);
  }
}

main().catch((err) => {
  console.error("[reel] publish failed:", err);
  process.exit(1);
});
