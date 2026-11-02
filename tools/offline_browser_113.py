from playwright.sync_api import sync_playwright
from pathlib import Path
from PIL import Image
import json,base64,sys
root=Path(__file__).resolve().parents[1]
h=(root/'client/index.html').read_text()
css=(root/'client/style.css').read_text()
js=(root/'client/main.js').read_text()
# This offline test initializes the assets explicitly; skip live fetch initialization.
init_start=js.index('(async function init(){')
init_end=js.index('// Army selection shortcuts',init_start)
js=js[:init_start]+js[init_end:]
data=json.loads((root/'shared/map.json').read_text())
def uri(name):
 return 'data:image/png;base64,'+base64.b64encode((root/'client/assets'/name).read_bytes()).decode()
mapuri=uri('europe-map.png');iduri=uri('province-ids.png');seasonuri=uri('season-winter.png')
html=h.replace('<link rel="stylesheet" href="/style.css">','').replace('<script defer src="/main.js"></script>','').replace('</head>','<style>'+css+'</style></head>')
state={'provinces':[{'id':pr['id'],'owner':pr['nation'],'units':{'infantry':pr['troops'],'tank':2,'bomber':1},'garrison':{},'buildings':{'barracks':1,'workshop':0,'airport':0,'bank':1,'defense':0},'visible':True,'production':None} for pr in data['provinces']],
 'money':950,'rankings':[{'nation':n,'place':i+1,'score':0,'provinces':10} for i,n in enumerate(data['nations'])],
 'diplomacy':{},'requests':[],'peaceRequests':[],'movements':[],'spyBalloons':[],'chat':[],'occupied':[],'log':[],
 'started':True,'public':False,'winner':None,'serverTime':1710000000000,'elapsedSeconds':67,'campaignDay':70}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height,label in [(1440,900,'desktop'),(390,844,'iphone')]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.set_content(html,wait_until='domcontentloaded')
  page.add_script_tag(content='window.sentMessages=[];window.WebSocket=class FakeWS{constructor(){} send(t){window.sentMessages.push(JSON.parse(t));}close(){}};')
  page.add_script_tag(content=js)
  page.evaluate('''async ({data,state,mapuri,iduri,seasonuri})=>{
   map=data;assigned='FR';game=state;socket.connected=true;
   for(const p of map.provinces)definition.set(p.id,p);
   for(const [id,n] of Object.entries(map.nations)){nationColor[id]=n.color;nationNames[id]=n.name;}
   const load=src=>new Promise(r=>{const img=new Image();img.onload=()=>r(img);img.src=src;});
   mapImage=await load(mapuri);territoryImage=await load(iduri);seasonAssets.winter=await load(seasonuri);
   const c=document.createElement('canvas');c.width=map.width;c.height=map.height;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(territoryImage,0,0);idPixels=ctx.getImageData(0,0,map.width,map.height).data;
   ctx.clearRect(0,0,map.width,map.height);ctx.drawImage(mapImage,0,0);originalPixels=ctx.getImageData(0,0,map.width,map.height).data;
   $('joinModal').hidden=true;$('nationModal').hidden=true;
   gameClockServerAt=state.serverTime;gameClockClientAt=performance.now();
   updateCampaignClock(state);updateSidebar();resize();
  }''',{'data':data,'state':state,'mapuri':mapuri,'iduri':iduri,'seasonuri':seasonuri})
  # Verify state from empty screen to selected province and build menu.
  src=next(pr for pr in data['provinces'] if pr['nation']=='FR' and 360<pr['x']<710 and 400<pr['y']<620)
  pos=page.evaluate('''({x,y})=>{updateTransform();const r=canvas.getBoundingClientRect();return {x:r.x+camera.tx+x*camera.scale,y:r.y+camera.ty+y*camera.scale};}''',{'x':src['x'],'y':src['y']})
  page.mouse.click(pos['x'],pos['y']);page.wait_for_timeout(250)
  print(label,'selected',page.evaluate('selected'),'expected',src['id'],'info',page.locator('#provinceInfoBar').is_visible())
  assert page.evaluate('selected')==src['id']
  assert page.locator('#provinceInfoBar').is_visible()
  assert page.locator('#intelDetails .intel-entry').count()>=8
  assert page.locator('#floatingPanel').is_hidden()
  page.locator('#quickBuild').click();page.wait_for_timeout(180)
  assert page.locator('.troop-buy-card').count()==4
  print(label,'recruit visible',page.locator('.troop-buy-card').count(),'clock',page.locator('#elapsedClock').inner_text())
  # Test clicking unit buy sends the expected protocol message.
  page.locator('.troop-buy-card').filter(has_text='Infantry').locator('.troop-buy-button').first.click()
  assert any(m['type']=='buyUnit' for m in page.evaluate('sentMessages'))
  # toast animation
  page.evaluate("notice('Recruitment completed.','success')")
  assert page.locator('#toastStack .float-toast').count()>0
  page.screenshot(path=str(root/f'ui-{label}-1.13.png'))
  print(label,'JS errors',errors,'body width',page.evaluate('document.documentElement.scrollWidth'))
  if errors:raise AssertionError(errors)
  page.close()
 browser.close()
print('PASS offline browser: province intelligence, construction, purchased troop command, floating toasts desktop/mobile')
