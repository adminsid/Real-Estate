"""Build aspect-preserving local WebP derivatives; originals and watermarks stay intact."""
import json
import os
from pathlib import Path
import sqlite3
from PIL import Image, ImageOps

root = Path(os.environ.get('MLS_GRID_DB', '.mls-grid-demo/listings.sqlite')).resolve()
media = root.parent / 'media'
output = media / 'optimized'
output.mkdir(mode=0o700, exist_ok=True)
with sqlite3.connect(root) as db:
    files = [row[0] for row in db.execute('SELECT DISTINCT file FROM listing_media')]
original_bytes = derived_bytes = count = 0
for file in files:
    path = media / file
    original_bytes += path.stat().st_size
    with Image.open(path) as source:
        source = ImageOps.exif_transpose(source)
        for variant, width in [('card', 720), ('thumb', 160), ('display', 1600)]:
            target = output / f'{file}-{variant}.webp'
            if not target.exists():
                image = source.copy()
                image.thumbnail((width, width * 3), Image.Resampling.LANCZOS)
                if image.mode not in ('RGB', 'RGBA'):
                    image = image.convert('RGB')
                temp = target.with_suffix('.pending')
                image.save(temp, 'WEBP', quality=86, method=5)
                temp.chmod(0o600)
                temp.replace(target)
            derived_bytes += target.stat().st_size
            count += 1
print(json.dumps({'photos': len(files), 'derivatives': count, 'originalBytes': original_bytes, 'derivedBytes': derived_bytes}))
