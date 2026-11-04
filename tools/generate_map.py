import json, cv2, numpy as np, scipy.ndimage as ndi
from scipy.spatial import cKDTree
from scipy.optimize import linear_sum_assignment
from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / 'client/assets'
out.mkdir(parents=True, exist_ok=True)
source = out / 'europe-map.png'
img = np.array(Image.open(source).convert('RGB'))
h, w = img.shape[:2]
print('image', w, h)

# Drawn in artwork image coordinates rather than a GIS projection.
regions = {
    'IE': [(122, 156), (246, 154), (334, 189), (349, 305), (289, 368), (145, 366), (113, 285)],
    'GB': [(281, 34), (469, 25), (563, 120), (597, 242), (589, 356), (518, 397), (348, 390), (279, 313), (268, 188)],
    'PT': [(55, 653), (168, 646), (230, 722), (220, 879), (51, 880)],
    'ES': [(47, 611), (172, 602), (305, 606), (441, 628), (556, 690), (548, 789), (466, 883), (145, 882), (47, 845), (45, 710)],
    'FR': [(248, 401), (324, 355), (539, 350), (650, 349), (734, 381), (786, 446), (775, 525), (791, 582), (721, 699), (589, 710), (433, 673), (297, 596), (242, 487)],
    'BE': [(587, 347), (656, 348), (686, 378), (675, 414), (595, 407)],
    'NL': [(604, 261), (707, 260), (745, 329), (687, 376), (619, 347)],
    'DK': [(735, 119), (885, 116), (949, 125), (952, 205), (947, 263), (799, 266), (738, 219)],
    'DE': [(666, 239), (879, 230), (986, 242), (1082, 320), (1052, 434), (1040, 474), (1092, 520), (1088, 568), (1018, 568), (920, 548), (850, 502), (808, 481), (712, 425), (668, 373), (651, 305)],
    'CH': [(709, 525), (720, 514), (736, 509), (749, 500), (775, 503), (793, 493), (818, 497), (837, 490), (861, 491), (885, 499), (896, 516), (894, 537), (879, 549), (858, 555), (839, 560), (820, 571), (796, 566), (775, 569), (754, 565), (734, 557), (720, 548), (711, 537)],
    'IT': [(758, 549), (876, 552), (984, 586), (1065, 655), (1140, 748), (1082, 877), (921, 884), (853, 785), (766, 742), (733, 675)],
    'HU': [(998, 483), (1205, 462), (1248, 557), (1147, 606), (1017, 563)],
    'RO': [(1207, 451), (1467, 446), (1511, 556), (1440, 645), (1270, 663), (1151, 598)],
    'SU': [(1000, 14), (1340, 14), (1522, 146), (1657, 240), (1657, 562), (1547, 599), (1400, 557), (1300, 489), (1198, 439), (1091, 446), (1000, 392)],
    'SK': [(1004, 452), (1032, 445), (1061, 437), (1088, 430), (1115, 438), (1140, 439), (1169, 449), (1194, 452), (1209, 462), (1189, 477), (1158, 489), (1128, 492), (1093, 490), (1064, 493), (1033, 483)],
    'YU': [(996, 570), (1030, 567), (1052, 582), (1082, 575), (1110, 582), (1141, 596), (1171, 605), (1202, 604), (1234, 616), (1260, 629), (1283, 644), (1312, 651), (1340, 675), (1368, 707), (1356, 723), (1312, 744), (1267, 766), (1236, 762), (1206, 748), (1178, 729), (1147, 722), (1125, 699), (1097, 689), (1078, 672), (1057, 652), (1032, 640), (1019, 617)],
    'BG': [(1150, 640), (1183, 622), (1212, 615), (1248, 610), (1280, 605), (1310, 613), (1324, 627), (1301, 652), (1280, 668), (1260, 688), (1249, 707), (1259, 732), (1242, 750), (1217, 751), (1189, 738), (1172, 718), (1148, 708), (1136, 686), (1145, 660)],
}

