"""Save the finished cover paintings as PNG files in this folder."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
SESSION = (
    Path.home()
    / ".grok"
    / "sessions"
    / "C%3A%5CUsers%5Cwin11%5CDesktop%5CThe%20Great%20War"
    / "01a0a4ab-76c8-7df1-ad5d-10fba5087057"
    / "images"
)

pairs = [
    (SESSION / "9.jpg", ROOT / "cover-horizontal.png"),
    (SESSION / "7.jpg", ROOT / "cover-vertical.png"),
]

for src, dest in pairs:
    Image.open(src).convert("RGB").save(dest, "PNG")
    print(dest, dest.stat().st_size)
