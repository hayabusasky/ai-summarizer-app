// reel/queue/ の台本をチェックする。台本を書いたら必ず実行する: npm run reel:check
import fs from "node:fs/promises";
import path from "node:path";
import { loadPoseNames, sanitizeQueued } from "./script.js";

const QUEUE_DIR = path.join(process.cwd(), "reel", "queue");
const HEADLINE_MAX = 12; // 見出し1行の目安文字数(* は数えない)
const LINE_MAX = 18; // セリフ1行の目安文字数
const BANNED = ["必ず上が", "絶対", "今買うべき", "今すぐ買", "儲かる", "損しない", "ユダヤ人は"];

async function main(): Promise<void> {
  const poses = loadPoseNames();
  const files = (await fs.readdir(QUEUE_DIR).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    const problems: string[] = [];
    const notes: string[] = [];
    try {
      const raw = JSON.parse(await fs.readFile(path.join(QUEUE_DIR, file), "utf-8"));
      const { script, caption } = sanitizeQueued(raw, poses);
      const total = script.scenes.flatMap((s) => s.lines).reduce((sum, l) => sum + l.secs, 0);
      if (total < 15 || total > 45) notes.push(`合計 ${total.toFixed(1)} 秒(目安 18〜35 秒)`);
      if (!script.scenes.some((s) => s.note)) notes.push("出典(note)のあるシーンがない");

      raw.scenes.forEach((s: any, i: number) => {
        for (const h of s.headline ?? []) {
          if (String(h).replace(/\*/g, "").length > HEADLINE_MAX) notes.push(`シーン${i + 1} 見出しが長い: ${h}`);
        }
        for (const l of s.lines ?? []) {
          if (!poses.includes(l.pose)) problems.push(`シーン${i + 1} 不明なポーズ: ${l.pose}`);
          for (const t of String(l.text).split("\n")) {
            if (t.length > LINE_MAX) notes.push(`シーン${i + 1} セリフが長い: ${t}`);
          }
          if (String(l.text).split("\n").length > 2) problems.push(`シーン${i + 1} セリフが3行以上`);
        }
      });

      const allText = JSON.stringify(raw.scenes) + caption;
      for (const word of BANNED) {
        // 「今すぐ買えって話じゃない」のような否定形は許可
        const re = new RegExp(`${word}(?!えって話じゃない)`);
        if (re.test(allText)) problems.push(`使わない表現が含まれている: 「${word}」`);
      }
    } catch (err) {
      problems.push((err as Error).message);
    }

    errors += problems.length;
    warnings += notes.length;
    const status = problems.length ? "NG" : notes.length ? "注意" : "OK";
    console.log(`[${status}] ${file}`);
    for (const p of problems) console.log(`   ✗ ${p}`);
    for (const n of notes) console.log(`   ! ${n}`);
  }

  console.log(`\n${files.length} 本 / エラー ${errors} / 注意 ${warnings}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
