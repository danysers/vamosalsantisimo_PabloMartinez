"""Compose secondary sponsors only. Approved V2 artwork is immutable outside ROI."""
import hashlib
import json
import math
import warnings
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
TEMPLATES = Path(__file__).resolve().parent / 'templates'
REGIONS = {'historia': (0, 1686, 1080, 1842), 'muro': (0, 1186, 1080, 1288)}
BACKGROUNDS = {'alma': 'white', 'cabildo': 'black', 'kalas': '#8a0000'}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_logo(path):
    with Image.open(path) as source:
        if source.format not in ('PNG', 'JPEG', 'WEBP') or getattr(source, 'n_frames', 1) != 1:
            raise ValueError('Only static PNG/JPEG/WebP logos are supported')
        if source.width < 1 or source.height < 1 or source.width * source.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('Sponsor dimensions exceed limit')
        image = ImageOps.exif_transpose(source).convert('RGBA')
        image.thumbnail((138, 75), Image.Resampling.LANCZOS)
        return image


def layout(count, region):
    """Fill available width; at most seven per row and fourteen per page."""
    if not 1 <= count <= 14:
        raise ValueError('Invalid page count')
    _, top, width, bottom = region
    rows = math.ceil(count / 7)
    height = min(75, (bottom - top - 8 * (rows - 1)) // rows)
    box_width = min(138, (width - 128 - 16 * 6) // 7)
    start_y = top + ((bottom - top) - rows * height - (rows - 1) * 8) // 2
    boxes = []
    for row in range(rows):
        n = min(7, count - row * 7)
        gap = (width - 128 - n * box_width) / (n - 1) if n > 1 else 0
        for col in range(n):
            x = round(64 + col * (box_width + gap)) if n > 1 else (width - box_width) // 2
            boxes.append((x, start_y + row * (height + 8), box_width, height))
    return boxes


def assert_protected(base, result, region):
    diff = ImageChops.difference(base.convert('RGB'), result.convert('RGB'))
    diff.paste((0, 0, 0), region)
    if diff.getbbox() is not None:
        raise ValueError('Protected artwork changed; publication refused')


def compose(logos, output, version):
    if not isinstance(version, int) or not 3 <= version <= 99999 or len(logos) > 80:
        raise ValueError('Invalid composition request')
    # Originals are pinned independently of the guide: no accidental template replacement.
    pins = json.loads((TEMPLATES / 'protected-sha256.json').read_text())
    for filename, expected in pins.items():
        if digest(TEMPLATES / filename) != expected:
            raise ValueError('Approved template checksum changed')
    all_logos = [(load_logo(TEMPLATES / 'assets' / f'{key}.png'), BACKGROUNDS[key])
                 for key in ('alma', 'cabildo', 'kalas')]
    all_logos += [(load_logo(path), None) for path in logos]
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    files = []
    pages = math.ceil(len(all_logos) / 14)
    for kind, region in REGIONS.items():
        with Image.open(TEMPLATES / f'evento-v2-{kind}.png') as original:
            base = original.convert('RGB')
        for page in range(pages):
            result = base.copy()
            # Interpolate clean background rows inside the permitted sponsor area only.
            x0, y0, x1, y1 = region
            upper = base.crop((x0, y0, x1, y0 + 1))
            lower = base.crop((x0, y1 - 1, x1, y1))
            for y in range(y0, y1):
                result.paste(Image.blend(upper, lower, (y-y0) / max(1, y1-y0-1)), (x0, y))
            group = all_logos[page * 14:(page + 1) * 14]
            for (logo, background), (x, y, w, h) in zip(group, layout(len(group), region)):
                tile = Image.new('RGBA', (w, h), background or (0, 0, 0, 0))
                contained = ImageOps.contain(logo, (w, h), Image.Resampling.LANCZOS)
                tile.alpha_composite(contained, ((w-contained.width)//2, (h-contained.height)//2))
                result.paste(tile, (x, y), tile)
            assert_protected(base, result, region)
            suffix = f'-p{page+1}' if pages > 1 else ''
            filename = f'flyer-evento-{kind}-v{version}{suffix}.png'
            path = output / filename
            result.save(path, format='PNG', optimize=True)
            # Check the saved artifact, not only the intermediate image.
            with Image.open(path) as saved:
                assert_protected(base, saved, region)
            files.append({'name': filename, 'format': kind, 'page': page + 1,
                          'pages': pages, 'sha256': digest(path), 'size': path.stat().st_size})
    return files


if __name__ == '__main__':
    import sys
    job_path = Path(sys.argv[1]).resolve()
    job = json.loads(job_path.read_text())
    result = compose(job['logos'], job_path.parent / 'output', job['version'])
    (job_path.parent / 'rendered.json').write_text(json.dumps(result))
