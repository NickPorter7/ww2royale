"""Regenerate crisp, connected province borders from the authoritative province-ID raster.

Do not independently smooth closed province polygons: that rounds adjacent boundaries
in different ways and creates visible cracks. All borders here are extracted once
from a single tessellation, with identical pixels shared by both neighbours.
"""
from pathlib import Path
import json
import numpy as np
import cv2
from PIL import Image

root=Path(__file__).resolve().parent.parent
assets=root/'client/assets'
rgba=np.asarray(Image.open(assets/'province-ids.png').convert('RGBA'))
province=np.where(rgba[:,:,3]>0,rgba[:,:,0],0).astype(np.uint8)
h,w=province.shape
# Extract only the edges between two *nonzero* provinces. Oceans remain untouched.
edge=np.zeros((h,w),dtype=np.uint8)
for a,b,offset in [
    (province[:,:-1],province[:,1:],(0,1)),
    (province[:-1,:],province[1:,:],(1,0))
]:
    boundary=(a>0)&(b>0)&(a!=b)
    if offset==(0,1):
        edge[:,:-1][boundary]=255
    else:
        edge[:-1,:][boundary]=255
# Gentle local antialiasing rather than Chaikin smoothing; all provinces still share borders.
edge=cv2.dilate(edge,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2,2)))
soft=cv2.GaussianBlur(edge.astype('float32'),(3,3),0.55)
out=np.zeros((h,w,4),dtype=np.uint8)
out[:,:,:3]=(13,19,20)
out[:,:,3]=np.clip(soft*0.65,0,255).astype('uint8')
Image.fromarray(out,'RGBA').save(assets/'province-lines.png')

# Detailed boundaries for selected-province hover outlines, from the same province-ID raster.
# Keep fine *angular* features, using an epsilon below one pixel.
mapfile=root/'shared/map.json'
data=json.loads(mapfile.read_text())
for p in data['provinces']:
    mask=np.uint8(province==p['id'])*255
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    paths=[]
    for contour in contours:
        if cv2.contourArea(contour)<18:
            continue
        approx=cv2.approxPolyDP(contour,epsilon=0.65,closed=True)
        pts=approx.reshape(-1,2).tolist()
        if len(pts)>=3:
            paths.append(pts)
    if not paths:
        raise RuntimeError(f'No outline for province {p["id"]}')
    p['paths']=paths
    actual_area=int(mask.sum()/255)
    p['area']=actual_area
    # Preserve established marker position if it is still on province terrain.
    x,y=p['x'],p['y']
    if not (0<=x<w and 0<=y<h and province[y,x]==p['id']):
        ys,xs=np.where(mask>0)
        old=np.argmin((xs.astype(np.float64)-x)**2+(ys.astype(np.float64)-y)**2)
        p['x']=int(xs[old]);p['y']=int(ys[old])
mapfile.write_text(json.dumps(data,separators=(',',':')))

# Render a reference map for visual inspection.
terrain=np.asarray(Image.open(assets/'europe-map.png').convert('RGB')).copy()
mask=edge>0
terrain[mask]=(terrain[mask]*0.22+np.array([18,19,18])*0.78).astype('uint8')
Image.fromarray(terrain).resize((1336,753)).save(root/'province-preview-1.15.jpg',quality=90)
print('Generated:',len(data['provinces']),'provinces; shared edge pixels:',int(np.count_nonzero(edge)))
print('Max contour vertices:',max(sum(len(path) for path in p['paths']) for p in data['provinces']))
