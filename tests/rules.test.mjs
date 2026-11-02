import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,relation,orderMovement,changeDiplomacy,rankings,viewFor,build,tick,findRoute,checkVictory,MOVE_MS} from '../server/game.js';
const map=JSON.parse(readFileSync(new URL('../shared/map.json',import.meta.url)));
const codes=map.playableNations;
const make=(now=100000)=>createGame(map,now,{random:()=>.5});
const border=(a,b)=>map.provinces.find(p=>p.nation===a&&p.neighbors.some(n=>map.provinces[n-1].nation===b));
const dst=(p,n)=>map.provinces[p.neighbors.find(id=>map.provinces[id-1].nation===n)-1];
test('seventeen factions, exactly eight playable nations',()=>{
  assert.equal(Object.keys(map.nations).length,17);
  assert.equal(codes.length,8);
  assert.deepEqual(new Set(codes),new Set(['GB','ES','FR','DE','SU','RO','HU','IT']));
  for(const c of Object.keys(map.nations))assert.equal(map.provinces.filter(p=>p.nation===c).length,codes.includes(c)?10:3);
  assert.equal(map.provinces.length,107);
});
test('all provinces contiguous to something and IDs sequential',()=>{
  for(let i=0;i<map.provinces.length;i++){
    const p=map.provinces[i];assert.equal(p.id,i+1);
    assert(p.area>100);assert(p.paths.length>0);assert(p.neighbors.length>0);
    for(const j of p.neighbors)assert(map.provinces[j-1].neighbors.includes(p.id));
  }
});
test('bank money and production remain intact',()=>{
  const g=make();const before=g.money.FR;
  tick(g,101000);assert(g.money.FR>before);assert.equal(g.provinces[0].buildings.barracks,1);
  const own=map.provinces.find(p=>p.nation==='FR');build(g,'FR',own.id,'barracks',101000);assert.equal(g.provinces[own.id-1].buildings.barracks,2);
});
test('neutral attack declares war only for a valid dispatch',()=>{
  const p=border('FR','DE'),target=dst(p,'DE'),g=make();assert(p&&target);
  assert.throws(()=>orderMovement(g,'FR',{from:p.id,to:target.id,units:{infantry:3},kind:'attack'},100100));
  assert.equal(relation(g,'FR','DE'),'neutral');
  const o=orderMovement(g,'FR',{from:p.id,to:target.id,units:{infantry:3},kind:'attack',autoDeclareWar:true},100100);
  assert(o.arrivalAt>o.startedAt);assert.equal(relation(g,'FR','DE'),'war');
});
test('army speed set by slowest unit',()=>{
  const p=map.provinces.find(p=>p.nation==='FR'&&p.neighbors.some(n=>map.provinces[n-1].nation==='FR'));
  const to=dst(p,'FR'),g=make();g.provinces[p.id-1].units={infantry:10,tank:2,bomber:1};
  const o=orderMovement(g,'FR',{from:p.id,to:to.id,units:{infantry:3,tank:2,bomber:1},kind:'move'},100100);
  assert.equal(o.arrivalAt-o.startedAt,MOVE_MS.tank);
});
test('alliance, peace, and break remain functional',()=>{
 const g=make();changeDiplomacy(g,'FR','GB','requestAlly');changeDiplomacy(g,'GB','FR','acceptAlly');assert.equal(relation(g,'FR','GB'),'ally');
 changeDiplomacy(g,'FR','GB','breakAlliance');assert.equal(relation(g,'FR','GB'),'neutral');
});
test('date tracker 6 October 1939 increments every 10 seconds',()=>{
 const g=make();assert.equal(viewFor(g,'FR',100000).campaignDay,0);
 assert.equal(viewFor(g,'FR',109999).campaignDay,0);
 assert.equal(viewFor(g,'FR',110000).campaignDay,1);
 assert.equal(viewFor(g,'FR',200000).campaignDay,10);
});
test('107 provinces and victory thresholds remain functional',()=>{
 const g=make();assert.equal(g.winner,null);
 for(let i=0;i<Math.ceil(map.provinces.length*.51);i++)g.provinces[i].owner='FR';
 assert.equal(checkVictory(g)?.nations[0],'FR');
});
test('country comparison ranking includes all 17 nations',()=>{
 const g=make(),r=rankings(g);assert.equal(r.length,17);assert(r.every(x=>x.place>=1&&x.place<=17));
});

test('1939 nonplayable neighbours and Fascist Italy display name',()=>{
 for(const code of ['SK','YU','BG']){
   assert.equal(map.nations[code].playable,false);
   assert.equal(map.provinces.filter(p=>p.nation===code).length,3);
 }
 assert.equal(map.nations.IT.name,'Fascist Italy');
 const itNames=map.provinces.filter(p=>p.nation==='IT').map(p=>p.name);
 assert.equal(new Set(itNames).size,10);
 assert(itNames.includes('Lombardy')&&itNames.includes('Lazio')&&itNames.includes('Sicily-Sardinia'));
 const adjacent=(a,b)=>map.provinces.some(p=>p.nation===a&&p.neighbors.some(id=>map.provinces[id-1].nation===b));
 for(const [a,b] of [['CH','FR'],['CH','DE'],['CH','IT'],['SK','HU'],['SK','DE'],['YU','IT'],['YU','HU'],['BG','YU'],['BG','RO']])assert(adjacent(a,b),`${a} must border ${b}`);
});
test('Swiss borders are nonrectangular and provinces remain hittable',()=>{
 const swiss=map.provinces.filter(p=>p.nation==='CH');
 const vertices=swiss.flatMap(p=>p.paths.flat());
 const uniqueX=new Set(vertices.map(p=>p[0])),uniqueY=new Set(vertices.map(p=>p[1]));
 assert(uniqueX.size>=30&&uniqueY.size>=20,'Swiss boundaries should be organic rather than square');
 for(const p of swiss)assert(p.paths.some(loop=>loop.length>=5));
});
