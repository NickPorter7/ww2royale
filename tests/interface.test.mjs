import * as vmModule from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../client/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../client/style.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../client/main.js',import.meta.url),'utf8');
test('three icon-led map buttons, without extra quick-command text/card',()=>{
  const markup=html.match(/<div id="quickCommand"[\s\S]*?<\/div>/)?.[0]||'';
  for(const id of ['quickAttack','quickMove','quickBuild'])assert.match(markup,new RegExp(`id="${id}"`));
  assert.equal((markup.match(/<button /g)||[]).length,5);
  for(const id of ['confirmOrderBtn','cancelOrderBtn'])assert.match(markup,new RegExp(`id="${id}"[^>]*hidden`));
  assert.doesNotMatch(markup,/quick-command-label|quickProvinceName/);
  assert.match(css,/\.quick-command\s*\{[^}]*background:transparent/s);
});
test('action color and dimensions are declared consistently',()=>{
  assert.match(css,/\.quick-command \.quick-action\s*\{[^}]*width:124px;[^}]*height:58px/s);
  for(const name of ['attack','move','build'])assert.match(css,new RegExp(`quick-action-${name}`));
});
test('Build action opens independent buildings panel',()=>{
  assert.match(js,/\$\('quickBuild'\)\.onclick[\s\S]*?setPanel\('buildings'\)/);
  assert.match(html,/id="panel-buildings"/);
});
test('each building uses an SVG icon and server validated construction order',()=>{
  for(const name of ['ico-barracks','ico-autoshop','ico-airport','ico-bank','ico-fort'])assert.match(html,new RegExp(`id="${name}"`));
  assert.match(js,/function iconSvg\(name\)/);
  assert.match(js,/socket\.emit\('build',\{province,kind:bld\.kind\}\)/);
});

