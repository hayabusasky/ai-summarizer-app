"""台本JSONから、キャラクター付きの縦型リール動画(1080x1920 MP4)を作る。

使い方:
    python3 reel/make_reel.py reel/scripts/talmud_money.json out/talmud_money.mp4

必要なもの: Python 3 + Pillow, ffmpeg
台本JSONの書き方は reel/README.md を参照。
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
XFADE = 0.5
HERE = Path(__file__).resolve().parent
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
GOLD = (232, 196, 110)
WHITE = (250, 246, 238)
INK = (30, 24, 16)

# キャラクターの配置(下部)
CHAR_W = 900
CHAR_X = (W - CHAR_W) // 2
CHAR_BOTTOM = H - 130
# セリフ字幕ボックス(キャラの上)
SUB_TOP, SUB_BOTTOM = 1000, 1190
# 見出し領域
HEAD_TOP, HEAD_BOTTOM = 260, 960


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


# ---------- キャラクター ----------

def load_poses() -> dict[str, Image.Image]:
    cfg = json.loads((HERE / "character" / "poses.json").read_text(encoding="utf-8"))
    sheet = Image.open(HERE / "character" / cfg["sheet"]).convert("RGBA")
    xs, ys = cfg["columns"], cfg["rows"]
    poses = {}
    for r, row in enumerate(cfg["names"]):
        for c, name in enumerate(row):
            cell = sheet.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
            poses[name] = keep_main_component(cell)
    return poses


def keep_main_component(cell: Image.Image) -> Image.Image:
    """隣のコマからはみ出した破片を消し、中央のキャラ本体だけ残す。"""
    alpha = cell.getchannel("A")
    mask = alpha.point(lambda v: 255 if v > 30 else 0)
    w, h = mask.size
    seed = None
    for dy in range(0, h // 2, 4):  # 中央付近の不透明ピクセルを探す
        for y in (h // 2 - dy, h // 2 + dy):
            for x in range(w // 3, 2 * w // 3, 4):
                if 0 <= y < h and mask.getpixel((x, y)) == 255:
                    seed = (x, y)
                    break
            if seed:
                break
        if seed:
            break
    if seed is None:
        return cell
    ImageDraw.floodfill(mask, seed, 128)
    keep = mask.point(lambda v: 255 if v == 128 else 0).filter(ImageFilter.MaxFilter(3))
    out = cell.copy()
    out.putalpha(Image.composite(alpha, Image.new("L", cell.size, 0), keep))
    return out.crop(out.getbbox())


# ---------- 背景 ----------

def gradient_bg() -> Image.Image:
    top, bottom = (20, 17, 12), (46, 34, 18)
    bg = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.1, H * 0.12, W * 0.9, H * 0.5], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    return Image.composite(Image.new("RGB", (W, H), GOLD), bg, glow)


def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((l, t, l + w, t + h))


def resolve_image(image: str | None, base: Path) -> Path | None:
    """台本からの相対パス → リポジトリ直下からの相対パスの順に探す。見つからなければ None。"""
    if not image:
        return None
    for cand in (base / image, Path.cwd() / image, HERE.parent / image):
        if cand.is_file():
            return cand
    print(f"warning: background image not found, using gradient: {image}", file=sys.stderr)
    return None


def scene_bg(image: str | None, base: Path) -> Image.Image:
    path = resolve_image(image, base)
    if path is None:
        bg = gradient_bg()
    else:
        bg = cover(Image.open(path).convert("RGB"), W, H)
        # 文字とキャラが読みやすいよう暗くする
        bg = Image.blend(bg, Image.new("RGB", (W, H), (0, 0, 0)), 0.45)
    return cover(bg, int(W * 1.12), int(H * 1.12))


# ---------- テキスト ----------

def parse_markup(line: str) -> list[tuple[str, tuple[int, int, int]]]:
    """*囲み* の部分を金色にする。"""
    parts, gold = [], False
    for chunk in line.split("*"):
        if chunk:
            parts.append((chunk, GOLD if gold else WHITE))
        gold = not gold
    return parts


def draw_rich(d: ImageDraw.ImageDraw, y: int, line: str, size: int) -> None:
    f = font(size)
    parts = parse_markup(line)
    total = sum(d.textlength(t, font=f) for t, _ in parts)
    x = (W - total) / 2
    for text, color in parts:
        d.text((x, y), text, font=f, fill=color + (255,), stroke_width=4, stroke_fill=(0, 0, 0, 220))
        x += d.textlength(text, font=f)


def fit_size(d: ImageDraw.ImageDraw, lines: list[str], size: int, max_w: int) -> int:
    while size > 30:
        f = font(size)
        if all(d.textlength(l.replace("*", ""), font=f) <= max_w for l in lines):
            return size
        size -= 4
    return size


def headline_layer(lines: list[str], note: str, footer: str) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if lines:
        size = fit_size(d, lines, 96, W - 120)
        lh = int(size * 1.45)
        y = HEAD_TOP + (HEAD_BOTTOM - HEAD_TOP - lh * len(lines)) // 2
        for line in lines:
            draw_rich(d, y, line, size)
            y += lh
    if note:
        f = font(32)
        d.text(((W - d.textlength(note, font=f)) / 2, HEAD_BOTTOM - 10), note, font=f,
               fill=WHITE + (220,), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    if footer:
        f = font(28)
        d.text(((W - d.textlength(footer, font=f)) / 2, H - 70), footer, font=f,
               fill=WHITE + (200,), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    return layer


def subtitle_layer(text: str) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    lines = text.split("\n")
    size = fit_size(d, lines, 58, W - 200)
    f = font(size)
    lh = int(size * 1.35)
    box_h = lh * len(lines) + 50
    top = SUB_BOTTOM - box_h
    d.rounded_rectangle([60, top, W - 60, SUB_BOTTOM], radius=36, fill=(255, 250, 238, 235),
                        outline=GOLD + (255,), width=5)
    # 吹き出しのしっぽ(キャラの方向)
    cx = W // 2
    d.polygon([(cx - 30, SUB_BOTTOM - 3), (cx + 30, SUB_BOTTOM - 3), (cx, SUB_BOTTOM + 40)],
              fill=(255, 250, 238, 235))
    y = top + 25
    for line in lines:
        d.text(((W - d.textlength(line, font=f)) / 2, y), line, font=f, fill=INK + (255,))
        y += lh
    return layer


# ---------- 合成 ----------

def render_scene(i: int, scene: dict, poses: dict, base: Path, footer: str, work: Path) -> tuple[Path, float]:
    lines = scene["lines"]
    total = sum(float(l["secs"]) for l in lines)
    bg_p = work / f"bg{i}.png"
    head_p = work / f"head{i}.png"
    scene_bg(scene.get("image"), base).save(bg_p)
    headline_layer(scene.get("headline", []), scene.get("note", ""), footer).save(head_p)

    inputs = ["-loop", "1", "-i", str(bg_p), "-loop", "1", "-i", str(head_p)]
    frames = int(total * FPS)
    z = f"1+0.1*on/{frames}" if i % 2 == 0 else f"1.1-0.1*on/{frames}"
    graph = [
        f"[0:v]zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}[bg]",
        "[1:v]format=rgba,fade=in:st=0.2:d=0.5:alpha=1[hd]",
        "[bg][hd]overlay=0:0[v0]",
    ]
    last, idx, t = "v0", 2, 0.0
    for k, line in enumerate(lines):
        secs = float(line["secs"])
        pose_name = line.get("pose", "smile")
        if pose_name not in poses:
            raise SystemExit(f"unknown pose '{pose_name}'. use one of: {', '.join(poses)}")
        pose = poses[pose_name]
        ph = round(pose.height * CHAR_W / pose.width)
        pose_p, sub_p = work / f"pose{i}_{k}.png", work / f"sub{i}_{k}.png"
        pose.resize((CHAR_W, ph), Image.LANCZOS).save(pose_p)
        subtitle_layer(line["text"]).save(sub_p)
        inputs += ["-loop", "1", "-i", str(pose_p), "-loop", "1", "-i", str(sub_p)]
        en = f"between(t,{t:.2f},{t + secs:.2f})"
        y0 = CHAR_BOTTOM - ph
        # 話している間、軽く上下に揺らす
        graph.append(f"[{last}][{idx}:v]overlay=x={CHAR_X}:y='{y0}-10*abs(sin(2*PI*1.6*(t-{t:.2f})))':enable='{en}'[c{k}]")
        graph.append(f"[c{k}][{idx + 1}:v]overlay=0:0:enable='{en}'[s{k}]")
        last, idx, t = f"s{k}", idx + 2, t + secs
    graph.append(f"[{last}]format=yuv420p[out]")

    clip = work / f"scene{i}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(graph),
                    "-map", "[out]", "-t", f"{total:.2f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "19",
                    str(clip)], check=True)
    return clip, total


def concat(clips: list[tuple[Path, float]], out: Path, bgm: Path | None) -> None:
    inputs = []
    for c, _ in clips:
        inputs += ["-i", str(c)]
    if len(clips) == 1:
        graph, last = "[0:v]null[v]", "v"
    else:
        parts, last, offset = [], "0:v", 0.0
        for k in range(1, len(clips)):
            offset += clips[k - 1][1] - XFADE
            parts.append(f"[{last}][{k}:v]xfade=transition=fade:duration={XFADE}:offset={offset:.2f}[x{k}]")
            last = f"x{k}"
        graph = ";".join(parts)
    audio = []
    if bgm:
        total = sum(s for _, s in clips) - XFADE * (len(clips) - 1)
        inputs += ["-stream_loop", "-1", "-i", str(bgm)]
        graph += f";[{len(clips)}:a]volume=0.35,afade=out:st={max(total - 1.5, 0):.2f}:d=1.5[a]"
        audio = ["-map", "[a]", "-c:a", "aac", "-shortest"]
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", f"[{last}]",
                    *audio, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    str(out)], check=True)


def main(script_path: Path, out: Path) -> None:
    script = json.loads(script_path.read_text(encoding="utf-8"))
    base = script_path.parent
    poses = load_poses()
    footer = script.get("footer", "")
    bgm = base / script["bgm"] if script.get("bgm") else None
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        clips = [render_scene(i, s, poses, base, footer, work) for i, s in enumerate(script["scenes"])]
        concat(clips, out, bgm)
    print(f"wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
