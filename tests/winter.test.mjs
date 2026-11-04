import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,orderMovement,orderMultiple,changeMovement,build,commissionShip,sailFleet,changeDiplomacy,MOVE_MS,campaignDayAt} from '../server/game.js';
import {campaignDateAt,winterSeverityAt,winterUnitHopMs,winterNavalDurationMs} from '../server/weather.js';
import {NAVAL_BASE_MS,NAVAL_MS_PER_PX} from '../server/naval.js';

const map=JSON.parse(readFileSync(new URL('../shared/map.json',import.meta.url)));
const epoch=100000;
const make=()=>createGame(map,epoch,{random:()=>.5});
const calendarStart=Date.parse('1939-10-06T00:00:00Z');
const calendarEnd=Date.parse('1945-09-02T00:00:00Z');
const totalDays=(calendarEnd-calendarStart)/86400000;
const dateTime=(date)=>{
  const day=(Date.parse(date+'T00:00:00Z')-calendarStart)/86400000;
  return epoch+Math.ceil((day+.5)/totalDays*3600000);
};
const internalFrance=()=>{
  const p=map.provinces.find(p=>p.nation==='FR'&&p.neighbors.some(n=>map.provinces[n-1].nation==='FR'));
  const to=p.neighbors.find(n=>map.provinces[n-1].nation==='FR');
  return [p,to];
};
function landOrder(type,date){
  const g=make(),now=dateTime(date),[p,to]=internalFrance();
  g.provinces[p.id-1].units={infantry:25,tank:4,bomber:4};
  g.provinces[p.id-1].healthByType={infantry:600,tank:380,bomber:168};
  const order=orderMovement(g,'FR',{from:p.id,to,units:{[type]:1},kind:'move'},now);
  return {g,now,order};
}
test('calendar keeps exactly the 60-minute historical date mapping',()=>{
  const g=make();
  assert.equal(campaignDayAt(g,epoch),0);
  assert.equal(campaignDateAt(g,epoch).toISOString().slice(0,10),'1939-10-06');
  assert.equal(campaignDateAt(g,epoch+3600000).toISOString().slice(0,10),'1945-09-02');
  for(const date of ['1939-12-01','1940-01-15','1940-02-29','1941-01-15','1941-03-01'])
    assert.equal(campaignDateAt(g,dateTime(date)).toISOString().slice(0,10),date);
});
test('early winter, peak winter, thaw and other seasons use the intended movement curve',()=>{
  const g=make();
  const stages=[
    {date:'1940-11-30',infantry:15000,tank:20000,severity:0},
    {date:'1940-12-01',infantry:17500,tank:25000,severity:.5},
    {date:'1941-01-15',infantry:20000,tank:30000,severity:1},
    {date:'1941-02-28',infantry:17500,tank:25000,severity:.5},
    {date:'1941-03-01',infantry:15000,tank:20000,severity:0},
    {date:'1941-07-01',infantry:15000,tank:20000,severity:0},
    {date:'1941-10-01',infantry:15000,tank:20000,severity:0},
  ];
  for(const stage of stages){
    const severity=winterSeverityAt(g,dateTime(stage.date));
    assert(Math.abs(severity-stage.severity)<.025,`${stage.date} got ${severity}`);
    const i=landOrder('infantry',stage.date).order;
    const t=landOrder('tank',stage.date).order;
    const b=landOrder('bomber',stage.date).order;
    assert(Math.abs(i.arrivalAt-i.startedAt-stage.infantry)<130,`${stage.date} infantry duration`);
    assert(Math.abs(t.arrivalAt-t.startedAt-stage.tank)<250,`${stage.date} tank duration`);
    assert.equal(b.arrivalAt-b.startedAt,8500,`${stage.date} bomber speed unchanged`);
  }
  assert.equal(MOVE_MS.infantry,15000);
  assert.equal(MOVE_MS.tank,20000);
});
test('naval travel slows through winter and returns to normal outside winter',()=>{
  const a=map.provinces.find(p=>p.nation==='GB'&&p.coastal);
  const b=map.provinces.find(p=>p.nation==='FR'&&p.coastal);
  assert(a&&b);
  const base=NAVAL_BASE_MS+Math.hypot(a.x-b.x,a.y-b.y)*NAVAL_MS_PER_PX;
  let normalDuration=0;
  for(const stage of [{date:'1940-07-01',factor:1},{date:'1940-12-01',factor:7/6},{date:'1941-01-15',factor:4/3},{date:'1941-02-28',factor:7/6}]){
    const g=make(),now=dateTime(stage.date);
    g.money.GB=10000;build(g,'GB',a.id,'port');commissionShip(g,'GB',a.id,'destroyer',2);
    changeDiplomacy(g,'GB','FR','declareWar');
    const fleet=sailFleet(g,'GB',{from:a.id,to:b.id,ships:{destroyer:1}},now);
    const actual=fleet.arrivalAt-fleet.startedAt;
    assert(Math.abs(actual-base*stage.factor)<base*.015,`${stage.date} naval slowdown ${actual}`);
    if(stage.factor===1)normalDuration=actual;
    else assert(actual>normalDuration,`${stage.date} must be slower than summer`);
  }
});
test('winter penalties do not affect spy balloon air reconnaissance',()=>{
  const g=make();
  const old=8500;
  assert.equal(winterUnitHopMs('bomber',8500,1),8500);
  assert.equal(winterUnitHopMs('bomber',8500,.5),8500);
  assert.equal(old,8500);
  assert.equal(winterNavalDurationMs(30000,0),30000);
});
test('coordinated army orders still arrive together in winter',()=>{
  const g=make(),now=dateTime('1941-01-15');
  const fr=map.provinces.filter(p=>p.nation==='FR');
  const target=fr.find(p=>fr.filter(q=>q.id!==p.id&&q.neighbors.includes(p.id)).length>=2);
  const sources=fr.filter(p=>p.id!==target.id&&p.neighbors.includes(target.id)).slice(0,2);
  assert.equal(sources.length,2);
  g.provinces[sources[1].id-1].units.tank=3;
  g.provinces[sources[1].id-1].healthByType.tank=285;
  const orders=orderMultiple(g,'FR',{arrivalMode:'together',orders:[
    {from:sources[0].id,to:target.id,units:{infantry:2},kind:'move'},
    {from:sources[1].id,to:target.id,units:{tank:2},kind:'move'}
  ]},now);
  assert.equal(orders[0].arrivalAt,orders[1].arrivalAt);
  assert(orders[0].startedAt>now);
});
test('redirect refreshes winter speed without teleporting the army',()=>{
  const g=make(),now=dateTime('1940-12-31');
  const fr=map.provinces.filter(p=>p.nation==='FR');
  const src=fr.find(p=>p.neighbors.filter(n=>map.provinces[n-1].nation==='FR').length>=2);
  const options=src.neighbors.filter(n=>map.provinces[n-1].nation==='FR');
  const order=orderMovement(g,'FR',{from:src.id,to:options[0],units:{infantry:3},kind:'move'},now);
  const changed=changeMovement(g,'FR',{id:order.id,action:'redirect',to:options[1],kind:'move'},now+1000);
  assert.equal(changed.to,options[1]);
  assert(changed.waypoints[0].id===null);
  assert(changed.hopMs>=17500&&changed.hopMs<=20000);
  assert(changed.arrivalAt>now+1000);
});