test('army composer exposes three ranges defaulting to all available troops',()=>{
  for(const unit of ['Infantry','Tank','Bomber']){
    assert.match(html,new RegExp(`id="army${unit}" type="range"`));
    assert.match(html,new RegExp(`id="army${unit}Value"`));
  }
  assert.match(js,/el\.max=String\(available\);[\s\S]*?if\(lastCountSource!==selected\)el\.value=String\(available\)/);
  assert.match(html,/id="orderPlanner"[^>]*hidden/);
});
test('destination selection stages an order instead of dispatching it',()=>{
  const handler=js.slice(js.indexOf('function clickWorld('),js.indexOf('// Touch map controls:'));
  assert.match(handler,/draftTarget=id;[\s\S]*?updateSidebar\(\);queueRender\(\);[\s\S]*?return;/);
  assert.doesNotMatch(handler,/dispatch\(/);
  assert.match(js,/\$\('confirmOrderBtn'\)\.onclick=\(\)=>\{[\s\S]*?dispatch\(actionMode\)/);
  assert.match(js,/\$\('cancelOrderBtn'\)\.onclick=cancelDraftOrder/);
});
test('map toolbar swaps three original actions for Confirm / Cancel',()=>{
  assert.match(js,/for\(const id of \['quickMove','quickAttack','quickBuild'\]\)\$\(id\)\.hidden=confirming/);
  assert.match(js,/for\(const id of \['confirmOrderBtn','cancelOrderBtn'\]\)\$\(id\)\.hidden=!confirming/);
});

test('1.12 historical flag icons and three-rank moving marker priority',()=>{
  assert.match(js,/selectedArmyIcon\(units\).*bomber>0\?'bomber':units\?\.tank>0\?'tank':'infantry'/);
  assert.match(js,/drawUnitIcon\(x,y,selectedArmyIcon\(order\.units/);
  assert.match(js,/b\.prepend\(nationFlag\(id\)\)/);
  assert.match(html,/id="panelIdentity"/);
});
test('1.12 neutral attack confirmation and no automatic army panel on map tap',()=>{
  assert.match(js,/showAttackConfirmation\(\{event:'move',data:command\}/);
  assert.match(js,/const actualKind=rel==='neutral'\|\|rel==='war'\?'attack':'move'/);
  const handler=js.slice(js.indexOf('function clickWorld('),js.indexOf('// Touch map controls:'));
  assert.doesNotMatch(handler,/setPanel\('army'\)/);
});
test('1.12 mobile navigation uses docked controls and supports pinch',()=>{
  assert.match(css,/\.tool-rail\{position:absolute;left:0;right:0;bottom:0;top:auto/);
  assert.match(js,/const activeTouches=new Map\(\)/);
  assert.match(js,/camera\.zoom=Math\.max\(\.75,Math\.min\(6,pinch\.zoom\*dist\/pinch\.dist\)\)/);
});

test('1.13 province information, season and elapsed HUD plus toast styles exist',()=>{
  for(const id of ['provinceInfoBar','intelDetails','elapsedClock','seasonBadge','weatherLayer','toastStack'])assert.match(html,new RegExp(`id="${id}"`));
  for(const season of ['winter','spring','summer','autumn'])assert.match(js,new RegExp(`season-`));
  assert.match(js,/renderProvinceIntel/);
  assert.match(js,/deployingBalloonId/);
  assert.match(css,/toastFloat 3s/);
});


test('1.15 detailed connected borders use shared ID raster without rounding',()=>{
 assert.doesNotMatch(js,/function smoothLoop\(/);
 assert.match(js,/if\(borderImage\)ctx\.drawImage\(borderImage,0,0\)/);
 assert.match(js,/function pathFor\(province\)/);
 assert.match(js,/drawOutline\(hovered/);
});
test('1.15 visible province markers never reveal redacted troop numbers',()=>{
 assert.match(js,/function drawTroops\(\)/);
 assert.match(js,/if\(!state\?\.visible\|\|!state\.units\)continue/);
 assert.match(js,/drawSpyBalloons\(\);drawTroops\(\)/);
 assert.match(js,/function renderProvinceIntel\(\)/);
 assert.match(html,/id="intelNationFlag"/);
 assert.match(css,/\.intel-tile\{/);
});
test('1.15 progressive seasons and date speed are represented',()=>{
 assert.match(js,/function seasonalDepth\(date\)/);
 assert.match(js,/setSeason\(season,seasonalDepth\(date\)\)/);
 assert.match(js,/ctx\.globalAlpha=\.23\+\.77\*seasonIntensity/);
 assert.match(html,/1 in-game year every 20 minutes/);
});
test('1.15 buttons visibly darken on hover and depress on click',()=>{
 assert.match(css,/brightness\(\.88\)/);
 assert.match(css,/translateY\(2px\) scale\(\.975\)/);
});

test('1.16 construction rows have Build, Upgrade and Max states, with compact recruitment',()=>{
 assert.match(js,/const buttonLabel=capped\?'Max':count===0\?'Build':'Upgrade'/);
 assert.match(js,/building-row-info/);
 assert.match(js,/building-row-actions/);
 assert.match(js,/const spyPanel=elem\('details','',\s*'spy-section compact-spies'\)/);
 assert.match(css,/\.compact-build-catalogue\{/);
 assert.match(css,/\.building-row-buy\{/);
 assert.match(css,/\.compact-recruit\{/);
});


test('1.19.1 home-screen, corner branding, and favicon metadata use supplied emblem',()=>{
  assert.match(html,/class="lobby-brand-logo"[^>]*src="\/assets\/branding\/logo-640\.png"/);
  assert.match(html,/class="brand-seal brand-logo"[^>]*src="\/assets\/branding\/logo-128\.png"/);
  assert.match(html,/class="header-corner-logo"[^>]*src="\/assets\/branding\/logo-128\.png"/);
  assert.match(html,/rel="icon" type="image\/x-icon" href="\/favicon\.ico\?v=1191"/);
  assert.match(html,/rel="apple-touch-icon" href="\/apple-touch-icon\.png\?v=1191"/);
  assert.match(css,/\.lobby-brand-logo\s*\{/);
  assert.match(css,/\.header-corner-logo\s*\{/);
});


test('1.19.2 shared province borders render without undefined canvas references',()=>{
  // Regression: referencing provinceBorderCanvas, which was never initialized,
  // throws from draw() and prevents both the map and troop counts from appearing.
  assert.doesNotMatch(js,/\bprovinceBorderCanvas\b/);
  assert.match(js,/if\(borderImage\)ctx\.drawImage\(borderImage,0,0\)/);
  assert.match(js,/drawSpyBalloons\(\);drawTroops\(\)/);
});

test('1.19.3 nation picker displays nine real country names even before the label cache is populated',()=>{
  const vm=requireVm();
  const map=JSON.parse(readFileSync(new URL('../shared/map.json',import.meta.url),'utf8'));
  const markup=js.match(/function renderNationChoices\(\)\{[\s\S]*?\n\}\nfunction renderDiplomacy/);
  assert(markup,'nation-choice renderer must be extractable');
  const buttons=[];
  const context={
    map,game:{occupied:[]},assigned:null,isPublicMatch:false,lastChoiceKey:'',nationNames:{},
    $:()=>({replaceChildren(){buttons.length=0;},append(button){buttons.push(button);}}),
    createButton:(text)=>({textContent:text,disabled:false,prepend(){}}),
    socket:{emit(){}},nationFlag:()=>({})
  };
  vm.createContext(context);
  vm.runInContext(markup[0].replace(/\nfunction renderDiplomacy$/,''),context);
  vm.runInContext('renderNationChoices()',context);
  assert.equal(buttons.length,10,'nine nations plus random option');
  for(const code of map.playableNations){
    assert(buttons.some(b=>b.textContent===map.nations[code].name),`${code} must show actual name`);
  }
  assert(buttons.every(b=>!b.textContent.includes('undefined')));
  map.nations.PT.name='Portugal Updated';
  vm.runInContext('renderNationChoices()',context);
  assert(buttons.some(b=>b.textContent==='Portugal Updated'),'name changes must invalidate the cache');
});

function requireVm(){return vmModule;}
