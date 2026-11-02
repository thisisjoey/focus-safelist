"""Draws the extension icons (icons/icon{16,32,48,128}.png): a play button
with a small "plus" badge (YouTube, but productive).

Run from the project root:  python3 scripts/make_icons.py [green|red] [out_dir]
  green  green body, dark green badge (default; used in the store)
  red    YouTube-style red body. Too close to YouTube's logo for the Chrome
         Web Store, so kept only for comparison.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

WHITE = (255, 255, 255, 255)
PALETTES = {
    "red": {"body": (255, 0, 51, 255), "badge": (19, 128, 74, 255)},
    "green": {"body": (19, 128, 74, 255), "badge": (10, 72, 41, 255)},
}
SCALE = 8  # draw large, then downsample for smooth edges


def rounded_triangle(d, pts, radius, fill):
    """Triangle with softened corners: polygon plus round joins."""
    d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=fill, width=round(radius * 2), joint="curve")
    for x, y in pts:
        d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw(size: int, palette: dict) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Keep at least one clear pixel around the edge at every size (a bit more
    # than one, since round shapes spill slightly into the next pixel).
    margin = max(0.03, 1.25 / size)

    # Play button body (YouTube proportions, ~1.45:1), up and left to leave
    # room for the badge inside the canvas.
    left, right, top, bottom = s * margin, s * 0.90, s * 0.12, s * 0.72
    d.rounded_rectangle((left, top, right, bottom), radius=s * 0.17, fill=palette["body"])

    # Play triangle, nudged left so the badge doesn't crowd it.
    cx, cy = s * 0.43, (top + bottom) / 2
    w, h = s * 0.24, s * 0.27
    tri = [(cx - w * 0.42, cy - h / 2), (cx - w * 0.42, cy + h / 2), (cx + w * 0.58, cy)]
    rounded_triangle(d, tri, s * 0.024, WHITE)

    # Badge: coloured circle with a white ring and a plus. Its outer edge must
    # stay inside the canvas or Chrome crops it.
    br = s * (0.21 if size <= 16 else 0.19)
    ring = s * 0.04
    bx = by = s * (1 - margin) - br - ring
    d.ellipse((bx - br - ring, by - br - ring, bx + br + ring, by + br + ring), fill=WHITE)
    d.ellipse((bx - br, by - br, bx + br, by + br), fill=palette["badge"])
    arm = br * 0.58  # half the plus's width
    bar = br * (0.40 if size <= 16 else 0.32)  # stroke thickness, chunkier when tiny
    d.rounded_rectangle((bx - arm, by - bar / 2, bx + arm, by + bar / 2), radius=bar / 2, fill=WHITE)
    d.rounded_rectangle((bx - bar / 2, by - arm, bx + bar / 2, by + arm), radius=bar / 2, fill=WHITE)

    # Box filter = plain area averaging, so nothing smears past the shapes.
    out = img.resize((size, size), Image.BOX)

    # Nothing may touch the edge, or it looks cut off in the toolbar.
    x0, y0, x1, y1 = out.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    assert x0 > 0 and y0 > 0 and x1 < size and y1 < size, f"icon{size} touches the edge: {(x0, y0, x1, y1)}"
    return out


def main() -> None:
    palette = PALETTES[sys.argv[1] if len(sys.argv) > 1 else "green"]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        draw(size, palette).save(out / f"icon{size}.png")
        print(out / f"icon{size}.png")


if __name__ == "__main__":
    main()
