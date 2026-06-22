#!/usr/bin/env python3
"""Generate favicon + OG image from Cleo selfie source art."""

from __future__ import annotations

import math
import shutil
import struct
import zlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
SOURCE = Path("/Users/kingj/Downloads/cleo-selfie.png")
FONTS = {
    "display": Path("/tmp/LilitaOne-Regular.ttf"),
    "body": Path("/System/Library/Fonts/SFCompactRounded.ttf"),
}

# App theme tokens (public/styles.css)
CREAM = (255, 249, 252)
BLUSH = (255, 240, 246)
SKY = (232, 244, 255)
INK = (74, 63, 85)
MUTED = (155, 143, 168)
PINK = (255, 143, 171)
PINK_DEEP = (240, 98, 146)
LAVENDER = (184, 169, 255)
MINT = (126, 212, 184)
GOLD = (255, 200, 87)


def remove_black(im: Image.Image, threshold: int = 42) -> Image.Image:
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r <= threshold and g <= threshold and b <= threshold:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def circular_avatar(im: Image.Image, size: int, border: int = 0, border_color=PINK) -> Image.Image:
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    if border:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        draw.ellipse((0, 0, size - 1, size - 1), fill=border_color)
        inner = size - border * 2
        avatar = out.resize((inner, inner), Image.Resampling.LANCZOS)
        inner_mask = Image.new("L", (inner, inner), 0)
        ImageDraw.Draw(inner_mask).ellipse((0, 0, inner - 1, inner - 1), fill=255)
        canvas.paste(avatar, (border, border), inner_mask)
        return canvas
    return out


