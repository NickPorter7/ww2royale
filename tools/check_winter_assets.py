"""Verify enhanced snow/ice assets against untouched clickable map geometry."""
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
assets=root/'client'/'assets'
land_ids=np.array(Image.open(assets/'province-ids.png').convert('RGBA'))
win=np.array(Image.open(assets/'season-winter.png').convert('RGBA'))
base=np.array(Image.open(assets/'europe-map.png').convert('RGB'))
assert land_ids.shape==win.shape
assert base.shape==win.shape[:2]+(3,)
land=land_ids[:,:,3]>0
alpha=win[:,:,3]
height,width=alpha.shape
# Snow falls visibly on northern land, including mainland and island provinces.
north_land=land & (np.arange(height)[:,None]<height*.40)
assert int(np.median(alpha[north_land]))>=110, 'Peak winter snow too faint in northern provinces'
# Icy northern water must be more opaque than southern offshore water.
water=~land
north_water=water & (np.arange(height)[:,None]<height*.35)
south_water=water & (np.arange(height)[:,None]>height*.80)
assert alpha[north_water].mean()>alpha[south_water].mean()+20, 'Northern sea ice missing'
# The ornate map border stays untouched by weather tint.
assert np.count_nonzero(alpha[:12,:])==0
assert np.count_nonzero(alpha[-14:,:])==0
assert np.count_nonzero(alpha[:,:12])==0
assert np.count_nonzero(alpha[:,-14:])==0
print('PASS: peak winter snow, northern ice, and preserved map frame')
