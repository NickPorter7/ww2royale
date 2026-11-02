from playwright.sync_api import sync_playwright
from pathlib import Path
import json,base64,sys
root=Path(__file__).resolve().parents[1]
h=(root/'client/index.html').read_text()
css=(root/'client/style.css').read_text()
js=(root/'client/main.js').read_text()
data=json.loads((root/'shared/map.json').read_text())
# Use data URLs to display exact bundled map while avoiding unavailable browser network access.
mapuri='data:image/png;base64,'+base64.b64encode((root/'client/assets/europe-map.png').read_bytes()).decode()
iduri='data:image/png;base64,'+base64.b64encode((root/'client/assets/province-ids.png').read_bytes()).decode()
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1450,'height':920})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  html=h.replace('<link rel="stylesheet" href="/style.css">','').replace('<script defer src="/main.js"></script>','').replace('</head>','<style>'+css+'</style></head>')
  page.set_content(html,wait_until='domcontentloaded')
  page.add_script_tag(content='''window.WebSocket=class FakeWS { constructor(){this.readyState=1;} send(text){window.sentMessages.push(JSON.parse(text))} close(){} };window.sentMessages=[];''')
  page.add_script_tag(content=js)
  state={"provinces":[{"id":pr['id'],"owner":pr['nation'],"units":{"infantry":pr['troops'],"tank":4,"bomber":2},"garrison":{},"buildings":{"barracks":1,"shop":0,"airport":0,"bank":1,"defense":0},"visible":True,"production":{}} for pr in data['provinces']],"money":100,"rankings":[{"nation":n,"place":i+1,"score":0,"provinces":10} for i,n in enumerate(data['nations'])],"diplomacy":{},"requests":[],"peaceRequests":[],"movements":[],"chat":[],"occupied":[],"log":[],"started":True,"public":False,"winner":None}
  init='''async ({mapdata,state,mapuri,iduri}) => {
    map=mapdata;assigned='GB';game=state;socket.connected=true;
    for(const p of map.provinces)definition.set(p.id,p);
    for(const [id,n] of Object.entries(map.nations)){nationColor[id]=n.color;nationNames[id]=n.name;}
    mapImage=await new Promise(r=>{const img=new Image();img.onload=()=>r(img);img.src=mapuri;});
    territoryImage=await new Promise(r=>{const img=new Image();img.onload=()=>r(img);img.src=iduri;});
    let scratch=document.createElement('canvas');scratch.width=map.width;scratch.height=map.height;
    let c=scratch.getContext('2d',{willReadFrequently:true});c.drawImage(territoryImage,0,0);
    idPixels=c.getImageData(0,0,map.width,map.height).data;
    c.clearRect(0,0,map.width,map.height);c.drawImage(mapImage,0,0);
    originalPixels=c.getImageData(0,0,map.width,map.height).data;
    $('joinModal').hidden=true;$('nationModal').hidden=true;
    updateSidebar();resize();
  }'''
  page.evaluate(init,{"mapdata":data,"state":state,"mapuri":mapuri,"iduri":iduri})
  # Emulate selecting visible province on map with genuine click on source centroid.
  src=next(pr for pr in data['provinces'] if pr['nation']=='GB')
  target=next(pr for pr in data['provinces'] if pr['nation']=='GB' and pr['id'] in src['neighbors'])
  def click_province(pr):
    pos=page.evaluate('''({x,y})=>{updateTransform();return {x:camera.tx+x*camera.scale,y:camera.ty+y*camera.scale}}''',{"x":pr['x'],"y":pr['y']})
    b=page.locator('#mapCanvas').bounding_box();page.mouse.click(b['x']+pos['x'],b['y']+pos['y'])
  click_province(src)
  print('selected province',page.evaluate('selected'),'expected',src['id'])
  print('quick visible',page.locator('#quickCommand').is_visible(), 'move enabled',not page.locator('#quickMove').is_disabled())
  page.locator('#quickMove').click()
  print('planner visible',page.locator('#orderPlanner').is_visible())
  quantities=page.evaluate("['armyInfantry','armyTank','armyBomber'].map(id=>[document.getElementById(id).value,document.getElementById(id).max])")
  print('defaults',quantities)
  assert all(a==b and int(b)>0 for a,b in quantities), quantities
  page.screenshot(path=str(root/'order-planner-preview.png'))
  click_province(target)
  print('target selection',page.evaluate('draftTarget'), 'expected',target['id'])
  print('swap',page.locator('#confirmOrderBtn').is_visible(),page.locator('#cancelOrderBtn').is_visible(),page.locator('#quickMove').is_visible())
  assert page.evaluate('draftTarget')==target['id']
  assert page.locator('#confirmOrderBtn').is_visible() and not page.locator('#confirmOrderBtn').is_disabled()
  assert page.evaluate('sentMessages.length')==0
  page.screenshot(path=str(root/'order-confirm-preview.png'))
  page.locator('#cancelOrderBtn').click()
  print('cancel state',page.evaluate('actionMode'),page.evaluate('sentMessages.length'))
  assert page.evaluate('actionMode') is None
  assert page.evaluate('sentMessages.length')==0
  page.locator('#quickMove').click()
  page.locator('#armyInfantry').fill('6')
  click_province(target)
  page.locator('#confirmOrderBtn').click()
  sent=page.evaluate('sentMessages')
  print('confirmed wire order',sent)
  assert len(sent)==1 and sent[0]['type']=='move' and sent[0]['data']['units']['infantry']==6
  print('errors',errors)
  if errors:sys.exit(2)
  browser.close()
