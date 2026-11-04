from playwright.sync_api import sync_playwright
from pathlib import Path
from PIL import Image
import json,base64,re
root=Path(__file__).resolve().parents[1]
h=(root/'client/index.html').read_text()
css=(root/'client/style.css').read_text()
js=(root/'client/main.js').read_text()
init_start=js.index('(async function init(){')
init_end=js.index('// Army selection shortcuts',init_start)
js=js[:init_start]+js[init_end:]
js=js.replace('localStorage.getItem','window.__fakeStorage.getItem').replace('localStorage.setItem','window.__fakeStorage.setItem')
# Static browser tests load assets inline to avoid browser localhost policy.
h=re.sub(r'<link rel="stylesheet"[^>]+>', '', h)
h=re.sub(r'<script defer src="/main\.js[^>]+></script>', '',h)
h=h.replace('</head>','<style>'+css+'</style></head>')
map=json.loads((root/'shared/map.json').read_text())
def uri(name):return 'data:image/png;base64,'+base64.b64encode((root/'client/assets'/name).read_bytes()).decode()
state={'provinces':[{'id':p['id'],'owner':p['nation'],'units':{'infantry':p['troops'],'tank':1,'bomber':0},
 'fleet':{'destroyer':2,'submarine':1,'battleship':0},'garrison':{},'buildings':{'barracks':1,'workshop':0,'airport':0,'bank':1,'defense':0,'port':1 if p['nation']=='GB' and p['coastal'] else 0,'capital':int(bool(p.get('capital')))},'visible':True} for p in map['provinces']],
 'money':2150,'capitals':{n:next(p['id'] for p in map['provinces'] if p['nation']==n and p.get('capital')) for n in map['nations']},
 'commanders':{'GB':'Admiral Phoenix','FR':'General Laurel'},'rankings':[{'nation':n,'place':i+1,'score':0,'provinces':10} for i,n in enumerate(map['nations'])],
 'diplomacy':{},'requests':[],'peaceRequests':[],'movements':[],'navalMovements':[],
 'spyBalloons':[],'chat':[],'occupied':['GB','FR'],'log':[], 'started':True,'public':False,'winner':None,
 'serverTime':1710000000000,'elapsedSeconds':67,'campaignDay':100}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for (width,height,label) in [(360,780,'iphone-small'),(390,844,'iphone'),(430,932,'iphone-plus')]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.set_content(h,wait_until='domcontentloaded')
  page.add_script_tag(content="window.__fakeStorage={getItem:()=>'',setItem:()=>{}};window.sentMessages=[];window.WebSocket=class FakeWS{constructor(){}send(v){window.sentMessages.push(JSON.parse(v));}close(){}};")
  page.add_script_tag(content=js)
  page.evaluate('''async ({data,state,mapurl,idurl})=>{
    map=data;game=state;assigned='GB';socket.connected=true;
    for(const p of map.provinces)definition.set(p.id,p);
    for(const [id,n] of Object.entries(map.nations)){nationColor[id]=n.color;nationNames[id]=n.name;}
    const load=src=>new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.src=src;});
    mapImage=await load(mapurl);territoryImage=await load(idurl);
    const c=document.createElement('canvas');c.width=map.width;c.height=map.height;
    const ct=c.getContext('2d',{willReadFrequently:true});ct.drawImage(territoryImage,0,0);
    idPixels=ct.getImageData(0,0,map.width,map.height).data;
    ct.clearRect(0,0,map.width,map.height);ct.drawImage(mapImage,0,0);
    originalPixels=ct.getImageData(0,0,map.width,map.height).data;
    $('joinModal').hidden=true;$('nationModal').hidden=true;
    gameClockServerAt=state.serverTime;gameClockClientAt=performance.now();
    updateCampaignClock(state);updateSidebar();resize();
  }''',{'data':map,'state':state,'mapurl':uri('europe-map.png'),'idurl':uri('province-ids.png')})
  coast=next(x for x in map['provinces'] if x['nation']=='GB' and x['coastal'])
  page.evaluate('''p=>{selected=p.id;updateSidebar();setPanel('buildings');}''',coast)
  page.wait_for_timeout(250)
  assert page.locator('#moneyValue').inner_text()=='$2150.00',page.locator('#moneyValue').inner_text()
  check=page.evaluate('''() => {
    const cash=document.querySelector('.treasury-hud'),rank=document.querySelector('.rank-hud');
    const elapsed=document.querySelector('.elapsed-hud'),rect=cash.getBoundingClientRect(),timer=elapsed.getBoundingClientRect();
    return {display:getComputedStyle(cash).display,rank:getComputedStyle(rank).display,
      left:rect.left,right:rect.right,elapsedRight:timer.right,viewport:innerWidth};
  }''')
  assert check['display']!='none' and check['right']<=width and check['left']>=0,check
  assert check['rank']=='none',check
  assert check['left']>=check['elapsedRight']-1,check
  zooms={}
  for nation in ['PT','HU','RO']:
    zooms[nation]=page.evaluate('(nation)=>{assigned=nation;focusNationOnMobile(nation);return camera.zoom;}',nation)
    assert zooms[nation]>3.1, (nation,zooms)
  print(label,'treasury',check,'zoom',zooms)
  page.evaluate('''() => {
    assigned='FR';
    const src=map.provinces.find(p=>p.nation==='FR');
    const dst=map.provinces[src.neighbors[0]-1];
    const start=gameNow();
    game.spyBalloons=[{id:1,nation:'FR',province:src.id,movement:{from:src.id,to:dst.id,
      origin:src.id,path:[src.id,dst.id],startedAt:start,stepMs:8500,arrivalAt:start+8500}}];
    drawSpyBalloons();renderOrders();
  }''')
  assert page.locator('#movementOrders').inner_text().find('SPY BALLOON #1')!=-1
  assert page.locator('.building-row').count()==7
  assert page.locator('.naval-shop').count()==1
  assert page.locator('#playerNameInput').count()==1
  assert page.locator('.fleet-amount input').count()==3
  assert page.locator('#navBuildings').count()==1
  assert page.evaluate('game.commanders.GB')=='Admiral Phoenix'
  print(label,'width',page.evaluate('document.documentElement.scrollWidth'),'buttons',page.locator('.building-row').count(),'errors',errors[:3])
  page.screenshot(path=str(root/f'ui-123-{label}.png'))
  assert not errors,errors
  assert page.evaluate('document.documentElement.scrollWidth')<=width+2
  page.close()
 browser.close()
print('PASS offline browser: naval purchase UI, capital status, username, mobile and desktop layout')
