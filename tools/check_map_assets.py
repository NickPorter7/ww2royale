"""Verify that province picking and rendering assets refer to the same map.
Run from any directory with Python + Pillow. Fail loudly on corruption.
"""
from pathlib import Path
import json
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
mapdata=json.loads((ROOT/'shared/map.json').read_text())
ids=Image.open(ROOT/'client/assets/province-ids.png').convert('RGBA')
base=Image.open(ROOT/'client/assets/europe-map.png')
lines=Image.open(ROOT/'client/assets/province-lines.png')
assert ids.size==base.size==lines.size==(mapdata['width'],mapdata['height']), 'Map dimensions mismatch'
valid={p['id'] for p in mapdata['provinces']}
assert valid==set(range(1,len(valid)+1)), 'Province IDs must be sequential'
seen=set()
for r,g,b,a in ids.getdata():
    if a:
        assert r in valid, f'Invalid map pixel province ID {r}'
        seen.add(r)
assert seen==valid, f'Province IDs missing from selectable raster: {valid-seen}'
assert len(valid)==114
print(f'PASS: {len(valid)} selectable provinces; all map images aligned at {ids.width} x {ids.height}')
