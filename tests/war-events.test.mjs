import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,viewFor,changeDiplomacy,build,buyUnit,commissionShip,orderMultiple,orderMovement,tick,relation,MOVE_MS,NATION_TRAITS} from '../server/game.js';
import {publishWarEvent,recordBattle,MAX_WAR_EVENTS,MAX_BATTLE_REPORTS} from '../server/war-events.js';
const map=JSON.parse(readFileSync(new URL('../shared/map.json',import.meta.url)));
const make=()=>createGame(map,100000,{random:()=>0.5});
const owned=(code)=>map.provinces.filter(p=>p.nation===code);
const adjacent=(a,b)=>map.provinces.find(p=>p.nation===a&&p.neighbors.some(id=>map.provinces[id-1].nation===b));
test('nine playable nations have distinct, bounded bonuses',()=>{
  assert.deepEqual(Object.keys(NATION_TRAITS).sort(),[...map.playableNations].sort());
  for(const v of Object.values(NATION_TRAITS)){
    assert(v.value>=0.9&&v.value<=1.1);
    assert(v.name.length>4);assert(v.description.length>5);
  }
});
test('nation discounts are applied by the server, not just the UI',()=>{
  const g=make();g.money.SU=1000;
  const pid=owned('SU')[0].id,old=g.money.SU;
  buyUnit(g,'SU',pid,'infantry',10);
  assert.equal(g.money.SU,old-10*12*.92);
  const british=owned('GB').find(p=>p.coastal);g.money.GB=2000;
  build(g,'GB',british.id,'port');const before=g.money.GB;
  commissionShip(g,'GB',british.id,'destroyer',2);
  assert.equal(g.money.GB,Math.round((before-2*88*.92)*100)/100);
});
test('Germany tank-led armies receive movement bonus',()=>{
  const p=owned('DE').find(p=>p.neighbors.some(id=>map.provinces[id-1].nation==='DE'));
  const to=p.neighbors.find(id=>map.provinces[id-1].nation==='DE');
  const g=make();g.provinces[p.id-1].units.tank=2;
  const order=orderMovement(g,'DE',{from:p.id,to,units:{tank:1},kind:'move'},100000);
  assert.equal(order.hopMs,Math.round(MOVE_MS.tank*.94));
});
test('public newspaper never publishes exact unit counts',()=>{
  const g=make();const p=owned('FR')[0].id;
  recordBattle(g,{attacker:'FR',defender:'DE',province:p,attackerBefore:{infantry:90},attackerAfter:{infantry:40},
    defenderBefore:{tank:70},defenderAfter:{tank:1},won:true});
  const france=viewFor(g,'FR'),spain=viewFor(g,'ES');
  assert.equal(france.battleReports.length,1);
  assert.equal(spain.battleReports.length,0);
  assert.equal(spain.warNews.length,1);
  assert(!('attackerBefore' in spain.warNews[0]));
  assert(!('defenderAfter' in spain.warNews[0]));
  assert(!/\b90 infantry\b|\b70 tanks\b/i.test(spain.warNews[0].summary));
});
test('war dispatches and casualty reports use bounded memory',()=>{
  const g=make();
  for(let i=0;i<MAX_WAR_EVENTS+50;i++)publishWarEvent(g,'landBattle',{actor:'FR',target:'DE',province:owned('FR')[0].id});
  assert.equal(g.warEvents.length,MAX_WAR_EVENTS);
  for(let i=0;i<MAX_BATTLE_REPORTS+20;i++)recordBattle(g,{attacker:'FR',defender:'DE',province:owned('FR')[0].id,won:false});
  assert.equal(g.battleReports.length,MAX_BATTLE_REPORTS);
  assert.equal(g.warEvents.length,MAX_WAR_EVENTS);
  assert(g.warEvents[0].id>g.warEvents.at(-1).id);
});
test('diplomacy and capital relocations produce historical news, invalid commands do not',()=>{
  const g=make();
  changeDiplomacy(g,'FR','DE','declareWar');
  assert.equal(g.warEvents.at(-1).kind,'declareWar');
  const p=owned('FR').find(p=>p.id!==g.capitals.FR);
  g.money.FR=2000;build(g,'FR',p.id,'capital');
  assert.equal(g.warEvents[0].kind,'newCapital');
  const before=g.warEvents.length;
  assert.throws(()=>build(g,'FR',p.id,'capital'),/already your capital/);
  assert.equal(g.warEvents.length,before);
});
test('failed coordinated orders do not publish stray global news',()=>{
  const g=make();const p=adjacent('FR','DE'),d=p.neighbors.find(id=>map.provinces[id-1].nation==='DE');
  const other=owned('FR').find(x=>x.id!==p.id).id;
  const before=g.warEvents.length;
  assert.throws(()=>orderMultiple(g,'FR',{arrivalMode:'together',orders:[
    {from:p.id,to:d,units:{infantry:1},kind:'attack',autoDeclareWar:true},
    {from:other,to:d,units:{infantry:999999},kind:'attack',autoDeclareWar:true}
  ]},100100));
  assert.equal(g.warEvents.length,before);
  assert.equal(relation(g,'FR','DE'),'neutral');
});
test('completed capital capture creates battle report and capital fall headline',()=>{
  const g=make(),att=adjacent('FR','DE');
  // Force a one-hop adjacent capture of Germany's designated capital to test
  // the capital dispatch without relying on whichever cities are adjacent.
  const dst=att.neighbors.find(id=>map.provinces[id-1].nation==='DE');
  g.capitals.DE=dst;g.provinces[dst-1].buildings.capital=1;
  g.provinces[att.id-1].units.infantry=500;g.provinces[att.id-1].healthByType.infantry=500*24;
  g.provinces[dst-1].units.infantry=0;g.provinces[dst-1].healthByType.infantry=0;
  const o=orderMovement(g,'FR',{from:att.id,to:dst,units:{infantry:100},kind:'attack',autoDeclareWar:true},100100);
  tick(g,o.arrivalAt);
  assert(g.warEvents.some(e=>e.kind==='capitalFall'&&e.province===dst));
  assert(g.battleReports.some(r=>r.province===dst&&r.won));
});
test('successful captures count surviving infantry instead of falsely reporting total loss',()=>{
  const g=make(),source=adjacent('FR','DE'),dst=source.neighbors.find(id=>map.provinces[id-1].nation==='DE');
  g.provinces[source.id-1].units.infantry=100;g.provinces[source.id-1].healthByType.infantry=100*24;
  g.provinces[dst-1].units.infantry=0;g.provinces[dst-1].healthByType.infantry=0;
  const o=orderMovement(g,'FR',{from:source.id,to:dst,units:{infantry:40},kind:'attack',autoDeclareWar:true},100100);
  tick(g,o.arrivalAt);
  const r=g.battleReports.find(r=>r.province===dst);
  assert(r?.won);
  assert.equal(r.attackerAfter.infantry,40);
  assert.equal(g.provinces[dst-1].units.infantry,40);
});
test('commander statements are validated and rate limited on the server',async()=>{
 const {publishCommanderStatement}=await import('../server/war-events.js');
 const g=make(),at=1_000_000;
 assert.throws(()=>publishCommanderStatement(g,'BE','Hello Europe',at),/active commanders/);
 assert.throws(()=>publishCommanderStatement(g,'FR','Visit https://spam.site',at),/Links/);
 const published=publishCommanderStatement(g,'FR','We will defend our borders.',at);
 assert.equal(published.kind,'statement');
 assert.equal(published.summary,'We will defend our borders.');
 assert.throws(()=>publishCommanderStatement(g,'FR','We call for peace.',at+1000),/90 seconds/);
 assert.equal(g.warEvents.length,1);
 publishCommanderStatement(g,'FR','Peace negotiations continue.',at+90000);
 assert.equal(g.warEvents.length,2);
});
test('France income advantage is accurate over frequent server ticks',()=>{
 const g=make(),startF=g.money.FR,startE=g.money.ES;
 for(let i=1;i<=120;i++)tick(g,100000+i*100);
 const fr=g.money.FR-startF,es=g.money.ES-startE;
 assert(Math.abs(fr/es-1.08)<.005,`Income ratio was ${fr/es}; expected 1.08`);
});
