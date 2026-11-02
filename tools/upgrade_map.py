from pathlib import Path
p=Path(__file__).parent/'generate_map.py'
s=p.read_text()
# Repair two ownership anomalies before generating province shapes and adjacency.
needle="Image.fromarray((country * 14).clip(0,255).astype(np.uint8)).save(out / 'country-mask-debug.png')"
repair='''# 1. A detached coastal fragment just south of Wales is British, not French.
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
'''
assert needle in s
s=s.replace(needle, repair+'\n'+needle)
start=s.index('province_name_anchors = {')
end=s.index('\nmanual_seeds = {', start)
cities={
'GB':[('London',505,375),('Edinburgh',455,220),('Glasgow',395,230),('Manchester',435,310),('Birmingham',460,345),('Liverpool',390,315),('Cardiff',355,355),('Bristol',415,375),('Newcastle',485,280),('Aberdeen',470,140)],
'ES':[('Madrid',320,770),('Barcelona',512,730),('Seville',230,830),('Valencia',450,807),('Bilbao',380,672),('Zaragoza',465,707),('Granada',300,850),('Valladolid',310,707),('A Coruña',150,678),('Oviedo',225,649)],
'FR':[('Paris',525,461),('Marseille',690,647),('Lyon',640,557),('Bordeaux',395,590),('Lille',585,406),('Nantes',384,480),('Toulouse',505,632),('Strasbourg',734,481),('Brest',307,434),('Dijon',611,517)],
'DE':[('Berlin',956,330),('Hamburg',837,285),('Munich',897,515),('Cologne',737,373),('Frankfurt',802,415),('Stuttgart',807,475),('Dresden',923,418),('Breslau',1034,433),('Königsberg',1020,272),('Hanover',847,339)],
'SU':[('Moscow',1328,290),('Leningrad',1230,124),('Minsk',1145,337),('Smolensk',1235,310),('Kiev',1318,466),('Odessa',1435,553),('Kharkov',1452,469),('Vitebsk',1185,250),('Gomel',1275,370),('Pskov',1135,205)],
'RO':[('Bucharest',1349,621),('Cluj',1254,563),('Iași',1381,510),('Timișoara',1189,607),('Brașov',1321,574),('Sibiu',1265,588),('Craiova',1261,639),('Constanța',1467,618),('Galați',1401,576),('Cernăuți',1304,487)],
'HU':[('Budapest',1112,528),('Debrecen',1192,522),('Szeged',1134,568),('Pécs',1054,574),('Miskolc',1156,489),('Győr',1045,510),('Szolnok',1148,548),('Kecskemét',1095,554),('Eger',1100,486),('Nyíregyháza',1191,485)],
'IT':[('Rome',894,736),('Milan',835,584),('Turin',781,596),('Venice',911,599),('Florence',845,680),('Naples',963,765),('Bologna',887,635),('Bari',1044,778),('Palermo',914,893),('Genoa',788,651)],
'CH':[('Bern',770,537),('Zürich',820,518),('Geneva',724,552)],
'PT':[('Lisbon',130,785),('Porto',125,707),('Faro',130,861)],
'IE':[('Dublin',242,278),('Cork',175,329),('Galway',174,234)],
'NL':[('Amsterdam',655,304),('Rotterdam',652,343),('Utrecht',704,324)],
'BE':[('Brussels',644,384),('Antwerp',625,365),('Liège',664,403)],
'DK':[('Copenhagen',919,224),('Aarhus',799,213),('Odense',845,235)],
'SK':[('Bratislava',1051,467),('Banská Bystrica',1120,469),('Košice',1180,465)],
'YU':[('Belgrade',1295,695),('Zagreb',1068,617),('Sarajevo',1199,684)],
'BG':[('Sofia',1182,689),('Plovdiv',1243,701),('Varna',1272,643)]
}
import pprint
block='province_name_anchors = '+pprint.pformat(cities, width=124, sort_dicts=False)+'\n'
s=s[:start]+block+s[end:]
s=s.replace("'nations': {c: {'id': c, 'name': name[c], 'color': colour[c], 'playable': c in playable} for c in ids},", "'nations': {c: {'id': c, 'name': name[c], 'color': colour[c], 'playable': c in playable, 'capital': province_name_anchors[c][0][0]} for c in ids},")
# assign capital first to nearest province, then other cities optimizing names
needle2='''    rows, cols = linear_sum_assignment(cost)
    for r_i, c_i in zip(rows, cols):
        plist[r_i]['name'] = anchors[c_i][0]
'''
replacement='''    # Ensure each historical capital appears, assigned to the closest province.
    cap_row = int(np.argmin(cost[:, 0]))
    plist[cap_row]['name'] = anchors[0][0]
    plist[cap_row]['capital'] = True
    other_rows = [i for i in range(len(plist)) if i != cap_row]
    other_cols = list(range(1, len(anchors)))
    rows, cols = linear_sum_assignment(cost[np.ix_(other_rows, other_cols)])
    for r_i, c_i in zip(rows, cols):
        plist[other_rows[r_i]]['name'] = anchors[other_cols[c_i]][0]
'''
assert needle2 in s
s=s.replace(needle2,replacement)
p.write_text(s)
print('map generation patched')