ids = {'GB':1,'ES':2,'FR':3,'DE':4,'SU':5,'RO':6,'HU':7,'IT':8,'CH':9,'PT':10,'IE':11,'NL':12,'BE':13,'DK':14,'SK':15,'YU':16,'BG':17}
name = {'GB':'Great Britain','ES':'Spain','FR':'France','DE':'Nazi Germany','SU':'Soviet Union','RO':'Romania','HU':'Hungary','IT':'Fascist Italy','CH':'Switzerland','PT':'Portugal','IE':'Ireland','NL':'Netherlands','BE':'Belgium','DK':'Denmark','SK':'Slovakia','YU':'Yugoslavia','BG':'Bulgaria'}
colour = {'GB':'#BC9B6B','ES':'#BBA572','FR':'#B9A17C','DE':'#B49C73','SU':'#B49B70','RO':'#AB946D','HU':'#BEAB81','IT':'#C1A781','CH':'#C1AE8C','PT':'#BD9C75','IE':'#C4A478','NL':'#BCA783','BE':'#AD9774','DK':'#C9B38F','SK':'#C2A881','YU':'#BCA17D','BG':'#B59C77'}
playable = ['GB','ES','FR','DE','SU','RO','HU','IT','PT']

# Historical-ish province names aligned by anchor points in image coordinates.
province_name_anchors = {'GB': [('London', 505, 375),
        ('Edinburgh', 455, 220),
        ('Glasgow', 395, 230),
        ('Manchester', 435, 310),
        ('Birmingham', 460, 345),
        ('Liverpool', 390, 315),
        ('Cardiff', 355, 355),
        ('Bristol', 415, 375),
        ('Newcastle', 485, 280),
        ('Aberdeen', 470, 140)],
 'ES': [('Madrid', 320, 770),
        ('Barcelona', 512, 730),
        ('Seville', 230, 830),
        ('Valencia', 450, 807),
        ('Bilbao', 380, 672),
        ('Zaragoza', 465, 707),
        ('Granada', 300, 850),
        ('Valladolid', 310, 707),
        ('A Coruña', 150, 678),
        ('Oviedo', 225, 649)],
 'FR': [('Paris', 525, 461),
        ('Marseille', 690, 647),
        ('Lyon', 640, 557),
        ('Bordeaux', 395, 590),
        ('Lille', 585, 406),
        ('Nantes', 384, 480),
        ('Toulouse', 505, 632),
        ('Strasbourg', 734, 481),
        ('Brest', 307, 434),
        ('Dijon', 611, 517)],
 'DE': [('Berlin', 956, 330),
        ('Hamburg', 837, 285),
        ('Munich', 897, 515),
        ('Cologne', 737, 373),
        ('Frankfurt', 802, 415),
        ('Stuttgart', 807, 475),
        ('Dresden', 923, 418),
        ('Breslau', 1034, 433),
        ('Königsberg', 1020, 272),
        ('Hanover', 847, 339)],
 'SU': [('Moscow', 1328, 290),
        ('Leningrad', 1230, 124),
        ('Minsk', 1145, 337),
        ('Smolensk', 1235, 310),
        ('Kiev', 1318, 466),
        ('Odessa', 1435, 553),
        ('Kharkov', 1452, 469),
        ('Vitebsk', 1185, 250),
        ('Gomel', 1275, 370),
        ('Pskov', 1135, 205)],
 'RO': [('Bucharest', 1349, 621),
        ('Cluj', 1254, 563),
        ('Iași', 1381, 510),
        ('Timișoara', 1189, 607),
        ('Brașov', 1321, 574),
        ('Sibiu', 1265, 588),
        ('Craiova', 1261, 639),
        ('Constanța', 1467, 618),
        ('Galați', 1401, 576),
        ('Cernăuți', 1304, 487)],
 'HU': [('Budapest', 1112, 528),
        ('Debrecen', 1192, 522),
        ('Szeged', 1134, 568),
        ('Pécs', 1054, 574),
        ('Miskolc', 1156, 489),
        ('Győr', 1045, 510),
        ('Szolnok', 1148, 548),
        ('Kecskemét', 1095, 554),
        ('Eger', 1100, 486),
        ('Nyíregyháza', 1191, 485)],
 'IT': [('Rome', 894, 736),
        ('Milan', 835, 584),
        ('Turin', 781, 596),
        ('Venice', 911, 599),
        ('Florence', 845, 680),
        ('Naples', 963, 765),
        ('Bologna', 887, 635),
        ('Bari', 1044, 778),
        ('Palermo', 914, 893),
        ('Genoa', 788, 651)],
 'CH': [('Bern', 770, 537), ('Zürich', 820, 518), ('Geneva', 724, 552)],
 'PT': [('Lisbon', 115, 790),
        ('Porto', 118, 700),
        ('Coimbra', 126, 748),
        ('Braga', 114, 676),
        ('Faro', 135, 858),
        ('Évora', 150, 805),
        ('Leiria', 142, 728),
        ('Guarda', 164, 732),
        ('Viseu', 152, 700),
        ('Castelo Branco', 172, 775)],
 'IE': [('Dublin', 242, 278), ('Cork', 175, 329), ('Galway', 174, 234)],
 'NL': [('Amsterdam', 655, 304), ('Rotterdam', 652, 343), ('Utrecht', 704, 324)],
 'BE': [('Brussels', 644, 384), ('Antwerp', 625, 365), ('Liège', 664, 403)],
 'DK': [('Copenhagen', 919, 224), ('Aarhus', 799, 213), ('Odense', 845, 235)],
 'SK': [('Bratislava', 1051, 467), ('Banská Bystrica', 1120, 469), ('Košice', 1180, 465)],
 'YU': [('Belgrade', 1295, 695), ('Zagreb', 1068, 617), ('Sarajevo', 1199, 684)],
 'BG': [('Sofia', 1182, 689), ('Plovdiv', 1243, 701), ('Varna', 1272, 643)]}

