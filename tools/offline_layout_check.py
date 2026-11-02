import asyncio, base64
from pathlib import Path
from playwright.async_api import async_playwright
r=Path(__file__).resolve().parent.parent
css=(r/'client/style.css').read_text()
img=base64.b64encode((r/'client/assets/europe-map.png').read_bytes()).decode()
html=f'''<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>{css}
.map-section {{background-image:url(data:image/png;base64,{img});background-size:contain;background-position:center;background-repeat:no-repeat}}
</style><header class="topbar"><div class="brand"><div class="brand-main">WW2 <span>ROYALE</span></div></div><div class="header-right"><div class="hud-stat"><span class="hud-stat-label">TREASURY</span><strong>$100.00</strong></div><div class="server-strip"><span class="room-value">123456</span></div><button class="header-button">Rooms</button></div></header><main class="layout"><section class="map-section"><nav class="tool-rail"><div class="rail-top">COMMAND</div>{''.join(f'<button class="rail-btn"><span>{label}</span></button>' for label in ['Army','Buildings','Diplomacy','Messages','Orders','Rankings','Reports','Settings'])}</nav><div class="floating-panel" hidden></div><div class="order-planner" id="orderPlanner"><div class="planner-controls"><div class="planner-composer">{''.join(f'<div class="unit-pick"><label class="planner-unit-symbol">{u[0]}</label><input type="range" max="100" value="100"/><output>100</output></div>' for u in ['Infantry','Tank','Bomber'])}</div></div></div><div class="quick-command" id="quickCommand">{''.join(f'<button class="quick-action quick-action-{color}">{label}</button>' for label,color in [('Attack','attack'),('Move','move'),('Build','build')])}</div></section></main></html>'''
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height,label in [(390,844,'iphone'),(1440,900,'desktop')]:
   pg=await browser.new_page(viewport={'width':width,'height':height})
   await pg.set_content(html,wait_until='load')
   dims=await pg.evaluate('''() => {const rect=(s)=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};return {rail:rect('.tool-rail'),commands:rect('.quick-command'),sliders:rect('.order-planner'),screen:{w:window.innerWidth,h:window.innerHeight},overflow:document.documentElement.scrollWidth-window.innerWidth}}''')
   assert dims['overflow']<2,(label,dims)
   if label=='iphone': assert dims['commands']['bottom']<dims['rail']['top']+2,(label,dims)
   assert dims['sliders']['bottom']<dims['commands']['top']+2,(label,dims)
   await pg.screenshot(path=str(r/f'{label}-layout-preview.png'))
   print(label,dims)
   await pg.close()
  await browser.close()
asyncio.run(main())
