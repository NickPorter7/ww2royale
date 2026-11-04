import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,relation,orderMovement,changeMovement,changeDiplomacy,rankings,viewFor,build,buyUnit,commissionShip,sailFleet,capitalControlled,stationBalloon,recallBalloon,BALLOON_HOP_MS,orderMultiple,SPY_RADIUS,UNIT_COST,tick,findRoute,checkVictory,MOVE_MS,PUBLIC_MATCH_MS} from '../server/game.js';
const map=JSON.parse(readFileSync(new URL('../shared/map.json',import.meta.url)));
const codes=map.playableNations;
const make=(now=100000)=>createGame(map,now,{random:()=>.5});
const border=(a,b)=>map.provinces.find(p=>p.nation===a&&p.neighbors.some(n=>map.provinces[n-1].nation===b));
const dst=(p,n)=>map.provinces[p.neighbors.find(id=>map.provinces[id-1].nation===n)-1];
test('seventeen factions, exactly nine playable nations',()=>{
  assert.equal(Object.keys(map.nations).length,17);
  assert.equal(codes.length,9);
  assert.deepEqual(new Set(codes),new Set(['GB','ES','FR','DE','SU','RO','HU','IT','PT']));
  for(const c of Object.keys(map.nations))assert.equal(map.provinces.filter(p=>p.nation===c).length,codes.includes(c)?10:3);
  assert.equal(map.provinces.length,114);
});
test('all provinces contiguous to something and IDs sequential',()=>{
  for(let i=0;i<map.provinces.length;i++){
    const p=map.provinces[i];assert.equal(p.id,i+1);
    assert(p.area>100);assert(p.paths.length>0);assert(p.neighbors.length>0);
    for(const j of p.neighbors)assert(map.provinces[j-1].neighbors.includes(p.id));
  }
});
test('banks pay income but troops never auto-generate',()=>{
  const g=make(),p=map.provinces.find(p=>p.nation==='FR');
  const cash=g.money.FR,units=g.provinces[p.id-1].units.infantry;
  tick(g,145000);
  assert(g.money.FR>cash);assert.equal(g.provinces[p.id-1].units.infantry,units);
  assert.equal(g.provinces[p.id-1].buildings.barracks,1);
  assert.throws(()=>build(g,'FR',p.id,'barracks'),/Maximum/);
});
test('building levels unlock paid purchases and bank stops at level 3',()=>{
  const g=make(),id=map.provinces.find(p=>p.nation==='FR').id;
  g.money.FR=3000;
  assert.throws(()=>buyUnit(g,'FR',id,'tank',1),/workshop/);
  assert.throws(()=>buyUnit(g,'FR',id,'bomber',1),/airport/);
  const first=g.provinces[id-1].units.infantry;
  const money=g.money.FR;
  buyUnit(g,'FR',id,'infantry',3);
  assert.equal(g.provinces[id-1].units.infantry,first+3);
  assert.equal(g.money.FR,money-3*UNIT_COST.infantry);
  build(g,'FR',id,'workshop');buyUnit(g,'FR',id,'tank',2);
  assert.equal(g.provinces[id-1].units.tank,2);
  build(g,'FR',id,'airport');assert.throws(()=>buyUnit(g,'FR',id,'bomber',1),/level 2/);
  buyUnit(g,'FR',id,'balloon',1);
  build(g,'FR',id,'airport');buyUnit(g,'FR',id,'bomber',1);
  assert.equal(g.provinces[id-1].units.bomber,1);
  build(g,'FR',id,'bank');build(g,'FR',id,'bank');
  assert.equal(g.provinces[id-1].buildings.bank,3);
  assert.throws(()=>build(g,'FR',id,'bank'),/Maximum/);
});
test('1.23 spy balloons travel over time, reveal only one border, and never leak hostile intel',()=>{
  const now=100000,g=make(now);g.money.FR=10000;
  const home=map.provinces.find(p=>p.nation==='FR').id;
  const foreign=map.provinces.find(p=>p.nation==='SU'&&!p.neighbors.some(n=>map.provinces[n-1].nation==='FR')).id;
  build(g,'FR',home,'airport');
  buyUnit(g,'FR',home,'balloon',1);
  assert.equal(g.spyBalloons.length,1);
  const spy=g.spyBalloons[0];
  const order=stationBalloon(g,'FR',spy.id,foreign,now+100);
  assert.equal(SPY_RADIUS,1);
  assert.equal(BALLOON_HOP_MS,8500);
  assert(order.movement?.arrivalAt>now+100);
  assert.equal(spy.province,home,'balloon must not teleport on dispatch');
  assert.equal(viewFor(g,'FR',now+100).provinces[foreign-1].visible,false,'cannot pre-scout destination');
  assert.equal(viewFor(g,'ES',now+100).spyBalloons.length,0);
  assert.throws(()=>stationBalloon(g,'ES',spy.id,home,now+150),/Invalid/);
  const oldMovement=structuredClone(spy.movement);
  assert.throws(()=>stationBalloon(g,'FR',spy.id,9999,now+150),/Invalid/);
  assert.deepEqual(spy.movement,oldMovement,'invalid command must not change route');
  const firstCross=now+100+BALLOON_HOP_MS;
  tick(g,firstCross);
  assert.equal(spy.province,order.movement.path[1],'move to next province on first hop');
  const arrival=order.movement.arrivalAt;
  tick(g,arrival);
  assert.equal(spy.province,foreign);
  assert.equal(spy.movement,null);
  assert.equal(viewFor(g,'FR',arrival).provinces[foreign-1].visible,true);
  for(const adjacent of map.provinces[foreign-1].neighbors)
    assert.equal(viewFor(g,'FR',arrival).provinces[adjacent-1].visible,true);
  const distant=map.provinces.find(p=>p.nation==='SU'&&p.id!==foreign&&
    !map.provinces[foreign-1].neighbors.includes(p.id)&&
    !p.neighbors.some(id=>g.provinces[id-1].owner==='FR'));
  if(distant)assert.equal(viewFor(g,'FR',arrival).provinces[distant.id-1].visible,false);
  assert.equal(viewFor(g,'ES',arrival).spyBalloons.length,0);
});
test('1.23 spy balloon retreat has a timed return and can redirect safely',()=>{
  const now=100000,g=make(now);g.money.FR=10000;
  const home=map.provinces.find(p=>p.nation==='FR').id;
  const far=map.provinces.find(p=>p.nation==='SU').id;
  build(g,'FR',home,'airport');buyUnit(g,'FR',home,'balloon',1);
  const spy=g.spyBalloons[0];stationBalloon(g,'FR',spy.id,far,now);
  const firstHop=spy.movement.path[1];
  tick(g,now+BALLOON_HOP_MS);
  assert.equal(spy.province,firstHop);
  const initialOrigin=spy.movement.origin;
  recallBalloon(g,'FR',spy.id,now+BALLOON_HOP_MS+250);
  assert.equal(spy.movement.returning,true);
  assert.equal(spy.movement.to,initialOrigin);
  assert(spy.movement.arrivalAt>now+BALLOON_HOP_MS+250);
  const arriving=spy.movement.arrivalAt;
  tick(g,arriving);
  assert.equal(spy.province,home);
  assert.equal(spy.movement,null);
  stationBalloon(g,'FR',spy.id,far,arriving+1000);
  const target=map.provinces.find(p=>p.nation==='GB').id;
  const redirected=stationBalloon(g,'FR',spy.id,target,arriving+1250);
  assert.equal(redirected.movement.to,target);
});
test('server validates troop purchases and balloon purchase limits',()=>{
  const g=make(),id=map.provinces.find(p=>p.nation==='FR').id;
  assert.throws(()=>buyUnit(g,'FR',id,'infantry',500),/funds/);
  assert.throws(()=>buyUnit(g,'FR',id,'infantry',1.3),/Invalid/);
  assert.throws(()=>buyUnit(g,'FR',id,'bomber',1),/airport/);
  assert.throws(()=>buyUnit(g,'ES',id,'infantry',1),/own province/);
  g.money.FR=10000;build(g,'FR',id,'airport');
  assert.throws(()=>buyUnit(g,'FR',id,'balloon',6),/Maximum/);
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
test('1.23 60-minute match calendar runs exactly from 1939-10-06 to 1945-09-02',()=>{
  const g=make(100000),base=100000;
  const day=(ms)=>viewFor(g,'FR',base+ms).campaignDay;
  const date=(ms)=>new Date(Date.UTC(1939,9,6)+day(ms)*86400000).toISOString().slice(0,10);
  assert.equal(map.secondsPerMatch,3600);
  assert.equal(map.endDate,'1945-09-02');
  assert.equal(day(0),0);
  assert.equal(day(1000),0);
  assert.equal(day(1669),1);
  assert.equal(date(0),'1939-10-06');
  assert.equal(date(900000),'1941-03-28');
  assert.equal(date(1800000),'1942-09-19');
  assert.equal(date(3599999),'1945-09-01');
  assert.equal(date(3600000),'1945-09-02');
  assert.equal(date(4600000),'1945-09-02','date should not drift after time limit');
});

test('1.21 balanced military travel speeds with tanks slowest',()=>{
 assert.deepEqual(MOVE_MS,{infantry:15000,tank:20000,bomber:8500});
 for(const [type,expected] of Object.entries(MOVE_MS)){
  const p=map.provinces.find(p=>p.nation==='FR'&&p.neighbors.some(n=>map.provinces[n-1].nation==='FR'));
  const to=dst(p,'FR'),g=make();g.provinces[p.id-1].units={infantry:10,tank:3,bomber:3};
  const o=orderMovement(g,'FR',{from:p.id,to:to.id,units:{[type]:1},kind:'move'},100100);
  assert.equal(o.arrivalAt-o.startedAt,expected,`${type} hop timing`);
 }
});
test('114 provinces and victory thresholds remain functional',()=>{
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
 assert(itNames.includes('Rome')&&itNames.includes('Milan')&&itNames.includes('Palermo'));
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

test('every nation has its 1939 capital and unique city-based province names',()=>{
  for(const [code,n] of Object.entries(map.nations)){
    const own=map.provinces.filter(p=>p.nation===code);
    assert(own.some(p=>p.name===n.capital),`${code} missing capital ${n.capital}`);
    assert.equal(new Set(own.map(p=>p.name)).size,own.length);
    assert(own.every(p=>!/\d\d$/.test(p.name)));
  }
});

test('1.20 multiple sources: atomic validation and separate/together arrivals',()=>{
  const targets=map.provinces.filter(p=>p.nation==='FR');
  const sourceA=targets.find(p=>targets.filter(q=>q.id!==p.id && findRoute(make(),'FR',q.id,p.id)).length>=2);
  const sources=targets.filter(q=>q.id!==sourceA.id&&findRoute(make(),'FR',q.id,sourceA.id)).slice(0,2);
  assert.equal(sources.length,2);
  const cmd=(src,type)=>({from:src.id,to:sourceA.id,kind:'move',units:{[type]:2}});
  const commands=[cmd(sources[0],'infantry'),cmd(sources[1],'tank')];
  const g1=make();g1.provinces[sources[1].id-1].units.tank=4;
  const separate=orderMultiple(g1,'FR',{orders:commands,arrivalMode:'separate'},100100);
  assert.equal(separate.length,2);assert.equal(separate[0].startedAt,100100);assert.equal(separate[1].startedAt,100100);
  const g2=make();g2.provinces[sources[1].id-1].units.tank=4;
  const together=orderMultiple(g2,'FR',{orders:commands,arrivalMode:'together'},100100);
  assert.equal(together.length,2);
  assert.equal(together[0].arrivalAt,together[1].arrivalAt);
  assert(together.some(o=>o.startedAt>100100),'shorter journey should wait at departure point');
  assert.equal(g2.movements.length,2);
  const moneyBefore=g2.money.FR;
  const troopsBefore=g2.provinces[sources[0].id-1].units.infantry;
  assert.throws(()=>orderMultiple(g2,'FR',{orders:[commands[0],{...commands[1],units:{tank:9999}}],arrivalMode:'together'},100200),/Not enough troops/);
  assert.equal(g2.money.FR,moneyBefore);
  assert.equal(g2.provinces[sources[0].id-1].units.infantry,troopsBefore);
  assert.equal(g2.movements.length,2);
  assert.throws(()=>orderMultiple(g2,'FR',{orders:[commands[0],commands[0]],arrivalMode:'separate'},100200),/once/);
});

test('1.20 redirect and retreat recalculate timed travel, never teleport',()=>{
  const g=make(),origin=map.provinces.find(p=>p.nation==='FR'&&p.neighbors.some(n=>map.provinces[n-1].nation==='FR'));
  const other=map.provinces[origin.neighbors.find(n=>map.provinces[n-1].nation==='FR')-1];
  const first=orderMovement(g,'FR',{from:origin.id,to:other.id,kind:'move',units:{infantry:3}},100100);
  const midway=first.startedAt+5000;
  const changed=changeMovement(g,'FR',{id:first.id,action:'recall'},midway);
  assert.equal(changed.recalling,true);
  assert(changed.arrivalAt>midway);
  assert(g.movements.includes(changed));
  assert.equal(changed.to,origin.id);
});

test('1.21 every nation begins with a capital, and a replacement relocates it',()=>{
 const g=make();
 for(const n of map.playableNations)assert(capitalControlled(g,n),`${n} starts with capital`);
 const current=g.capitals.FR;
 const replacement=map.provinces.find(p=>p.nation==='FR'&&p.id!==current).id;
 g.money.FR=1000;
 build(g,'FR',replacement,'capital');
 assert.equal(g.capitals.FR,replacement);
 assert.equal(g.provinces[current-1].buildings.capital,0);
 assert.equal(g.provinces[replacement-1].buildings.capital,1);
 assert.throws(()=>build(g,'FR',replacement,'capital'),/already your capital/);
 // Capture the new capital; France loses the combat/health bonus.
 g.provinces[replacement-1].owner='DE';
 assert.equal(capitalControlled(g,'FR'),false);
 const next=map.provinces.find(p=>p.nation==='FR'&&p.id!==current&&p.id!==replacement).id;
 build(g,'FR',next,'capital');assert(capitalControlled(g,'FR'));
});

test('1.21 port access and ship commissioning require own coast',()=>{
 const g=make(),coast=map.provinces.find(p=>p.nation==='GB'&&p.coastal),inland=map.provinces.find(p=>p.nation==='FR'&&!p.coastal);
 assert(coast&&inland);
 g.money.GB=4000;
 assert.throws(()=>commissionShip(g,'GB',coast.id,'destroyer',1),/port/);
 build(g,'GB',coast.id,'port');
 const start=g.money.GB;
 commissionShip(g,'GB',coast.id,'destroyer',2);
 assert.equal(g.provinces[coast.id-1].fleet.destroyer,2);
 assert.equal(g.money.GB,Math.round((start-176*.92)*100)/100);
 assert.throws(()=>commissionShip(g,'GB',coast.id,'battleship',50),/Invalid/);
 if(inland){g.money.FR=500;assert.throws(()=>build(g,'FR',inland.id,'port'),/coastal/);}
});

test('1.21 naval order validates war before mutating ships, resolves coastal battle and never conquers land',()=>{
 const g=make(100000),source=map.provinces.find(p=>p.nation==='GB'&&p.coastal),target=map.provinces.find(p=>p.nation==='FR'&&p.coastal);
 g.money.GB=8000;build(g,'GB',source.id,'port');commissionShip(g,'GB',source.id,'battleship',3);
 assert.throws(()=>sailFleet(g,'GB',{from:source.id,to:target.id,ships:{battleship:2}},100100),/Confirm/);
 assert.equal(relation(g,'GB','FR'),'neutral');
 assert.equal(g.provinces[source.id-1].fleet.battleship,3);
 const troopBefore=g.provinces[target.id-1].units.infantry;
 const order=sailFleet(g,'GB',{from:source.id,to:target.id,ships:{battleship:2},autoDeclareWar:true},100100);
 assert.equal(relation(g,'GB','FR'),'war');assert(order.naval);
 tick(g,order.arrivalAt);
 assert.equal(g.provinces[target.id-1].owner,'FR','naval bombardment cannot conquer provinces');
 assert(g.provinces[target.id-1].units.infantry<=troopBefore);
 assert(g.navalMovements.some(o=>o.returning));
});

test('1.23 public time cap ends with ranking victory at 60 minutes',()=>{
 const g=make(100000);g.timeLimitMs=PUBLIC_MATCH_MS;
 assert.equal(PUBLIC_MATCH_MS,60*60000);
 assert.equal(g.winner,null);tick(g,100000+PUBLIC_MATCH_MS);
 assert.equal(g.winner?.mode,'time-limit');
 assert(map.playableNations.includes(g.winner.nations[0]));
});

test('1.21 lost capital lowers actual battlefield damage and health, not only an icon',()=>{
  const src=border('FR','DE'),dst=map.provinces[src.neighbors.find(i=>map.provinces[i-1].nation==='DE')-1];
  const healthy=make(),weakened=make();
  for(const g of [healthy,weakened]){
    g.provinces[src.id-1].units.infantry=40;
    g.provinces[src.id-1].healthByType.infantry=40*24;
    g.provinces[dst.id-1].units.infantry=100;
    g.provinces[dst.id-1].healthByType.infantry=100*24;
  }
  const old=weakened.capitals.FR;
  assert.notEqual(old,src.id,'test requires capital in a different French province');
  weakened.provinces[old-1].owner='SU';
  assert(!capitalControlled(weakened,'FR'));
  const command={from:src.id,to:dst.id,units:{infantry:40},kind:'attack',autoDeclareWar:true};
  const first=orderMovement(healthy,'FR',command,100100);
  const second=orderMovement(weakened,'FR',command,100100);
  tick(healthy,first.arrivalAt);tick(weakened,second.arrivalAt);
  assert(weakened.provinces[dst.id-1].healthByType.infantry>healthy.provinces[dst.id-1].healthByType.infantry,
   'attacker without capital must inflict less damage');
  const enemy=weakened.provinces[dst.id-1];
  assert(enemy.healthByType.infantry<enemy.units.infantry*24,'partial HP must survive the battle');
});
