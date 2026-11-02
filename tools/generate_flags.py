from pathlib import Path
p=Path(__file__).resolve().parent.parent/'client/assets/flags';p.mkdir(exist_ok=True,parents=True)
def rect(x,y,w,h,c):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{c}"/>'
def H(*colors):return ''.join(rect(0,80*i/len(colors),120,80/len(colors),c) for i,c in enumerate(colors))
def V(*colors):return ''.join(rect(120*i/len(colors),0,120/len(colors),80,c) for i,c in enumerate(colors))
def cross(bg,c,xx=41,yy=32,thick=12):return rect(0,0,120,80,bg)+rect(xx,0,thick,80,c)+rect(0,yy,120,thick,c)
flags={
'FR':V('#002395','#FFFFFF','#ED2939'),
'NL':H('#AE1C28','#FFFFFF','#21468B'),
'BE':V('#141414','#F2C500','#EF3340'),
'RO':V('#002B7F','#FCD116','#CE1126'),
'IE':V('#169B62','#FFFFFF','#FF883E'),
'IT':V('#008C45','#F4F5F0','#CD212A')+'<path d="M55 25h13v27l-7 5-6-5z" fill="#FFFFFF" stroke="#9C1C2A" stroke-width="2"/><path d="M61 26v27" stroke="#C81D2A" stroke-width="2"/>',
'ES':H('#AA151B','#F1BF00','#AA151B')+rect(38,25,18,30,'#F1BF00')+'<path d="M42 31h11v20l-6-4-5 4z" fill="#AF171C" stroke="#F7E8A0" stroke-width="2"/>',
'HU':H('#CE2939','#FFFFFF','#477050')+'<path d="M52 27h16v22l-8 5-8-5z" fill="#FFFFFF" stroke="#B83F41" stroke-width="2"/>',
'BG':H('#FFFFFF','#00966E','#D62612'),
'YU':H('#0C4076','#FFFFFF','#D21E28'),
'SK':H('#FFFFFF','#0B4EA2','#EE1C25'),
'DK':cross('#C8102E','#FFFFFF',38,32,12),
'CH':rect(0,0,120,80,'#DA291C')+rect(53,19,14,42,'#FFFFFF')+rect(38,33,44,14,'#FFFFFF'),
'PT':rect(0,0,48,80,'#006600')+rect(48,0,72,80,'#FF0000')+'<circle cx="48" cy="40" r="17" stroke="#EFCB4D" stroke-width="4" fill="none"/><path d="M39 29h18v21l-9 6-9-6z" fill="white" stroke="#A71C2A" stroke-width="2"/>',
'SU':rect(0,0,120,80,'#CC0000')+'<path d="M17 16l4.3 13.3-11.2-8.2h13.8l-11.1 8.2z" fill="#FFDF00"/><path d="M27 29a14 14 0 0 0 18 7" fill="none" stroke="#FFDF00" stroke-width="5"/><path d="M29 17l18 20" stroke="#FFDF00" stroke-width="4"/>',
'DE':rect(0,0,120,80,'#CF0000')+'<circle cx="60" cy="40" r="23" fill="white"/><g transform="translate(60 40) rotate(45)" fill="none" stroke="#141414" stroke-width="7" stroke-linejoin="miter"><path d="M0 0 V-12 H-20 M0 0 H12 V-20 M0 0 V12 H20 M0 0 H-12 V20"/></g>',
}
# Historically correct Union Flag in use in 1939.
flags['GB'] = rect(0,0,120,80,'#012169') + '<path d="M0 0 120 80 M120 0 0 80" stroke="white" stroke-width="19"/><path d="M0 0 120 80 M120 0 0 80" stroke="#C8102E" stroke-width="8"/>'+rect(0,30,120,20,'white')+rect(50,0,20,80,'white')+rect(0,34,120,12,'#C8102E')+rect(54,0,12,80,'#C8102E')
assert len(flags)==17
for code,body in flags.items():
    text=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" role="img" aria-label="1939 {code} flag">{body}</svg>'
    (p/f'{code}.svg').write_text(text,encoding='utf8')
print(len(flags),'historical flag illustrations generated')
