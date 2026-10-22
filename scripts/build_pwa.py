import io
import os
import shutil
import urllib.request
from pathlib import Path
from PIL import Image, ImageOps

root = Path("_site")
root.mkdir(exist_ok=True)
for name in ("index.html", "manifest.webmanifest", "customization.js", "multicity.js", "app-config.js", "firestore.rules"):
    shutil.copyfile(name, root / name)
(root / "sw.js").write_text(Path("sw.js").read_text().replace("__BUILD_VERSION__", os.environ["GITHUB_SHA"]), encoding="utf-8")
(root / ".nojekyll").touch()
assets = root / "assets"
assets.mkdir(exist_ok=True)
url = "https://lh3.googleusercontent.com/d/1WNcGjsZ9_Fp54xzOl01EYRqM6-wY5Zh7"
request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(request, timeout=45) as response:
    raw = response.read(12 * 1024 * 1024 + 1)
if len(raw) > 12 * 1024 * 1024:
    raise ValueError("Logo exceeds 12 MB")
image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGBA")
if min(image.size) < 1:
    raise ValueError("Invalid logo")
image.save(assets / "logo.png")
for name, size, inset in (
    ("favicon-32.png", 32, .04),
    ("icon-192.png", 192, .08),
    ("icon-512.png", 512, .08),
    ("icon-maskable-512.png", 512, .20),
    ("apple-touch-icon.png", 180, .10),
):
    canvas = Image.new("RGBA", (size, size), "white")
    limit = round(size * (1 - 2 * inset))
    fitted = ImageOps.contain(image, (limit, limit), Image.Resampling.LANCZOS)
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    canvas.convert("RGB").save(assets / name)
    with Image.open(assets / name) as check:
        assert check.size == (size, size)
print("Logo downloaded; application icons generated and dimensions verified.")
