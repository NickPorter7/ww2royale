"""WW2 Royale 1.15 UI/time upgrade. Preserves original game mechanics otherwise."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent.parent
client=root/'client'
js=(client/'main.js').read_text()
html=(client/'index.html').read_text()
css=(client/'style.css').read_text()
mapfile=root/'shared/map.json'
data=json.loads(mapfile.read_text());data['secondsPerYear']=1200;data['secondsPerDay']=1200/365
mapfile.write_text(json.dumps(data,separators=(',',':')))
server=root/'server/game.js'
s=server.read_text().replace('export const MOVE_MS={infantry:10000,tank:20000,bomber:7000};','export const MOVE_MS={infantry:15000,tank:30000,bomber:10500};')
server.write_text(s)

# No Chaikin smoothing. Original shared borders are now generated from the authoritative ID raster.
# This avoids independent polygon vertices, tiny cracks, and rounded terrain.
begin=js.index('function smoothLoop(')
end=js.index('function drawOutline(',begin)
js=js[:begin]+'''// Detailed province paths follow the actual ID-mask contours. No per-province
// corner rounding: different neighbours must NEVER diverge from shared edges.
function pathFor(province){
  if(province._path)return province._path;
  const path=new Path2D();
  for(const loop of province.paths||[]){
    if(loop.length<3)continue;
    path.moveTo(loop[0][0],loop[0][1]);
    for(let i=1;i<loop.length;i++)path.lineTo(loop[i][0],loop[i][1]);
    path.closePath();
  }
  province._path=path;return path;
}
''' + js[end:]
js=js.replace('if(smoothBorderCanvas)ctx.drawImage(smoothBorderCanvas,0,0); else if(borderImage)ctx.drawImage(borderImage,0,0);', 'if(borderImage)ctx.drawImage(borderImage,0,0);')
js=js.replace('    smoothBorderCanvas=buildSmoothBorderCanvas();','    // Shared pixel-perfect borders loaded from province-lines.png; no independent smoothing.')

# Season intensity as a continuous function of the simulated day of the year.
js=js.replace('let deployingBalloonId=null, currentSeason="autumn", seasonAssets={}, currentSeasonImage=null;',
'''let deployingBalloonId=null, currentSeason="autumn", seasonAssets={}, currentSeasonImage=null;
let seasonIntensity=0.35, weatherIntensity=0.35;''')
# rewrite setSeason implementation with intensity scale; re-create only when season changes
start=js.index('function setSeason(season){')
end=js.index('function resize(){',start)
js=js[:start]+'''function seasonalDepth(date){
  // Progress grows from early season toward its centre, then decreases.
  const month=date.getUTCMonth(), day=date.getUTCDate();
  const seasonMonth=month%3; // Dec/Mar/Jun/Sep are 0, next months 1 and 2.
  const progress=Math.min(1,(seasonMonth+(day-1)/30.5)/3);
  return Math.max(.17,Math.min(1,.17+.83*Math.sin(Math.PI*progress)));
}
function setSeason(season, depth=0.5){
  const weather=$('weatherLayer');
  const next=Math.max(.17,Math.min(1,depth));
  const changed=season!==currentSeason||weather.dataset.ready!=='yes';
  seasonIntensity=next;weatherIntensity=next;
  weather.style.opacity=String(.35+.65*next);
  if(!changed){queueRender();return;}
  currentSeason=season; currentSeasonImage=seasonAssets[season]||null;
  weather.className='weather-layer '+season;weather.replaceChildren();
  if(season!=='summer'){
    const mobile=window.matchMedia('(max-width:700px)').matches;
    // Density increases visually toward the deepest part of the season.
    const count=season==='winter'?(mobile?46:82):(mobile?24:45);
    for(let i=0;i<count;i++){
      const flake=document.createElement('span');flake.className='weather-particle';
      flake.style.setProperty('--x',`${(i*61.8034)%100}%`);
      flake.style.setProperty('--speed',`${6+(i%9)*1.1}s`);
      flake.style.setProperty('--delay',`${-(i*2.17)%15}s`);
      flake.style.setProperty('--drift',`${(i%2===0?1:-1)*(12+(i%8)*9)}px`);
      flake.style.setProperty('--opacity',`${.30+(i%6)*.08}`);
      weather.append(flake);
    }
  }
  weather.dataset.ready='yes';queueRender();
}
''' + js[end:]
# Preserve existing season images but vary alpha progressively
js=js.replace('if(currentSeasonImage)ctx.drawImage(currentSeasonImage,0,0);',
'''if(currentSeasonImage){
    ctx.save();
    ctx.globalAlpha=.23+.77*seasonIntensity;
    ctx.drawImage(currentSeasonImage,0,0);
    ctx.restore();
  }''')
js=js.replace('  setSeason(season);syncElapsed();', '  setSeason(season,seasonalDepth(date));syncElapsed();')
js=js.replace("$('seasonBadge').textContent=`${season.toUpperCase()} · ${date.getUTCFullYear()}`;",
'''$('seasonBadge').textContent=`${season.toUpperCase()} · ${date.getUTCFullYear()}`;''')

# Revise troop numbers: only for provinces with server-authorized visibility; no question marks.
start=js.index('function drawTroops(){')
end=js.index('function draw(){',start)
js=js[:start]+'''function drawTroops(){
  if(!game||!map)return;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  const scale=Math.max(.75,Math.min(2.0,camera.scale));
  const size=12/scale;
  ctx.font=`800 ${size}px Inter,Arial,sans-serif`;
  for(const p of map.provinces){
    const state=game.provinces?.[p.id-1];
    // The backend redacts non-visible units. Never show question marks or numbers
    // for classified provinces; never infer counts from ownership alone.
    if(!state?.visible||!state.units)continue;
    const count=unitTotal(state.units);
    const garrisons=Object.entries(state.garrison||{}).filter(([,a])=>unitTotal(a)>0);
    if(!count&&!garrisons.length)continue;
    const type=selectedArmyIcon(state.units);
    const icon=unitArt[type];
    const x=p.x,y=p.y;
    const label=String(count);
    const width=Math.max(27/scale,ctx.measureText(label).width+22/scale),height=20/scale;
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,.42)';ctx.shadowBlur=4/scale;
    ctx.fillStyle=state.owner===assigned?'rgba(14,41,41,.9)':'rgba(24,34,39,.84)';
    ctx.strokeStyle=state.owner===assigned?'rgba(217,239,207,.84)':'rgba(215,227,229,.7)';
    ctx.lineWidth=1/scale;
    ctx.beginPath();ctx.roundRect(x-width/2,y-height/2,width,height,3/scale);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;
    const iconSize=14/scale;
    if(icon?.complete)ctx.drawImage(icon,x-width/2+2/scale,y-iconSize/2,iconSize,iconSize);
    ctx.fillStyle='#f7f0db';ctx.textAlign='right';
    ctx.fillText(label,x+width/2-4/scale,y+0.6/scale);
    ctx.restore();
    let line=0;
    for(const [nation,stack] of garrisons){
      const allyCount=unitTotal(stack);
      if(!allyCount)continue;
      const allyText=`${nation} ${allyCount}`;
      ctx.font=`800 ${10/scale}px Inter,Arial,sans-serif`;
      const aw=ctx.measureText(allyText).width+12/scale;
      const ay=y+height/2+9/scale+(line++)*15/scale;
      ctx.fillStyle='rgba(11,30,39,.88)';ctx.strokeStyle=nationColor[nation]||'#a1cfff';
      ctx.beginPath();ctx.roundRect(x-aw/2,ay-6/scale,aw,13/scale,3/scale);ctx.fill();ctx.stroke();
      ctx.fillStyle='#f2f6ff';ctx.textAlign='center';ctx.fillText(allyText,x,ay);
    }
    ctx.font=`800 ${size}px Inter,Arial,sans-serif`;
  }
  ctx.restore();
}
''' + js[end:]
js=js.replace('drawSpyBalloons();ctx.restore();if(game?.movements?.length)queueRender();',
              'drawSpyBalloons();drawTroops();ctx.restore();if(game?.movements?.length)queueRender();')

# Province dock: title row + sections inspired by user's compact Supremacy-esque sample.
start=js.index('function renderProvinceIntel(){')
end=js.index('function iconSvg(name){',start)
js=js[:start]+'''function renderProvinceIntel(){
  const bar=$('provinceInfoBar');bar.hidden=!(selected&&game);if(bar.hidden)return;
  const state=game.provinces?.[selected-1],province=definition.get(selected);
  if(!state||!province){bar.hidden=true;return;}
  $('intelProvince').textContent=province.name.toUpperCase();
  const status=relationWith(state.owner);
  $('intelRelation').textContent=status==='self'?'YOUR PROVINCE':status==='ally'?'ALLIED':status==='war'?'AT WAR':'NEUTRAL';
  const flag=$('intelNationFlag');
  flag.src=`/assets/flags/${state.owner}.svg`; flag.alt=(nationNames[state.owner]||state.owner)+' flag';
  const out=$('intelDetails');out.replaceChildren();
  if(!state.visible){
    const classified=elem('div','','intel-classified');
    classified.append(iconSvg('ico-target'),elem('div','INTELLIGENCE CLASSIFIED','intel-classified-title'),elem('small','Border, ally with or scout this province to reveal forces and buildings.'));
    out.append(classified);return;
  }
  const groups=[
    {title:'ARMY',items:[
      ['ico-users',state.units?.infantry||0,'INFANTRY'],
      ['ico-tank',state.units?.tank||0,'TANKS'],
      ['ico-airport',state.units?.bomber||0,'BOMBERS']
    ]},
    {title:'INFRASTRUCTURE',items:[
      ['ico-barracks',state.buildings?.barracks||0,'BARRACKS'],
      ['ico-autoshop',state.buildings?.workshop||0,'WORKSHOP'],
      ['ico-airport',state.buildings?.airport||0,'AIRPORT'],
      ['ico-bank',state.buildings?.bank||0,'BANK'],
      ['ico-fort',state.buildings?.defense||0,'DEFENCE']
    ]}
  ];
  for(const section of groups){
    const group=elem('div','','intel-group');
    group.append(elem('span',section.title,'intel-section-title'));
    const tiles=elem('div','','intel-tiles');
    for(const [icon,count,label] of section.items){
      const tile=elem('div','','intel-tile');tile.title=label;
      const pictogram=elem('span','','intel-tile-icon');pictogram.append(iconSvg(icon));
      tile.append(pictogram,elem('strong',String(count),'intel-tile-count'),elem('small',label,'intel-tile-label'));
      tiles.append(tile);
    }
    group.append(tiles);out.append(group);
  }
  const balloons=(game.spyBalloons||[]).filter(b=>b.province===selected);
  if(balloons.length){
    const spy=elem('span','','intel-spy');spy.title='Friendly reconnaissance balloons';
    spy.append(iconSvg('ico-airport'),document.createTextNode('Spy balloons '+balloons.length));out.append(spy);
  }
  const allies=Object.entries(state.garrison||{}).filter(([,a])=>unitTotal(a)>0);
  if(allies.length)out.append(elem('div',allies.map(([n,a])=>`${nationNames[n]} garrison: ${unitTotal(a)}`).join(' · '),'intel-garrison'));
}
''' + js[end:]
# Adjust header sources
html=html.replace('<div class="province-info-head"><strong id="intelProvince">—</strong><span id="intelRelation">—</span></div>',
'''<div class="province-info-head"><img id="intelNationFlag" class="intel-nation-flag" src="/assets/flags/GB.svg" alt="Nation flag"><strong id="intelProvince">—</strong><span id="intelRelation">—</span></div>''')
# add step info to tooltip? not needed

# update label tooltips and main menu text
html=html.replace('Infantry · 10 seconds per province','Infantry · 15 seconds per province')
html=html.replace('Tanks · 20 seconds per province','Tanks · 30 seconds per province')
html=html.replace('Bombers · 7 seconds per province','Bombers · 10.5 seconds per province')
html=html.replace('1 in-game day per 10 seconds','1 in-game year every 20 minutes')
# update settings season dynamic? no

css+='''

/* WW2 Royale 1.15 — province information command dock */
.province-info-bar{
  bottom:83px;width:min(930px,calc(100% - 236px));
  padding:0;background:rgba(17,33,39,.91);
  border:1px solid #8ca2a0a6;border-radius:4px;
  box-shadow:0 9px 25px #0007;backdrop-filter:blur(8px);overflow:hidden;
}
.province-info-head{
  min-height:33px;margin:0;padding:3px 12px;
  background:linear-gradient(180deg,#315766,#244653);
  border-bottom:1px solid #94a4a8b5;display:flex;align-items:center;justify-content:center;gap:10px;
}
.province-info-head strong{font:800 15px Inter,'Segoe UI',sans-serif;letter-spacing:.16em;color:#f3f6f2;text-shadow:0 1px 2px #0008;text-align:center;flex:1}
.province-info-head span{font-size:9px;letter-spacing:.10em;color:#d6e4e3;max-width:180px;text-align:right}
.intel-nation-flag{width:34px;height:22px;border-radius:2px;object-fit:cover;border:1px solid #ffffff77;box-shadow:0 2px 6px #0006}
.province-info-data{padding:10px 13px 12px;display:flex;align-items:stretch;justify-content:center;gap:12px;flex-wrap:nowrap;min-width:0}
.province-info-data .intel-group{display:flex;flex-direction:column;gap:6px;align-items:stretch;min-width:0;flex:none}
.intel-section-title{text-align:center;color:#cbd6d4;font-size:9px;letter-spacing:.15em;font-weight:850}
.intel-tiles{display:flex;gap:6px;justify-content:center;min-width:0}
.intel-tile{background:rgba(54,70,74,.76);border:1px solid #82949599;border-radius:5px;min-width:65px;max-width:80px;width:68px;min-height:69px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;padding:4px 3px;box-shadow:inset 0 1px #ffffff10}
.intel-tile-icon{display:grid;place-items:center;height:25px}
.intel-tile-icon svg{width:24px;height:24px;stroke:#e3e7e0;stroke-width:1.9;fill:none}
.intel-tile-count{color:#fff4d2;font:850 13px Inter,'Segoe UI',sans-serif;line-height:1.1}
.intel-tile-label{color:#bacdcc;font-size:8px;letter-spacing:.04em;font-weight:750}
.intel-classified{display:flex;align-items:center;gap:9px;color:#b5c1c6;font-weight:750;min-height:55px}
.intel-classified svg{width:24px;height:24px;stroke:#c9d5da;fill:none}
.intel-classified-title{font-size:12px;letter-spacing:.1em;color:#e1e7e4}
.intel-classified small{font-size:10px;color:#b3c6cb;font-weight:500}
.intel-spy{display:flex;align-items:center;gap:4px;font-size:10px;color:#d1deee}
.intel-spy svg{width:17px;height:17px;stroke:#a1d7e7;fill:none}
.intel-garrison{padding:5px 8px;max-width:190px}
/* Tactile, subtle darkening rather than brightening and lifting on hover. */
@media(hover:hover){
  button:hover:not(:disabled),.rail-btn:hover:not(:disabled),.quick-command .quick-action:hover:not(:disabled){
    filter:brightness(.88);transform:translateY(0);box-shadow:inset 0 2px 4px #0003;
  }
}
button:active:not(:disabled),.quick-command .quick-action:active:not(:disabled),.rail-btn:active:not(:disabled){
  filter:brightness(.78);transform:translateY(2px) scale(.975);box-shadow:inset 0 3px 9px #0009!important;
}
@media(max-width:1050px) and (min-width:701px){
  .province-info-bar{width:min(790px,calc(100% - 145px));bottom:78px}
  .intel-tile{width:55px;min-width:55px}
  .province-info-data{gap:8px;padding:8px}
}
@media (max-width:700px), (pointer:coarse) and (max-width:920px){
  .province-info-bar{left:7px;right:7px;transform:none;width:calc(100% - 14px);bottom:calc(79px + env(safe-area-inset-bottom,0px));max-height:172px;min-height:0;overflow:hidden;border-radius:5px}
  .province-info-head{min-height:29px;padding:2px 7px;gap:5px}
  .province-info-head strong{font-size:11px;letter-spacing:.08em}
  .province-info-head span{font-size:8px;max-width:72px}
  .intel-nation-flag{width:29px;height:19px;flex:0 0 29px}
  .province-info-data{overflow-x:auto;overflow-y:hidden;justify-content:flex-start;padding:7px 7px 9px;gap:9px;max-height:132px;scrollbar-width:thin;touch-action:pan-x}
  .intel-section-title{font-size:8px}
  .intel-tiles{gap:4px}
  .intel-tile{min-width:46px;width:46px;max-width:46px;min-height:62px;padding:3px 2px}
  .intel-tile-icon{height:22px}.intel-tile-icon svg{width:20px;height:20px}
  .intel-tile-count{font-size:12px}.intel-tile-label{font-size:7px}
  .intel-classified{min-height:63px;flex-wrap:wrap;gap:4px}
  .intel-classified small{width:100%;font-size:9px}
  .quick-command{bottom:calc(214px + env(safe-area-inset-bottom,0px))}
  .order-planner{bottom:calc(279px + env(safe-area-inset-bottom,0px))}
}
@media(max-width:375px){
  .province-info-bar{bottom:calc(78px + env(safe-area-inset-bottom,0px))}
  .quick-command{bottom:calc(212px + env(safe-area-inset-bottom,0px))}
  .order-planner{bottom:calc(277px + env(safe-area-inset-bottom,0px))}
}
'''

(client/'main.js').write_text(js)
(client/'index.html').write_text(html)
(client/'style.css').write_text(css)
print('Patched timings, seasons, province dock, troop markers, and button states')