manual_seeds = {
    'CH': [(730, 528), (798, 524), (868, 528)],
    'DK': [(790, 156), (812, 224), (918, 228)],
    'BE': [(616, 366), (647, 383), (630, 407)],
    'NL': [(650, 292), (690, 312), (657, 347)],
    'PT': [(105, 676), (119, 698), (151, 700), (139, 728), (168, 734), (126, 750), (170, 776), (118, 792), (145, 812), (133, 858)],
    'IE': [(210, 208), (235, 272), (165, 324)],
    'SK': [(1058, 466), (1120, 462), (1180, 466)],
    'YU': [(1105, 624), (1210, 670), (1305, 710)],
    'BG': [(1188, 690), (1245, 705), (1255, 642)],
}

# Create a broad region-of-interest around all intended nations. This lets us keep
# the map's pale coastlines and snowy mountains while excluding clouds and ornament.
roi = np.zeros((h, w), np.uint8)
for pts in regions.values():
    cv2.fillPoly(roi, [np.array(pts, np.int32)], 1)
roi = cv2.dilate(roi, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (121, 121)))

r, g, b = [img[:, :, i].astype(np.int16) for i in range(3)]
sea = (b > r + 18) & (b > g + 6) & (b > 45)
land = (~sea) & (roi > 0)
# Clean and restore internal mountain highlights / pale coastlines.
land = cv2.morphologyEx(land.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
land = cv2.morphologyEx(land.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
land = ndi.binary_fill_holes(land)
# Frame is never selectable.
land[:14] = 0; land[-17:] = 0; land[:, :14] = 0; land[:, -15:] = 0
labels, n = ndi.label(land)
areas = np.bincount(labels.ravel())
land &= (areas[labels] > 100)
Image.fromarray((land * 255).astype(np.uint8)).save(out / 'land-mask-debug.png')

# Assign countries from hand-drawn polygons.
country = np.zeros((h, w), np.uint8)
order = ['SU', 'DE', 'FR', 'ES', 'GB', 'IT', 'RO', 'HU', 'DK', 'NL', 'BE', 'CH', 'PT', 'IE', 'SK', 'YU', 'BG']
for code in order:
    polygon = np.array(regions[code], dtype=np.int32)
    mask = np.zeros((h, w), np.uint8)
    cv2.fillPoly(mask, [polygon], 1)
    country[(mask > 0) & land] = ids[code]

# Restore islands manually if any land pixels inside their natural bounds were missed.
for code, boxes in {'FR':[(694,706,778,786)], 'IT':[(682,760,792,895),(848,860,960,924)], 'ES':[(462,737,624,846)], 'DK':[(888,188,954,255)]}.items():
    for x0, y0, x1, y1 in boxes:
        inside = np.zeros((h, w), np.uint8)
        cv2.ellipse(inside, ((x0+x1)//2, (y0+y1)//2), ((x1-x0)//2, (y1-y0)//2), 0, 0, 360, 1, -1)
        country[(inside > 0) & land & (country == 0)] = ids[code]

# Fill only smaller unassigned land gaps by borrowing the surrounding nation.
# This fixes clipped coasts / mountain holes without spilling into Scandinavia or North Africa.
unassigned = land & (country == 0)
labels, n = ndi.label(unassigned)
areas = np.bincount(labels.ravel())
for comp in range(1, n + 1):
    area = areas[comp]
    if area == 0 or area > 18000:
        continue
    mask = labels == comp
    dil = cv2.dilate(mask.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0
    neigh = country[dil & ~mask & (country > 0)]
    if len(neigh):
        vals, counts = np.unique(neigh, return_counts=True)
        fill = vals[np.argmax(counts)]
        country[mask] = fill

# Gentle border warp for organic internal country edges while preserving shoreline.
warp_rng = np.random.default_rng(1939)
low_x = warp_rng.normal(size=(max(2, h // 90), max(2, w // 90))).astype(np.float32)
low_y = warp_rng.normal(size=(max(2, h // 90), max(2, w // 90))).astype(np.float32)
dx = cv2.GaussianBlur(cv2.resize(low_x, (w, h), interpolation=cv2.INTER_CUBIC), (0, 0), 8) * 3.8
dy = cv2.GaussianBlur(cv2.resize(low_y, (w, h), interpolation=cv2.INTER_CUBIC), (0, 0), 8) * 3.8
xx, yy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
warped = cv2.remap(country, xx + dx, yy + dy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT)
# Preserve coastlines exactly and avoid reintroducing holes.
warped[~land] = 0
country = warped
# Re-fill smaller gaps after warping.
unassigned = land & (country == 0)
labels, n = ndi.label(unassigned)
areas = np.bincount(labels.ravel())
for comp in range(1, n + 1):
    area = areas[comp]
    if area == 0 or area > 18000:
        continue
    mask = labels == comp
    dil = cv2.dilate(mask.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1) > 0
    neigh = country[dil & ~mask & (country > 0)]
    if len(neigh):
        vals, counts = np.unique(neigh, return_counts=True)
        fill = vals[np.argmax(counts)]
        country[mask] = fill

# 1. A detached coastal fragment just south of Wales is British, not French.
# 2. A disconnected island-shaped cloud in the far northeastern sea is not Soviet land.
fr_labels, fr_count = ndi.label((country == ids['FR']).astype(np.uint8))
for component in range(1, fr_count + 1):
    ys, xs = np.where(fr_labels == component)
    if len(xs) < 40: continue
    if xs.min() >= 275 and xs.max() <= 360 and ys.min() < 405 and ys.max() < 405:
        country[ys, xs] = ids['GB']
su_labels, su_count = ndi.label((country == ids['SU']).astype(np.uint8))
for component in range(1, su_count + 1):
    ys, xs = np.where(su_labels == component)
    if len(xs) < 40: continue
    if xs.min() >= 1500 and ys.max() < 210 and ys.min() > 60:
        country[ys, xs] = 0

Image.fromarray((country * 14).clip(0,255).astype(np.uint8)).save(out / 'country-mask-debug.png')

# Province generation.
province = np.zeros((h, w), np.uint8)
province_count = 0
rng = np.random.default_rng(42)
meta = []

def seeds_for_country(code, coords, count):
    if code in manual_seeds:
        return np.array(manual_seeds[code], dtype=np.float64)
    cent = coords.mean(axis=0)
    seeds = [coords[np.argmin(((coords - cent) ** 2).sum(axis=1))]]
    for i in range(1, count):
        subset = coords[::max(1, len(coords) // 30000)]
        tree = cKDTree(np.array(seeds))
        dist, _ = tree.query(subset)
        score = dist * (0.88 + 0.24 * rng.random(len(dist)))
        seeds.append(subset[np.argmax(score)])
    return np.array(seeds, dtype=np.float64)

non_playable = [k for k in ids if k not in playable]
for code in playable + non_playable:
    mask = country == ids[code]
    ys, xs = np.where(mask)
    count = 10 if code in playable else 3
    if len(xs) < count * 180:
        print('WARNING insufficient area', code, len(xs))
        continue
    coords = np.stack([xs, ys], axis=1)
    seeds = seeds_for_country(code, coords, count)
    tree = cKDTree(seeds)
    warped_coords = coords.astype(np.float64)
    sx = coords[:, 0]
    sy = coords[:, 1]
    warped_coords[:, 0] += 5 * np.sin(sy / 27 + sum(map(ord, code)) % 5) * np.cos(sx / 61)
    warped_coords[:, 1] += 5 * np.sin(sx / 35 + sum(map(ord, code)) % 7) * np.cos(sy / 47)
    _, assign = tree.query(warped_coords)
    for i in range(count):
        province_count += 1
        pid = province_count
        subset = coords[assign == i]
        province[subset[:, 1], subset[:, 0]] = pid
        meta.append({'id': pid, 'nation': code, 'local': i + 1})

# WW2 Royale 1.20: make the historical northern Romania/Soviet boundary
# less like a ruler-straight cut. Relabel ONLY within the existing two-country
# union; do not move the coast or make empty land-mask pixels.
su_ids=[m['id'] for m in meta if m['nation']=='SU']
ro_ids=[m['id'] for m in meta if m['nation']=='RO']
land_SU=np.isin(province,su_ids)
land_RO=np.isin(province,ro_ids)
united=land_SU|land_RO
pre_warp=province.copy()
for x in range(1160,min(w,1515)):
    touches=np.where((land_SU[:-1,x]&land_RO[1:,x])|(land_RO[:-1,x]&land_SU[1:,x]))[0]
    touches=touches[(touches>365)&(touches<570)]
    if not len(touches): continue
    edge_y=int(np.median(touches))
    shift=10*np.sin((x-1160)/17)+5*np.sin((x-1160)/5.2)+3*np.sin((x-1160)/2.8)
    for y in range(max(edge_y-30,350),min(edge_y+31,h)):
        if not united[y,x]:continue
        fade=max(0,(30-abs(y-edge_y))/30)
        sy=int(round(y+shift*fade))
        if 0<=sy<h and united[sy,x]:province[y,x]=pre_warp[sy,x]


# Organic atlas-style province refinement: gently curve *internal* province borders
# without changing the overall map silhouette, country ownership, or province count.
# We only remap pixels well inside each country's existing mask, which keeps coastlines
# and national borders stable while making province-to-province edges look less geometric.
def organicise_internal_borders(province, meta):
    out = province.copy()
    nation_to_ids = {}
    for m in meta:
        nation_to_ids.setdefault(m['nation'], []).append(m['id'])
    focus_codes = ['PT','ES','FR','GB','IE','DE','NL','BE','DK','CH','IT','HU','RO','SU','SK','YU','BG']
    for code in focus_codes:
        ids_here = np.array(nation_to_ids.get(code, []), dtype=np.uint8)
        if len(ids_here) < 2:
            continue
        mask = np.isin(out, ids_here)
        if mask.sum() < 1200:
            continue
        ys, xs = np.where(mask)
        pad = 18
        x0 = max(int(xs.min()) - pad, 0)
        x1 = min(int(xs.max()) + pad + 1, w)
        y0 = max(int(ys.min()) - pad, 0)
        y1 = min(int(ys.max()) + pad + 1, h)
        sub = out[y0:y1, x0:x1].copy()
        submask = mask[y0:y1, x0:x1]
        subh, subw = sub.shape
        # Smooth low-frequency displacement field. Larger countries get slightly more motion.
        area = int(submask.sum())
        amp = float(np.clip(np.sqrt(area) / 55.0, 3.0, 8.5))
        sigma = float(np.clip(min(subw, subh) / 17.0, 5.5, 14.0))
        seed = 1939 + sum((i + 1) * ord(ch) for i, ch in enumerate(code))
        local_rng = np.random.default_rng(seed)
        low_h = max(3, subh // 80)
        low_w = max(3, subw // 80)
        noise_x = local_rng.normal(size=(low_h, low_w)).astype(np.float32)
        noise_y = local_rng.normal(size=(low_h, low_w)).astype(np.float32)
        dx = cv2.resize(noise_x, (subw, subh), interpolation=cv2.INTER_CUBIC)
        dy = cv2.resize(noise_y, (subw, subh), interpolation=cv2.INTER_CUBIC)
        dx = cv2.GaussianBlur(dx, (0, 0), sigma) * amp
        dy = cv2.GaussianBlur(dy, (0, 0), sigma) * amp
        # Modulate the field so the effect fades near outer country borders.
        dist = cv2.distanceTransform((submask.astype(np.uint8) * 255), cv2.DIST_L2, 5)
        hold = float(np.clip(np.sqrt(area) / 18.0, 7.0, 13.0))
        fade = np.clip((dist - hold) / max(hold, 1.0), 0.0, 1.0)
        fade = cv2.GaussianBlur(fade.astype(np.float32), (0, 0), 1.6)
        yy, xx = np.meshgrid(np.arange(subh, dtype=np.float32), np.arange(subw, dtype=np.float32), indexing='ij')
        map_x = np.clip(xx + dx * fade, 0, subw - 1).astype(np.float32)
        map_y = np.clip(yy + dy * fade, 0, subh - 1).astype(np.float32)
        remapped = cv2.remap(sub, map_x, map_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
        valid = submask & np.isin(remapped, ids_here)
        change = valid & (dist > hold)
        sub_out = out[y0:y1, x0:x1].copy()
        sub_out[change] = remapped[change]
        # Fill any tiny accidental voids or pinholes by borrowing the local majority province.
        for _ in range(2):
            missing = submask & ~np.isin(sub_out, ids_here)
            if not missing.any():
                break
            dil = cv2.dilate(missing.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1) > 0
            neigh = sub_out.copy()
            ys2, xs2 = np.where(missing)
            for yy2, xx2 in zip(ys2, xs2):
                yA = max(yy2 - 1, 0); yB = min(yy2 + 2, subh)
                xA = max(xx2 - 1, 0); xB = min(xx2 + 2, subw)
                vals = sub_out[yA:yB, xA:xB]
                vals = vals[np.isin(vals, ids_here)]
                if vals.size:
                    uniq, counts = np.unique(vals, return_counts=True)
                    neigh[yy2, xx2] = uniq[np.argmax(counts)]
            sub_out = neigh
        out[y0:y1, x0:x1] = np.where(submask, sub_out, out[y0:y1, x0:x1])
    return out

province = organicise_internal_borders(province, meta)

# One cleanup pass: majority-vote only on interior province pixels, to reduce ruler-straight
# runs while keeping every shared boundary perfectly closed.
for code in ['PT','ES','FR','GB','DE','IT','HU','RO','SU','SK','YU','BG']:
    ids_here = np.array([m['id'] for m in meta if m['nation'] == code], dtype=np.uint8)
    if len(ids_here) < 2:
        continue
    mask = np.isin(province, ids_here)
    dist = cv2.distanceTransform((mask.astype(np.uint8) * 255), cv2.DIST_L2, 5)
    inner = mask & (dist > 10)
    ys, xs = np.where(inner)
    # Only touch a sparse checkerboard of pixels to avoid over-smoothing or province loss.
    for y, x in zip(ys, xs):
        if ((x + y) & 1) != 0:
            continue
        y0 = max(y - 1, 0); y1 = min(y + 2, h)
        x0 = max(x - 1, 0); x1 = min(x + 2, w)
        vals = province[y0:y1, x0:x1]
        vals = vals[np.isin(vals, ids_here)]
        if vals.size < 5:
            continue
        uniq, counts = np.unique(vals, return_counts=True)
        top = uniq[np.argmax(counts)]
        if counts.max() >= 5:
            province[y, x] = top

# Neighbor detection.
neighbor = {i: set() for i in range(1, province_count + 1)}
for axis in (0, 1):
    a, b = (province[:-1, :], province[1:, :]) if axis == 0 else (province[:, :-1], province[:, 1:])
    valid = (a != b) & (a > 0) & (b > 0)
    if valid.any():
        ab = np.stack((a[valid], b[valid]), axis=1)
        for i, j in np.unique(np.sort(ab, axis=1), axis=0):
            neighbor[int(i)].add(int(j))
            neighbor[int(j)].add(int(i))

# Province geometry.
provinces = []
meta_by_id = {}
for m in meta:
    p = province == m['id']
    ys, xs = np.where(p)
    if len(xs) == 0:
        continue
    M = cv2.moments(p.astype(np.uint8))
    cx = int(M['m10'] / M['m00'])
    cy = int(M['m01'] / M['m00'])
    if not p[cy, cx]:
        near = int(np.argmin((xs.astype(np.int64) - cx) ** 2 + (ys.astype(np.int64) - cy) ** 2))
        cx = int(xs[near]); cy = int(ys[near])
    m['x'] = cx; m['y'] = cy
    meta_by_id[m['id']] = m
    ctrs, _ = cv2.findContours(p.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    paths = []
    for contour in ctrs:
        if cv2.contourArea(contour) < 24:
            continue
        path = cv2.approxPolyDP(contour, 1.8, True).reshape(-1, 2).tolist()
        if len(path) > 2:
            paths.append(path)
    coast_touch = cv2.dilate(p.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1) > 0
    coastal = bool(np.any(coast_touch & sea))
    provinces.append({'id': m['id'], 'name': f'{name[m["nation"]]} {m["local"]:02}', 'nation': m['nation'], 'x': cx, 'y': cy, 'area': len(xs), 'troops': 25, 'neighbors': sorted(neighbor[m['id']]), 'paths': paths, 'coastal': coastal})

# Assign historical province names by matching centroids to regional anchors.
for code, anchors in province_name_anchors.items():
    plist = [p for p in provinces if p['nation'] == code]
    if len(plist) != len(anchors):
        print('name-count mismatch', code, len(plist), len(anchors))
        continue
    cost = np.zeros((len(plist), len(anchors)), dtype=np.float64)
    for i, p in enumerate(plist):
        for j, (_, ax, ay) in enumerate(anchors):
            cost[i, j] = (p['x'] - ax) ** 2 + (p['y'] - ay) ** 2
    # Ensure each historical capital appears, assigned to the closest province.
    cap_row = int(np.argmin(cost[:, 0]))
    plist[cap_row]['name'] = anchors[0][0]
    plist[cap_row]['capital'] = True
    other_rows = [i for i in range(len(plist)) if i != cap_row]
    other_cols = list(range(1, len(anchors)))
    rows, cols = linear_sum_assignment(cost[np.ix_(other_rows, other_cols)])
    for r_i, c_i in zip(rows, cols):
        plist[other_rows[r_i]]['name'] = anchors[other_cols[c_i]][0]

# Helper to connect sea crossings.
centers = {p['id']: (p['x'], p['y'], p['nation']) for p in provinces}

def closest(code, x, y):
    arr = [p for p in provinces if p['nation'] == code]
    return min(arr, key=lambda m: (m['x'] - x) ** 2 + (m['y'] - y) ** 2)['id']

for a, b, pa, pb in [
    ('GB', 'FR', (398, 361), (414, 416)),
    ('IE', 'GB', (303, 245), (350, 230)),
    ('GB', 'NL', (510, 310), (620, 299)),
    ('ES', 'IT', (514, 787), (756, 751)),
    ('IT', 'RO', (1090, 700), (1250, 623)),
    ('DK', 'DE', (873, 220), (870, 310)),
]:
    try:
        i = closest(a, *pa); j = closest(b, *pb)
        neighbor[i].add(j); neighbor[j].add(i)
    except ValueError:
        pass

# Isolated home islands get one link to their nearest same-nation province.
for p in provinces:
    if neighbor[p['id']]:
        continue
    candidates = [q for q in provinces if q['nation'] == p['nation'] and q['id'] != p['id']]
    if not candidates:
        continue
    q = min(candidates, key=lambda q: (q['x'] - p['x']) ** 2 + (q['y'] - p['y']) ** 2)
    neighbor[p['id']].add(q['id']); neighbor[q['id']].add(p['id'])
for p in provinces:
    p['neighbors'] = sorted(neighbor[p['id']])

# Assets.
rgba = np.zeros((h, w, 4), np.uint8)
rgba[:, :, 0] = province
rgba[:, :, 3] = (province > 0) * 255
Image.fromarray(rgba, 'RGBA').save(out / 'province-ids.png')

edge = np.zeros((h, w), np.uint8)
edge[:-1, :] |= ((province[:-1, :] != province[1:, :]) & (province[:-1, :] > 0) & (province[1:, :] > 0)).astype(np.uint8) * 255
edge[:, :-1] |= ((province[:, :-1] != province[:, 1:]) & (province[:, :-1] > 0) & (province[:, 1:] > 0)).astype(np.uint8) * 255
edge_main = cv2.GaussianBlur(edge, (0, 0), 0.55)
edge_shadow = cv2.GaussianBlur(cv2.dilate(edge, np.ones((3, 3), np.uint8)), (0, 0), 1.05)
outline = np.zeros((h, w, 4), np.uint8)
shadow_mask = edge_shadow > 8
main_mask = edge_main > 18
outline[shadow_mask, 0] = 25
outline[shadow_mask, 1] = 22
outline[shadow_mask, 2] = 18
outline[shadow_mask, 3] = np.clip(edge_shadow[shadow_mask] * 0.42, 0, 120).astype(np.uint8)
outline[main_mask, 0] = 232
outline[main_mask, 1] = 220
outline[main_mask, 2] = 194
outline[main_mask, 3] = np.maximum(outline[main_mask, 3], np.clip(edge_main[main_mask] * 0.72, 0, 205).astype(np.uint8))
Image.fromarray(outline, 'RGBA').save(out / 'province-lines.png')
Image.fromarray(img).save(out / 'europe-map.png', optimize=True)

mapdata = {
    'width': w,
    'height': h,
    'startDate': '1939-10-06',
    'endDate': '1945-09-02',
    'secondsPerMatch': 3600,
    'secondsPerDay': 3600/2158,  # 60-min match from Oct 1939 to Sep 1945
    'playableNations': playable,
    'nations': {c: {'id': c, 'name': name[c], 'color': colour[c], 'playable': c in playable, 'capital': province_name_anchors[c][0][0]} for c in ids},
    'provinces': provinces,
}
(root / 'shared/map.json').write_text(json.dumps(mapdata, separators=(',', ':')))

# Visual quality check preview.
preview = np.array(img.copy())
preview[edge > 0] = np.array([18, 19, 20])
im = Image.fromarray(preview)
d = ImageDraw.Draw(im)
for c in ids:
    px = np.where(country == ids[c])
    if not len(px[0]):
        continue
    x = int(np.median(px[1])); y = int(np.median(px[0]))
    d.text((x, y), c, fill='white', stroke_width=2, stroke_fill='black')
im.resize((1336, 753)).save(root / 'province-preview.jpg', quality=90)
print('province counts', province_count, 'land assigned', int((province > 0).sum()), 'all land', int(land.sum()))
for c in ids:
    print(c, int((country == ids[c]).sum()), sum(p['nation'] == c for p in provinces))
