from playwright.sync_api import sync_playwright
import json,sys
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1500,'height':950}, device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto('http://localhost:3038/',wait_until='domcontentloaded',timeout=20000)
    page.wait_for_timeout(1100)
    print('modal',page.locator('#joinModal').is_visible(), 'page errors',errors[:3])
    print('create buttons',page.locator('button').all_text_contents()[:10])
    # click new private lobby
    page.locator('#createRoom').click(timeout=4000)
    page.wait_for_timeout(350)
    print('nation modal',page.locator('#nationModal').is_visible())
    print('nation choices',page.locator('.nation-choice').all_text_contents()[:8])
    page.locator('.nation-choice').filter(has_text='Great Britain').click(timeout=4000)
    page.wait_for_timeout(600)
    print('chosen',page.evaluate('assigned'),'game',page.evaluate('!!game'),'provinces',page.evaluate('game?.provinces?.length'))
    # simulate selecting province through actual canvas click mapping from province coordinates
    data=page.evaluate('''() => {
       const source=map.provinces.find(p=>game.provinces[p.id-1].owner===assigned&&game.provinces[p.id-1].units.infantry>0);
       const target=map.provinces.find(p=>p.id!==source.id&&game.provinces[p.id-1].owner===assigned);
       updateTransform();
       return {source:source.id,target:target.id,sourcePoint:[camera.tx+source.x*camera.scale,camera.ty+source.y*camera.scale],targetPoint:[camera.tx+target.x*camera.scale,camera.ty+target.y*camera.scale],units:game.provinces[source.id-1].units};
    }''')
    print('test source', data)
    x,y=data['sourcePoint'];box=page.locator('#mapCanvas').bounding_box()
    page.mouse.click(box['x']+x,box['y']+y)
    page.wait_for_timeout(350)
    print('selected',page.evaluate('selected'),'quickMove',page.locator('#quickMove').is_visible(), 'disabled',page.locator('#quickMove').is_disabled())
    page.locator('#quickMove').click()
    page.wait_for_timeout(350)
    print('planner',page.locator('#orderPlanner').is_visible(), 'ranges',page.locator('.planner-composer input[type=range]').count())
    print('range values',page.evaluate("['armyInfantry','armyTank','armyBomber'].map(id=>({id, value:document.getElementById(id).value,max:document.getElementById(id).max}))"))
    page.screenshot(path='/mnt/data/ww2-royale-1.8/order-planner-preview.png')
    x,y=data['targetPoint'];page.mouse.click(box['x']+x,box['y']+y)
    page.wait_for_timeout(350)
    print('draftTarget',page.evaluate('draftTarget'),'confirm shown',page.locator('#confirmOrderBtn').is_visible(),'cancel shown',page.locator('#cancelOrderBtn').is_visible(),'original hidden',not page.locator('#quickMove').is_visible())
    print('orders BEFORE confirm',page.evaluate('game.movements.length'))
    page.screenshot(path='/mnt/data/ww2-royale-1.8/order-confirm-preview.png')
    page.locator('#cancelOrderBtn').click()
    page.wait_for_timeout(150)
    print('after cancel',page.evaluate('actionMode'),'quickMove restored',page.locator('#quickMove').is_visible(),'orders',page.evaluate('game.movements.length'))
    page.locator('#quickMove').click()
    page.mouse.click(box['x']+x,box['y']+y)
    page.locator('#confirmOrderBtn').click()
    page.wait_for_timeout(350)
    print('after confirm', 'orders',page.evaluate('game.movements.length'),'selected',page.evaluate('selected'))
    print('JS ERRORS',errors)
    browser.close()
    if errors:sys.exit(3)