def write_ico(path: Path, images: list[Image.Image]) -> None:
    """Minimal ICO writer (no external deps)."""
    entries = []
    offset = 6 + 16 * len(images)
    for im in images:
        im = im.convert("RGBA")
        w, h = im.size
        png = _png_bytes(im)
        entries.append((w, h, png, offset))
        offset += len(png)

    with path.open("wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(entries)))
        data_offset = 6 + 16 * len(entries)
        cursor = data_offset
        for w, h, png, _ in entries:
            f.write(
                struct.pack(
                    "<BBBBHHII",
                    w if w < 256 else 0,
                    h if h < 256 else 0,
                    0,
                    0,
                    1,
                    32,
                    len(png),
                    cursor,
                )
            )
            cursor += len(png)
        for _, _, png, _ in entries:
            f.write(png)


def _png_bytes(im: Image.Image) -> bytes:
    import io

    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def gradient_bg(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        ty = y / max(h - 1, 1)
        for x in range(w):
            tx = x / max(w - 1, 1)
            t = tx * 0.35 + ty * 0.65
            if t < 0.38:
                u = t / 0.38
                c = tuple(lerp(CREAM[i], BLUSH[i], u) for i in range(3))
            else:
                u = (t - 0.38) / 0.62
                c = tuple(lerp(BLUSH[i], SKY[i], u) for i in range(3))
            px[x, y] = c
    return img


def draw_bubbles(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    specs = [
        (90, 80, 46, (*PINK, 38)),
        (180, 520, 72, (*LAVENDER, 32)),
        (1080, 120, 58, (*MINT, 30)),
        (1120, 480, 40, (*GOLD, 45)),
        (980, 560, 86, (*PINK, 22)),
        (40, 360, 34, (*SKY, 80)),
    ]
    for x, y, r, fill in specs:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def build_og(cleo: Image.Image) -> Image.Image:
    w, h = 1200, 630
    base = gradient_bg(w, h).convert("RGBA")
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw_bubbles(draw, w, h)

    # Soft light shafts
    shaft = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shaft)
    sdraw.polygon([(0, 0), (420, 0), (180, h), (-80, h)], fill=(255, 200, 220, 55))
    sdraw.polygon([(w, 0), (w + 80, 0), (w - 180, h), (w - 420, h)], fill=(200, 220, 255, 48))
    shaft = shaft.filter(ImageFilter.GaussianBlur(28))
    overlay = Image.alpha_composite(overlay, shaft)

    # Cleo portrait — circular, tilted, with glow
    portrait_size = 430
    portrait = circular_avatar(cleo, portrait_size, border=10, border_color=PINK)
    shadow = Image.new("RGBA", (portrait_size + 80, portrait_size + 80), (0, 0, 0, 0))
    sh = ImageDraw.Draw(shadow)
    sh.ellipse((30, 34, portrait_size + 44, portrait_size + 48), fill=(255, 143, 171, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    rotated = portrait.rotate(-8, resample=Image.Resampling.BICUBIC, expand=True)
    px = w - rotated.width - 88
    py = (h - rotated.height) // 2 + 8
    overlay.alpha_composite(shadow, (px - 18, py - 6))
    overlay.alpha_composite(rotated, (px, py))

    # Decorative sparkles
    sparkle_draw = ImageDraw.Draw(overlay)
    for sx, sy, sr in [(720, 110, 5), (760, 520, 4), (640, 90, 3), (690, 560, 4)]:
        sparkle_draw.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=(*GOLD, 200))

    base = Image.alpha_composite(base, overlay)

    draw = ImageDraw.Draw(base)
    display_font = ImageFont.truetype(str(FONTS["display"]), 92)
    body_font = ImageFont.truetype(str(FONTS["body"]), 34)
    lead_font = ImageFont.truetype(str(FONTS["body"]), 28)

    text_x = 72
    text_max = 620

    kicker = "Cleo's First Birthday"
    draw.text((text_x, 118), kicker, font=body_font, fill=PINK_DEEP)

    title = "Bubble Quest"
    draw.text((text_x - 3, 168), title, font=display_font, fill=INK)

    lead = "Photo quests for the whole party"
    for i, line in enumerate(wrap_text(draw, lead, lead_font, text_max)):
        draw.text((text_x, 292 + i * 38), line, font=lead_font, fill=MUTED)

    # Pill badge
    badge_text = "Bubble treasure hunt"
    badge_w = int(draw.textlength(badge_text, font=lead_font) + 44)
    badge_h = 52
    badge_y = 390
    draw.rounded_rectangle(
        (text_x, badge_y, text_x + badge_w, badge_y + badge_h),
        radius=26,
        fill=(255, 255, 255, 210),
        outline=(*PINK, 90),
        width=2,
    )
    draw.text((text_x + 22, badge_y + 11), badge_text, font=lead_font, fill=INK)

    return base.convert("RGB")


def build_favicon_source(cleo: Image.Image) -> Image.Image:
    """Tighter crop on the face for legibility at 16–32px."""
    w, h = cleo.size
    crop = cleo.crop((int(w * 0.08), int(h * 0.12), int(w * 0.88), int(h * 0.92)))
    size = 256
    avatar = circular_avatar(crop, size - 28, border=0)
    canvas = Image.new("RGBA", (size, size), (*CREAM, 255))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((0, 0, size - 1, size - 1), fill=(*CREAM, 255))
    draw.ellipse((6, 6, size - 7, size - 7), fill=PINK)
    inner = size - 28
    offset = (size - inner) // 2
    canvas.paste(avatar, (offset, offset), avatar)
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source image: {SOURCE}")

    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE, PUBLIC / "cleo-selfie.png")

    raw = Image.open(SOURCE)
    cleo = remove_black(raw)

    favicon_src = build_favicon_source(cleo)
    favicon_src.save(PUBLIC / "favicon-256.png", optimize=True)

    sizes = [16, 32, 48]
    ico_images = [favicon_src.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    write_ico(PUBLIC / "favicon.ico", ico_images)
    favicon_src.resize((32, 32), Image.Resampling.LANCZOS).save(PUBLIC / "favicon-32.png", optimize=True)
    favicon_src.resize((180, 180), Image.Resampling.LANCZOS).save(
        PUBLIC / "apple-touch-icon.png", optimize=True
    )

    og = build_og(cleo)
    og.save(PUBLIC / "og-image.png", optimize=True)

    print("Wrote:", *[p.name for p in sorted(PUBLIC.glob("favicon*")) + [PUBLIC / "apple-touch-icon.png", PUBLIC / "og-image.png", PUBLIC / "cleo-selfie.png"]], sep="\n  ")


if __name__ == "__main__":
    main()
