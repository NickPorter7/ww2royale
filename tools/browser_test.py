import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
BASE='http://127.0.0.1:3000'
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for device,viewport in [('desktop',{'width':1440,'height':900}),('iphone',{'width':390,'height':844})]:
   page=await browser.new_page(viewport=viewport,device_scale_factor=2 if device=='iphone' else 1,has_touch=device=='iphone',is_mobile=device=='iphone')
   errors=[];page.on('pageerror',lambda ex:errors.append(str(ex)))
   await page.goto(BASE,wait_until='domcontentloaded');await page.wait_for_timeout(1400)
   await page.locator('#createRoom').click();await page.wait_for_timeout(700)
   nation=page.locator('#nationChoices .nation-choice').filter(has_text='France')
   await nation.click();await page.wait_for_timeout(700)
   assert await page.locator('#nationModal').is_hidden(), 'Nation selection not closed'
   assert await page.locator('#floatingPanel').is_hidden(), 'Selecting nation opens panel'
   # Select an owned province using calculated canvas fit
   data=await page.evaluate("""() => {const p=map.provinces.find(q=>q.nation==='FR'&&q.neighbors.some(n=>map.provinces[n-1].nation==='DE'));let r=canvas.getBoundingClientRect();updateTransform();return {id:p.id,x:r.left+camera.tx+p.x*camera.scale,y:r.top+camera.ty+p.y*camera.scale};}""")
   if data['x']>0 and data['x']<viewport['width'] and data['y']>65 and data['y']<viewport['height']-80:
    await page.mouse.click(data['x'],data['y']);await page.wait_for_timeout(200)
    print(device,'selected province:',await page.evaluate('selected'))
    assert await page.locator('#floatingPanel').is_hidden(), 'Province tap unexpectedly opens menu'
    await page.locator('#quickMove').click();await page.wait_for_timeout(250)
    assert await page.locator('#orderPlanner').is_visible(), 'Sliders not visible'
   await page.screenshot(path=f'/mnt/data/ww2-royale-1.12/{device}-preview.png',full_page=True)
   print(device,'errors',errors[:5], 'flags',await page.locator('#nationChoices .nation-flag').count(), 'size',viewport)
   await page.close()
  await browser.close()
asyncio.run(run())
