"""Build the tournament collage (share preview and download button).

Writes og/collage-<hash>.jpg (1200x630 link preview) and og/post-<hash>.jpg
(1080x1350 social post for the download button), and points og:image in
index.html at the collage. The hash
comes from the image list, so the file only changes when the lineup changes.
Run from anywhere: python scripts/make_og.py
"""
import hashlib
import io
import json
import math
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
OG_DIR = ROOT / 'og'
SITE_URL = 'https://ministryofbeybladex.github.io/BeybladeX-Tournament-Hub/'
WIDTH, HEIGHT = 1200, 630  # Facebook link preview size
POST_SIZE = (1080, 1350)  # 4:5 social post, download button
POST_LIMIT = 4  # soonest unique posters, cropped to fill a 2x2 grid
GAP = 8
BACKGROUND = '#090d0b'
CAPTION = 'ministryofbeybladex.github.io/BeybladeX-Tournament-Hub'  # readable even if a link gets stripped
CAPTION_HEIGHT = 44
CAPTION_COLOR = '#00FF66'
FONTS = ('DejaVuSans-Bold.ttf', 'arialbd.ttf')  # Linux runner, Windows


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def load_images(urls):
    """Download images, skipping any that fail. Returns (url, image) pairs."""
    loaded = []
    for url in urls:
        try:
            image = ImageOps.exif_transpose(Image.open(io.BytesIO(fetch(url))))
            loaded.append((url, image.convert('RGB')))
        except Exception as error:
            print(f'skip {url}: {error}')
    return loaded


def grid(count, aspect, width=WIDTH, height=HEIGHT, gap=GAP):
    """Pick the column count that shows images largest. Returns (cols, rows)."""
    def shown_area(cols):
        rows = math.ceil(count / cols)
        cell_w = (width - gap * (cols + 1)) / cols
        cell_h = (height - gap * (rows + 1)) / rows
        return min(cell_w, cell_h * aspect) * min(cell_w / aspect, cell_h)

    cols = max(range(1, count + 1), key=shown_area)
    return cols, math.ceil(count / cols)


def caption_font(size=24):
    for name in FONTS:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    raise OSError(f'none of {FONTS} installed')


def collage(images, size=(WIDTH, HEIGHT), fill=False):
    width, height = size
    canvas = Image.new('RGB', size, BACKGROUND)
    aspect = sum(i.width / i.height for i in images) / len(images)
    area_height = height - CAPTION_HEIGHT
    cols, rows = grid(len(images), aspect, width=width, height=area_height)
    cell_w = (width - GAP * (cols + 1)) // cols
    cell_h = (area_height - GAP * (rows + 1)) // rows

    for index, image in enumerate(images):
        row, col = divmod(index, cols)
        in_row = min(cols, len(images) - row * cols)
        offset = (width - in_row * cell_w - (in_row + 1) * GAP) // 2  # center a short last row
        if fill:
            fitted = ImageOps.fit(image, (cell_w, cell_h), Image.LANCZOS)
        else:
            scale = min(cell_w / image.width, cell_h / image.height)
            fitted = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        x = offset + GAP + col * (cell_w + GAP) + (cell_w - fitted.width) // 2
        y = GAP + row * (cell_h + GAP) + (cell_h - fitted.height) // 2
        canvas.paste(fitted, (x, y))

    draw = ImageDraw.Draw(canvas)
    font = caption_font()
    left, top, right, bottom = draw.textbbox((0, 0), CAPTION, font=font)
    draw.text(
        ((width - right + left) / 2 - left, height - (CAPTION_HEIGHT + bottom - top) / 2 - top),
        CAPTION, font=font, fill=CAPTION_COLOR,
    )
    return canvas


def main():
    html = INDEX.read_bytes().decode('utf-8')  # bytes keep the file's line endings
    web_app_url = re.search(r"WEB_APP_URL = '([^']+)'", html).group(1)
    events = json.loads(fetch(web_app_url))['data']
    urls = list(dict.fromkeys(e['image'] for e in events if e['image']))  # same poster = one tile

    loaded = load_images(urls)
    if not loaded:
        print('no images, keeping current collage')
        return

    digest = hashlib.sha1('\n'.join([CAPTION, *(url for url, _ in loaded)]).encode()).hexdigest()[:10]
    name = f'collage-{digest}.jpg'
    post_name = name.replace('collage-', 'post-')
    if name in html and (OG_DIR / name).exists() and (OG_DIR / post_name).exists():
        print(f'{name} is up to date')
        return

    OG_DIR.mkdir(exist_ok=True)
    for old in [*OG_DIR.glob('collage-*.jpg'), *OG_DIR.glob('post-*.jpg')]:
        old.unlink()
    images = [image for _, image in loaded]
    collage(images).save(OG_DIR / name, quality=85, optimize=True, progressive=True)
    collage(images[:POST_LIMIT], POST_SIZE, fill=True).save(OG_DIR / post_name, quality=90, optimize=True, progressive=True)

    html, replaced = re.subn(
        r'(<meta property="og:image" content=")[^"]*(")',
        rf'\g<1>{SITE_URL}og/{name}\g<2>',
        html,
    )
    assert replaced == 1, 'og:image tag not found in index.html'
    INDEX.write_bytes(html.encode('utf-8'))
    print(f'wrote {name} with {len(loaded)} images')


if __name__ == '__main__':
    main()
