// 承認された Issue(GitHub Actions のイベント)から台本とキャプションを取り出し、out/reel/ に書く。
import fs from "node:fs/promises";
import path from "node:path";
import { parseIssueBody } from "./issue.js";

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set (run inside GitHub Actions)");
  const event = JSON.parse(await fs.readFile(eventPath, "utf-8"));
  const body: string = event?.issue?.body ?? "";

  const { caption, script } = parseIssueBody(body);
  const outDir = path.join(process.cwd(), "out", "reel");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "script.json"), JSON.stringify(script, null, 2) + "\n");
  await fs.writeFile(path.join(outDir, "caption.txt"), caption + "\n");
  console.log(`[reel] extracted ${script.scenes.length} scenes from issue #${event.issue.number}`);
}

main().catch((err) => {
  console.error("[reel] extract failed:", err);
  process.exit(1);
});
