from pathlib import Path
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parent.parent
assets=root/'client/assets'
terrain=np.array(Image.open(assets/'europe-map.png').convert('RGB'))
ids=np.array(Image.open(assets/'province-ids.png').convert('RGBA'))
h,w=terrain.shape[:2]
land=ids[:,:,3]>0
# The original ornate relief stays untouched. These 4 separate overlay assets
# are displayed above it, with translucent seasonal tint and polar sea ice.
y,x=np.mgrid[:h,:w]
noise=(np.sin(x/19.4+y/47)*np.cos(y/28.1-x/63)+np.sin(x/7.7+y/15)*.20)
seasons={}
for season in ['spring','summer','autumn','winter']:
 rgba=np.zeros((h,w,4),dtype=np.uint8)
 if season=='spring':
  rgba[land,:3]=[94,154,102];rgba[land,3]=29
  rgba[~land,:3]=[53,141,164];rgba[~land,3]=14
 if season=='summer':
  rgba[land,:3]=[240,207,125];rgba[land,3]=13
  rgba[~land,:3]=[12,124,162];rgba[~land,3]=9
 if season=='autumn':
  rgba[land,:3]=[202,115,57];rgba[land,3]=42
  rgba[~land,:3]=[52,82,107];rgba[~land,3]=19
 if season=='winter':
  rgba[land,:3]=[223,239,245]
  # More snow in the north and on pale mountain ridges.
  pale=np.mean(terrain,axis=2)>145
  amount=np.clip(15+(600-y)/9+noise*8+45*pale,12,104)
  rgba[land,3]=amount[land].astype(np.uint8)
  rgba[~land,:3]=[182,218,232]
  ice=np.clip((440-y)/4+noise*22,0,110)
  rgba[~land,3]=ice[~land].astype(np.uint8)
 # no tint on ornate outer frame
 rgba[:12,:,3]=0;rgba[-14:,:,3]=0;rgba[:,:12,3]=0;rgba[:,-14:,3]=0
 Image.fromarray(rgba,'RGBA').save(assets/f'season-{season}.png',optimize=True)
 print(season, (assets/f'season-{season}.png').stat().st_size)
