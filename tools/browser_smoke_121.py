import subprocess, time, urllib.request, os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
port=34783
env={**os.environ,'PORT':str(port)}
proc=subprocess.Popen(['node','server/index.js'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
try:
  for _ in range(50):
    try:
      urllib.request.urlopen(f'http://127.0.0.1:{port}/map.json',timeout=.2)
      break
    except Exception:time.sleep(.12)
  with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for size,label in [({'width':1365,'height':900},'desktop'),({'width':390,'height':844},'iphone')]:
      page=browser.new_page(viewport=size,device_scale_factor=1)
      errors=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      page.goto(f'http://127.0.0.1:{port}',wait_until='domcontentloaded')
      page.locator('#playerNameInput').fill('Admiral Phoenix')
      page.locator('#createRoom').click()
      page.locator('#nationChoices .nation-choice').filter(has_text='Great Britain').click(timeout=15000)
      page.wait_for_function("game && assigned==='GB' && map && idPixels",timeout=15000)
      coast=page.evaluate("map.provinces.find(p=>p.nation==='GB' && p.coastal).id")
      page.evaluate("id=>{selected=id;updateSidebar();setPanel('buildings')}",coast)
      page.wait_for_timeout(250)
      assert page.locator('#buildOptions .building-row').count()==7
      assert page.locator('#buildOptions .naval-shop').count()==1
      assert page.locator('#provinceInfoBar').count()==1
      assert page.locator('#navBuildings').is_visible()
      capital=page.evaluate('game.capitals.GB')
      assert capital is not None
      assert page.evaluate('game.commanders.GB')=='Admiral Phoenix'
      page.locator('#buildOptions .building-row').filter(has_text='Naval port').locator('button').click()
      page.wait_for_function("id=>game.provinces[id-1].buildings.port===1",arg=coast,timeout=5000)
      page.screenshot(path=str(root/f'ui-121-{label}.png'))
      print(label,'capital',capital,'coastal',coast,'port built','page errors',errors,'scrollWidth',page.evaluate('document.documentElement.scrollWidth'))
      assert not errors
      assert page.evaluate('document.documentElement.scrollWidth')<=size['width']+2
      page.close()
    browser.close()
finally:
  proc.terminate()
  try:proc.wait(timeout=3)
  except Exception:proc.kill()
