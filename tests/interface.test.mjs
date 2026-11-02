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
  const handler=js.slice(js.indexOf('function clickWorld('),js.indexOf('let pointer=null;'));
  assert.match(handler,/draftTarget=id;[\s\S]*?updateSidebar\(\);queueRender\(\);[\s\S]*?return;/);
  assert.doesNotMatch(handler,/dispatch\(/);
  assert.match(js,/\$\('confirmOrderBtn'\)\.onclick=\(\)=>\{[\s\S]*?dispatch\(actionMode\)/);
  assert.match(js,/\$\('cancelOrderBtn'\)\.onclick=cancelDraftOrder/);
});
test('map toolbar swaps three original actions for Confirm / Cancel',()=>{
  assert.match(js,/for\(const id of \['quickMove','quickAttack','quickBuild'\]\)\$\(id\)\.hidden=confirming/);
  assert.match(js,/for\(const id of \['confirmOrderBtn','cancelOrderBtn'\]\)\$\(id\)\.hidden=!confirming/);
});
