from pathlib import Path
from PIL import Image
import numpy as np
import cv2
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
  # Strong white snow cover at the height of winter, while retaining the
  # original relief texture beneath the overlay. Lower latitudes are less snowy
  # except for bright mountain ridges. Use smoothed multi-scale noise so the
  # snow looks like drifting accumulations instead of a flat colour fill.
  rng=np.random.default_rng(1940)
  def snow_noise(cells):
   field=rng.normal(size=(max(2,h//cells),max(2,w//cells))).astype(np.float32)
   return cv2.resize(field,(w,h),interpolation=cv2.INTER_CUBIC)
  field=.65*snow_noise(85)+.24*snow_noise(30)+.11*snow_noise(13)
  field=cv2.GaussianBlur(field,(0,0),2.2)
  north=np.clip((810-y)/750,0,1)
  brightness=np.mean(terrain.astype(np.float32),axis=2)
  mountain=np.clip((brightness-124)/78,0,1)
  snow=np.clip(68+67*north+74*mountain+field*36+noise*12,35,217)
  rgba[land,:3]=[238,246,249]
  rgba[land,3]=snow[land].astype(np.uint8)
  # Sea ice concentrates near northern coasts; scattered flecks suggest
  # brash ice and freezing bays, without painting southern seas solid white.
  dist=cv2.distanceTransform((~land).astype(np.uint8),cv2.DIST_L2,5)
  near_coast=np.clip((90-dist)/90,0,1)
  freezing=np.clip((620-y)/540,0,1)
  wave=np.clip(field*.9+.4*np.sin(x/19+y/31),-.8,1.0)
  ice=np.clip(13+170*near_coast*freezing+65*freezing*np.maximum(0,wave),0,200)
  rgba[~land,:3]=[198,228,241]
  rgba[~land,3]=ice[~land].astype(np.uint8)
 # no tint on ornate outer frame
 rgba[:12,:,3]=0;rgba[-14:,:,3]=0;rgba[:,:12,3]=0;rgba[:,-14:,3]=0
 Image.fromarray(rgba,'RGBA').save(assets/f'season-{season}.png',optimize=True)
 print(season, (assets/f'season-{season}.png').stat().st_size)
