/* WW2 Royale 1.21 — authoritative rules and balanced pacing. */
import {SHIP,SHIP_KEYS,fleetEmpty,buyShips,orderFleet,tickNavy} from './naval.js';
import {campaignDayAt,winterSeverityAt,winterUnitHopMs} from './weather.js';
export {campaignDayAt,winterSeverityAt} from './weather.js';
import {NATION_TRAITS,nationModifier,discountedPrice} from './traits.js';
import {publishWarEvent,recordBattle,battleReportsFor} from './war-events.js';
export {NATION_TRAITS};
export {SHIP};
export const UNIT={infantry:{hp:24,min:7,max:9,role:'land'},tank:{hp:95,min:18,max:25,role:'land'},bomber:{hp:42,min:30,max:38,role:'air'}};
// Construction unlocks purchases; only banks generate passive income.
export const BUILD={barracks:{cost:25,max:1},workshop:{cost:65,max:1},airport:{cost:125,max:2},bank:{cost:60,max:3},defense:{cost:150,max:1},port:{cost:105,max:1},capital:{cost:245,max:1}};
export const UNIT_COST={infantry:12,tank:55,bomber:110,balloon:180};
export const SPY_RADIUS=1; // stationed balloon + directly bordering provinces only
export const BALLOON_HOP_MS=8500; // reconnaissance balloon travel time per province; no instant teleporting

export const START_MONEY=175, HOP_MS=5000, MAX_UNITS=100000;
export const BANK_PER_SECOND=.18, PUBLIC_MATCH_MS=60*60*1000;
export const MOVE_MS={infantry:15000,tank:20000,bomber:8500};
const unitKeys=Object.keys(UNIT),buildingKeys=Object.keys(BUILD);
const pair=(a,b)=>[a,b].sort().join(':');
const roundMoney=n=>Math.round(n*100)/100;
const troops=()=>({infantry:0,tank:0,bomber:0});
const fullHealth=units=>Object.fromEntries(unitKeys.map(k=>[k,(units?.[k]||0)*UNIT[k].hp]));
const buildings=()=>({barracks:1,workshop:0,airport:0,bank:1,defense:0,port:0,capital:0});
const sumTroops=(stack)=>unitKeys.reduce((n,k)=>n+(stack?.[k]||0),0);
function hasAny(v){return unitKeys.some(k=>(v?.[k]||0)>0);}
export function createGame(map,now=Date.now(),options={}){
  const nations=Object.keys(map.nations);
  return {map,provinceDefinitions:new Map(map.provinces.map(p=>[p.id,p])),
    provinces:map.provinces.map(p=>({id:p.id,owner:p.nation,units:{...troops(),infantry:p.troops},healthByType:fullHealth({...troops(),infantry:p.troops}),fleet:fleetEmpty(),garrison:{},buildings:{...buildings(),capital:p.capital?1:0},defenseReady:true})),
    money:Object.fromEntries(nations.map(n=>[n,START_MONEY])),
    moneyRemainder:Object.fromEntries(nations.map(n=>[n,0])),
    capitals:Object.fromEntries(nations.map(n=>[n,map.provinces.find(p=>p.nation===n&&p.capital)?.id||map.provinces.find(p=>p.nation===n)?.id||null])),
    timeLimitMs:0,
    diplomacy:{},requests:[],peaceRequests:[],movements:[],navalMovements:[],spyBalloons:[],nextBalloon:1,chat:[],log:['The struggle for Europe has begun.'],winner:null,
    lastTick:now,campaignStartAt:now,nextOrder:1,hopMs:options.hopMs||HOP_MS,random:options.random||Math.random,events:[],
    warEvents:[],battleReports:[],nextWarEventId:1,nextBattleReportId:1};
}
export function relation(g,a,b){return a===b?'self':g.diplomacy[pair(a,b)]||'neutral';}
export function ally(g,nation){return Object.keys(g.map.nations).find(n=>n!==nation&&relation(g,nation,n)==='ally')||null;}
export function capitalControlled(g,nation){const id=g.capitals?.[nation];return !!(id&&g.provinces[id-1]?.owner===nation);}
export function commissionShip(g,nation,province,type,amount){return buyShips(g,nation,province,type,amount);}
export function sailFleet(g,nation,data,now=Date.now()){return orderFleet(g,nation,data,now,changeDiplomacy);}
function writeLog(g,m){g.log.unshift(m);g.log.length=Math.min(g.log.length,16);}
function invalidatePassages(g){for(const order of g.movements){if(!routeValid(g,order))order.invalid=true;}}
function evictGarrisons(g,a,b){
  for(const p of g.provinces){
    const foreign=p.owner===a?b:p.owner===b?a:null;
    if(!foreign||!p.garrison[foreign])continue;
    const home=g.provinces.find(x=>x.owner===foreign);
    if(home)for(const t of unitKeys)home.units[t]=Math.min(MAX_UNITS,home.units[t]+(p.garrison[foreign][t]||0));
    delete p.garrison[foreign];
  }
}
export function changeDiplomacy(g,nation,target,action){
  if(!g.map.nations[nation]||!g.map.nations[target]||nation===target||g.winner)throw Error('Invalid diplomacy target.');
  const status=relation(g,nation,target),key=pair(nation,target);
  const request=(kind)=>kind==='ally'?g.requests:g.peaceRequests;
  const removePair=()=>{g.requests=g.requests.filter(x=>pair(x.from,x.to)!==key);g.peaceRequests=g.peaceRequests.filter(x=>pair(x.from,x.to)!==key);};
  if(action==='declareWar'){
    if(status==='war')throw Error('Already at war.');
    if(status==='ally')evictGarrisons(g,nation,target);
    delete g.diplomacy[key];removePair();g.diplomacy[key]='war';writeLog(g,`${nation} declared war on ${target}.`);
    publishWarEvent(g,'declareWar',{actor:nation,target});
  }else if(action==='breakAlliance'){
    if(status!=='ally')throw Error('These nations are not allied.');
    evictGarrisons(g,nation,target);delete g.diplomacy[key];removePair();
    writeLog(g,`${nation} ended its alliance with ${target}.`);
    publishWarEvent(g,'allianceBroken',{actor:nation,target});
  }else if(action==='requestAlly'){
    if(status!=='neutral'||ally(g,nation)||ally(g,target)||request('ally').some(x=>pair(x.from,x.to)===key))throw Error('Alliance unavailable: only neutral nations with free alliance slots may request.');
    g.requests.push({from:nation,to:target});
  }else if(action==='acceptAlly'||action==='declineAlly'){
    if(!request('ally').some(r=>r.from===target&&r.to===nation))throw Error('No incoming alliance request.');
    if(action==='acceptAlly'){
      if(status!=='neutral'||ally(g,nation)||ally(g,target))throw Error('Alliance slot unavailable.');
      g.diplomacy[key]='ally';writeLog(g,`${nation} and ${target} formed an alliance.`);
      publishWarEvent(g,'alliance',{actor:nation,target});
    }removePair();
  }else if(action==='requestPeace'){
    if(status!=='war'||request('peace').some(x=>pair(x.from,x.to)===key))throw Error('Peace request unavailable.');
    g.peaceRequests.push({from:nation,to:target});
  }else if(action==='acceptPeace'||action==='declinePeace'){
    if(!request('peace').some(r=>r.from===target&&r.to===nation))throw Error('No incoming peace request.');
    if(action==='acceptPeace'){delete g.diplomacy[key];writeLog(g,`${nation} and ${target} signed peace.`);
      publishWarEvent(g,'peace',{actor:nation,target});}removePair();
  }else throw Error('Unknown diplomacy action.');
  invalidatePassages(g);checkVictory(g);return true;
}
// Movement is measured in province-border crossings. Every unit in a mixed
// army moves at the speed of its slowest unit (tanks > infantry > bombers).
function travelHop(g,stack,nation=null,now=Date.now()){
  const severity=winterSeverityAt(g,now);
  const base=Math.max(...unitKeys.filter(t=>stack[t]>0).map(t=>winterUnitHopMs(t,MOVE_MS[t],severity)))*g.hopMs/HOP_MS;
  return Math.round(base*(stack.tank>0?nationModifier(nation,'tankSpeed'):1));
}
function airOnly(stack){return stack.bomber>0&&!stack.infantry&&!stack.tank;}
export function findRoute(g,nation,from,to,type='infantry'){
  if(from===to||!g.provinces[from-1]||!g.provinces[to-1])return null;
  const air=type==='bomber'||type===true;
  const status=relation(g,nation,g.provinces[to-1].owner);
  if(!['self','ally','war'].includes(status))return null;
  const q=[from],prev=new Map([[from,null]]);
  for(let i=0;i<q.length;i++){
    const at=q[i];for(const nxt of g.provinceDefinitions.get(at)?.neighbors||[]){
      if(prev.has(nxt))continue;
      const rel=relation(g,nation,g.provinces[nxt-1].owner),end=nxt===to;
      const pass=air||rel==='self'||rel==='ally';
      if(!pass&&!(end&&rel==='war'))continue;
      prev.set(nxt,at);
      if(end){const arr=[nxt];let x=at;while(x!==null){arr.push(x);x=prev.get(x);}return arr.reverse();}
      if(pass)q.push(nxt);
    }
  }
  return null;
}
function node(g,id){const p=g.provinceDefinitions.get(id);return {id,x:p.x,y:p.y};}
function setItinerary(g,o,waypoints,durations,now){
  o.waypoints=waypoints;o.durations=durations;
  o.path=waypoints.map(p=>p.id).filter(Number.isInteger);
  o.startedAt=now;o.arrivalAt=now+durations.reduce((s,n)=>s+n,0);
  o.processedHops=0;o.defenseStruck=false;
}
function unitsFromCommand(data){
  if(data?.units&&typeof data.units==='object'&&!Array.isArray(data.units)){
    if(Object.keys(data.units).some(k=>!unitKeys.includes(k)))throw Error('Unknown unit type.');
    const u=troops();for(const k of unitKeys){const n=data.units[k]??0;if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid unit count.');u[k]=n;}
    return u;
  }
  if(!UNIT[data?.type]||!Number.isSafeInteger(data.count))throw Error('Invalid troop selection.');
  return {...troops(),[data.type]:data.count};
}
function syncLegacy(o){
  o.type=unitKeys.find(t=>o.units[t]>0)||'infantry';
  o.count=o.units[o.type]||0;o.health=o.healthByType[o.type]||0;
}
function alive(o){return hasAny(o.units);}
function updateFromHealth(o){
  for(const t of unitKeys)o.units[t]=Math.max(0,Math.ceil((o.healthByType[t]||0)/UNIT[t].hp-1e-9));
  syncLegacy(o);
}
export function orderMovement(g,nation,data,now=Date.now()){
  if(g.winner)throw Error('Campaign has ended.');
  const {from,to}=data||{};
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to))throw Error('Invalid province.');
  const src=g.provinces[from-1],dest=g.provinces[to-1];if(!src||!dest)throw Error('Invalid province.');
  const fromGarrison=src.owner!==nation&&relation(g,nation,src.owner)==='ally';
  if(src.owner!==nation&&!fromGarrison)throw Error('Cannot command troops in that province.');
  const stack=fromGarrison?src.garrison[nation]:src.units;
  if(!stack)throw Error('No troops stationed here.');
  const units=unitsFromCommand(data);
  if(!hasAny(units)||unitKeys.some(t=>units[t]>(stack[t]||0)))throw Error('Not enough troops for this army.');
  const rel=relation(g,nation,dest.owner);
  if(rel==='neutral'&&!(data.kind==='attack'&&data.autoDeclareWar===true))throw Error('Declare war first, or explicitly confirm an attack that automatically declares war.');
  const attacking=rel==='war'||(rel==='neutral'&&data.autoDeclareWar===true);
  if(data.kind!==(attacking?'attack':'move'))throw Error(attacking?'Use Attack to confirm a hostile order.':'Use Move to confirm a friendly order.');
  const hop=travelHop(g,units,nation,now);
  // Validate the route under the prospective war relationship BEFORE making
  // a diplomatic change. Failed orders must never declare war.
  let path;
  if(rel==='neutral'){
    const key=pair(nation,dest.owner);
    g.diplomacy[key]='war';
    try{path=findRoute(g,nation,from,to,airOnly(units));}
    finally{delete g.diplomacy[key];}
  }else path=findRoute(g,nation,from,to,airOnly(units));
  if(!path)throw Error('No valid route through owned or allied territory.');
  if(rel==='neutral')changeDiplomacy(g,nation,dest.owner,'declareWar');
  const committedHealth={};
  for(const t of unitKeys){
    const maxTake=units[t]*UNIT[t].hp;
    if(!fromGarrison){
      const actual=src.healthByType?.[t]??(stack[t]*UNIT[t].hp);
      const retained=(stack[t]-units[t])*UNIT[t].hp;
      committedHealth[t]=Math.min(maxTake,Math.max(0,actual-retained));
      src.healthByType[t]=Math.max(0,actual-committedHealth[t]);
    }else committedHealth[t]=maxTake;
    stack[t]-=units[t];
  }
  if(fromGarrison&&!hasAny(stack))delete src.garrison[nation];
  const o={id:g.nextOrder++,nation,from,to,units:{...units},healthByType:committedHealth,
    fromGarrison,hopMs:hop,attacking,returning:false,recalling:false};
  setItinerary(g,o,path.map(id=>node(g,id)),Array(path.length-1).fill(hop),now);
  syncLegacy(o);g.movements.push(o);g.events.push({kind:'order',order:o.id,nation});
  if(g.events.length>300)g.events.splice(0,g.events.length-300);return o;
}
// A coordinated order is validated on a disposable copy before it changes real
// troops, diplomacy, or routes. Every source army is committed atomically.
export function orderMultiple(g,nation,data,now=Date.now()){
  const commands=data?.orders;
  if(!Array.isArray(commands)||commands.length<2||commands.length>9)throw Error('Choose 2–9 source armies.');
  if(new Set(commands.map(c=>c?.from)).size!==commands.length)throw Error('Each source province may be selected once.');
  if(commands.some(c=>c?.to!==commands[0].to))throw Error('Group armies must share one destination.');
  if(!['together','separate'].includes(data.arrivalMode))throw Error('Choose how the armies should arrive.');
  // A pilot copy contains all state that an order can modify; no production
  // state or player balances are changed in a failed coordinated order.
  const trial={...g,provinces:structuredClone(g.provinces),diplomacy:{...g.diplomacy},
    requests:structuredClone(g.requests),peaceRequests:structuredClone(g.peaceRequests),
    movements:structuredClone(g.movements),events:[],warEvents:structuredClone(g.warEvents),battleReports:structuredClone(g.battleReports),
    log:[...g.log],winner:g.winner};
  for(const command of commands)orderMovement(trial,nation,command,now);
  const result=commands.map(command=>orderMovement(g,nation,command,now));
  if(data.arrivalMode==='together'){
    const targetTime=Math.max(...result.map(o=>o.arrivalAt));
    for(const o of result){
      const wait=targetTime-o.arrivalAt;
      o.startedAt+=wait;o.arrivalAt+=wait;
      // startAt in the future reserves the troops now, but they remain visibly
      // at their departure point until their scheduled departure time.
    }
  }
  return result;
}
// Progress along an actual set of timed legs, including the fractional first
// segment after a recall/redirect. A rerouted army never teleports to a node.
function position(g,o,now){
  const elapsed=Math.max(0,now-o.startedAt);let remaining=elapsed;
  for(let i=0;i<o.durations.length;i++){
    const duration=o.durations[i],fraction=duration?Math.min(1,remaining/duration):1;
    const a=o.waypoints[i],b=o.waypoints[i+1];
    if(remaining<=duration||i===o.durations.length-1)return {i,fraction,x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
    remaining-=duration;
  }
  const last=o.waypoints.at(-1);return {i:0,fraction:1,x:last.x,y:last.y};
}
function routeValid(g,o){
  if(o.recalling||o.returning)return true;
  const dst=g.provinces[o.to-1];if(!dst)return false;
  if(!['self','ally','war'].includes(relation(g,o.nation,dst.owner)))return false;
  if(airOnly(o.units))return true;
  // Validate all upcoming transit stops, rather than the original source.
  return o.waypoints.slice(1,-1).every(p=>!p.id||['self','ally'].includes(relation(g,o.nation,g.provinces[p.id-1].owner)));
}
function itineraryFromCurrent(g,o,now,destination,forcedBack=false,newHop=o.hopMs){
  const state=position(g,o,now),a=o.waypoints[state.i],b=o.waypoints[state.i+1];
  const current={id:null,x:state.x,y:state.y};
  const options=[];
  for(const [nodePoint,fraction] of [[a,state.fraction],[b,1-state.fraction]]){
    if(!Number.isInteger(nodePoint.id))continue;
    const path=nodePoint.id===destination?[nodePoint.id]:findRoute(g,o.nation,nodePoint.id,destination,airOnly(o.units));
    if(!path)continue;
    // Reaching the border endpoint costs the remaining actual travel time;
    // travel from that point onward uses normal unit movement speed.
    const first=Math.max(0,Math.round(o.durations[state.i]*fraction));
    const waypoints=[current,node(g,nodePoint.id),...path.slice(1).map(id=>node(g,id))];
    const durations=[first,...Array(path.length-1).fill(newHop)];
    options.push({waypoints,durations,total:durations.reduce((s,n)=>s+n,0)});
  }
  if(!options.length)throw Error(forcedBack?'No route back to your starting province.':'No valid route from this army’s current location.');
  options.sort((x,y)=>x.total-y.total);return options[0];
}
export function changeMovement(g,nation,{id,action,to,kind},now=Date.now()){
  if(g.winner)throw Error('Campaign already finished.');
  const o=g.movements.find(m=>m.id===id&&m.nation===nation);
  if(!o)throw Error('Movement not found or not yours.');
  if(now>=o.arrivalAt)throw Error('Army already reached its destination.');
  if(!['recall','redirect'].includes(action))throw Error('Unknown movement action.');
  if(o.recalling&&action==='recall')throw Error('Army is already returning.');
  const destination=action==='recall'?o.from:to;
  if(!Number.isSafeInteger(destination)||!g.provinces[destination-1])throw Error('Invalid target province.');
  const rel=relation(g,nation,g.provinces[destination-1].owner);
  if(action==='redirect'){
    if(rel==='neutral')throw Error('Declare war before attacking that nation.');
    if(kind!==(rel==='war'?'attack':'move'))throw Error('Choose Move or Attack for the destination.');
  }
  const newHop=travelHop(g,o.units,nation,now);
  const itinerary=itineraryFromCurrent(g,o,now,destination,action==='recall',newHop);
  o.hopMs=newHop;
  o.to=destination;o.attacking=action==='redirect'&&rel==='war';
  o.recalling=action==='recall';o.returning=action==='recall';
  setItinerary(g,o,itinerary.waypoints,itinerary.durations,now);
  g.events.push({kind:'changeOrder',order:o.id,nation,action});
  if(g.events.length>300)g.events.splice(0,g.events.length-300);return o;
}
// Units retain partial damage across rounds during a battle; the pool is converted
// back into whole unit counts only after the battle resolves.
function createPool(units,healthMultiplier=1){
  const pool={};for(const t of unitKeys)pool[t]=(units[t]||0)*UNIT[t].hp*healthMultiplier;
  return pool;
}
function poolUnits(pool,multiplier=1){
  return Object.fromEntries(unitKeys.map(t=>[t,Math.max(0,Math.ceil((pool[t]||0)/(UNIT[t].hp*multiplier)-1e-9))]));
}
function applyPoolDamage(pool,damage,types){
  for(const t of types){if(damage<=0)break;
    const spent=Math.min(pool[t]||0,damage);pool[t]-=spent;damage-=spent;
  }
}
function damageRoll(g,units,targets,modifier=1){
  let total=0;
  for(const type of unitKeys){
    if(!targets.includes(type))continue;
    const {min,max}=UNIT[type],count=units[type]||0;
    if(count<=2000){for(let i=0;i<count;i++)total+=min+Math.floor(g.random()*(max-min+1));}
    else total+=count*(min+(max-min)/2);
  }
  return total*modifier;
}
function volley(g,attacker,defender,modifier=1,attackingNation=null){
  const dLand=(defender.infantry||0)+(defender.tank||0)>0;
  const dAir=(defender.bomber||0)>0;
  // Land forces can only hit land. Tanks and bombers can instead hit air.
  const infantryDamage=(attacker.infantry||0)*(UNIT.infantry.min+UNIT.infantry.max)/2*
    (nationModifier(attackingNation,'infantryDamage')-1)*modifier;
  if(dLand)applyPoolDamage(defender,damageRoll(g,attacker,['infantry','tank','bomber'],modifier)+infantryDamage,['infantry','tank']);
  else if(dAir)applyPoolDamage(defender,damageRoll(g,attacker,['tank','bomber'],modifier),['bomber']);
}
function fight(g,order,target){
  const attackMultiplier=capitalControlled(g,order.nation)?1:.8;
  const defenseMultiplier=(capitalControlled(g,target.owner)?1:.8)*nationModifier(target.owner,'defenseHealth');
  const defenderNation=target.owner;
  const initialAttack={...order.units},initialDefense={...target.units};
  const attack=Object.fromEntries(unitKeys.map(t=>[t,order.healthByType[t]*attackMultiplier]));
  const defend=Object.fromEntries(unitKeys.map(t=>[t,(target.healthByType?.[t]??target.units[t]*UNIT[t].hp)*defenseMultiplier]));
  const supportOwners=Object.entries(target.garrison||{}).filter(([n])=>relation(g,n,target.owner)==='ally');
  const supportStacks={};for(const [n,u] of supportOwners)supportStacks[n]=createPool(u,.8);
  const merged=()=>{const result=createPool(troops());for(const pool of Object.values(supportStacks))
    for(const t of unitKeys)result[t]+=pool[t];return result;};
  for(let round=0;round<50;round++){
    const attUnits=poolUnits(attack,attackMultiplier),defUnits=poolUnits(defend,defenseMultiplier),alliedUnits=poolUnits(merged(),.8);
    if(!hasAny(attUnits)||(!hasAny(defUnits)&&!hasAny(alliedUnits)))break;
    const before=JSON.stringify([attack,defend,supportStacks]);
    volley(g,attUnits,defend,attackMultiplier,order.nation);
    if(!hasAny(poolUnits(defend)))for(const pool of Object.values(supportStacks)){
      if(!hasAny(poolUnits(pool,.8)))continue;
      volley(g,attUnits,pool,1,order.nation);if(hasAny(poolUnits(pool,.8)))break;
    }
    volley(g,defUnits,attack,defenseMultiplier,defenderNation);
    for(const [supportNation,pool] of Object.entries(supportStacks))volley(g,poolUnits(pool,.8),attack,.8,supportNation);
    if(before===JSON.stringify([attack,defend,supportStacks]))break;
  }
  target.units=poolUnits(defend,defenseMultiplier);
  target.healthByType=Object.fromEntries(unitKeys.map(t=>[t,defend[t]/defenseMultiplier]));
  for(const [owner,pool] of Object.entries(supportStacks)){
    target.garrison[owner]=poolUnits(pool,.8);
    if(!hasAny(target.garrison[owner]))delete target.garrison[owner];
  }
  order.healthByType=Object.fromEntries(unitKeys.map(t=>[t,attack[t]/attackMultiplier]));updateFromHealth(order);
  const won=(order.units.infantry+order.units.tank>0)&&!hasAny(target.units)&&supportOwners.every(([n])=>!target.garrison[n]);
  // Capture transfers surviving land units into the province, but those units
  // must still count as SURVIVORS in the after-action casualty report.
  const attackingSurvivors={...order.units};
  if(won){
    const old=target.owner;target.owner=order.nation;
    target.units={...troops(),infantry:order.units.infantry,tank:order.units.tank};
    target.healthByType={...troops(),infantry:order.healthByType.infantry,tank:order.healthByType.tank};
    target.garrison={};target.fleet=fleetEmpty();target.defenseReady=true;
    order.units.infantry=0;order.units.tank=0;order.healthByType.infantry=0;order.healthByType.tank=0;
    writeLog(g,`${order.nation} captured ${g.provinceDefinitions.get(order.to).name} from ${old}.`);
    if(g.capitals[old]===order.to)publishWarEvent(g,'capitalFall',{actor:order.nation,target:old,province:order.to});
  }else writeLog(g,`${order.nation} attacked ${g.provinceDefinitions.get(order.to).name}.`);
  recordBattle(g,{kind:'land',attacker:order.nation,defender:defenderNation,province:order.to,
    attackerBefore:initialAttack,attackerAfter:attackingSurvivors,defenderBefore:initialDefense,
    defenderAfter:target.owner===defenderNation?target.units:{},won});
  syncLegacy(order);return won;
}
function returnOrder(g,o){
  let p=g.provinces[(o.returning?o.to:o.from)-1];
  if(!p)return;
  if(p.owner!==o.nation){
    if(relation(g,o.nation,p.owner)==='ally'){
      const stack=p.garrison[o.nation]||troops();
      for(const t of unitKeys)stack[t]=Math.min(MAX_UNITS,stack[t]+o.units[t]);
      p.garrison[o.nation]=stack;return;
    }
    p=g.provinces.find(x=>x.owner===o.nation);
  }
  if(p)for(const t of unitKeys){p.units[t]=Math.min(MAX_UNITS,p.units[t]+o.units[t]);
    p.healthByType[t]=(p.healthByType?.[t]||0)+(o.healthByType?.[t]||o.units[t]*UNIT[t].hp);}
  writeLog(g,`${o.nation} troops returned to their base.`);
}
function bomberReturn(g,o,now){
  if(o.units.bomber<=0)return null;
  const returned={...o,units:{...troops(),bomber:o.units.bomber},healthByType:{...troops(),bomber:o.healthByType.bomber},
    id:g.nextOrder++,from:o.to,to:o.from,attacking:false,returning:true,recalling:false,hopMs:travelHop(g,{...troops(),bomber:1},o.nation,now)};
  // Bombers return to their actual original base at their normal 7s/hop speed.
  const route=findRoute(g,o.nation,returned.from,returned.to,'bomber')||[...o.path].reverse();
  setItinerary(g,returned,route.map(id=>node(g,id)),Array(route.length-1).fill(returned.hopMs),now);
  syncLegacy(returned);return returned;
}
function resolveArrival(g,o,now){
  const target=g.provinces[o.to-1],status=relation(g,o.nation,target.owner);
  if(o.recalling||o.returning){returnOrder(g,o);return null;}
  if(status==='war'){
    fight(g,o,target);
    const comeback=bomberReturn(g,o,now);
    checkVictory(g);return comeback;
  }
  if(status==='self')for(const t of unitKeys){target.units[t]=Math.min(MAX_UNITS,target.units[t]+o.units[t]);
    target.healthByType[t]=(target.healthByType?.[t]||0)+(o.healthByType?.[t]||o.units[t]*UNIT[t].hp);}
  else if(status==='ally'){
    const stack=target.garrison[o.nation]||troops();
    for(const t of unitKeys)stack[t]=Math.min(MAX_UNITS,stack[t]+o.units[t]);
    target.garrison[o.nation]=stack;
    writeLog(g,`${o.nation} stationed an army in allied territory.`);
  }else returnOrder(g,o);
  checkVictory(g);return null;
}
function defensePrestrike(g,o){
  const target=g.provinces[o.to-1];
  if(!target?.buildings.defense||!target.defenseReady||relation(g,o.nation,target.owner)!=='war')return;
  for(const t of unitKeys)o.healthByType[t]*=.8;
  updateFromHealth(o);o.defenseStruck=true;
  writeLog(g,`Defences in ${g.provinceDefinitions.get(o.to).name} inflicted 20% HP damage to the approaching ${o.nation} army.`);
}
export function build(g,nation,provinceId,kind,now=Date.now()){
  const p=g.provinces[provinceId-1],b=BUILD[kind];
  if(g.winner||!p||p.owner!==nation||!b)throw Error('Cannot construct in that province.');
  if(kind==='port'&&!g.provinceDefinitions.get(provinceId)?.coastal)throw Error('Ports can only be built in coastal provinces.');
  if(kind==='capital'&&g.capitals[nation]===provinceId&&capitalControlled(g,nation))throw Error('This province is already your capital.');
  if(kind!=='capital'&&p.buildings[kind]>=b.max)throw Error(`Maximum ${b.max} ${kind} level(s) in this province.`);
  const cost=discountedPrice(b.cost,nation,kind==='port'?'portCost':'');
  if(g.money[nation]<cost)throw Error('Insufficient funds.');
  g.money[nation]=roundMoney(g.money[nation]-cost);
  if(kind==='capital'){
    const old=g.capitals[nation];if(old&&g.provinces[old-1])g.provinces[old-1].buildings.capital=0;
    g.capitals[nation]=provinceId;p.buildings.capital=1;
    writeLog(g,`${nation} established its new capital at ${g.provinceDefinitions.get(provinceId).name}.`);
    publishWarEvent(g,'newCapital',{actor:nation,province:provinceId});
  }else{p.buildings[kind]++;writeLog(g,`${nation} upgraded ${kind} in ${g.provinceDefinitions.get(provinceId).name} to level ${p.buildings[kind]}.`);}
  return p;
}
export function buyUnit(g,nation,provinceId,type,amount=1){
  const p=g.provinces[provinceId-1];
  if(g.winner||!p||p.owner!==nation)throw Error('You may only recruit in your own province.');
  if(!(type in UNIT_COST)||!Number.isSafeInteger(amount)||amount<1||amount>500)throw Error('Invalid recruitment request.');
  if(type==='infantry'&&p.buildings.barracks<1)throw Error('Build barracks first.');
  if(type==='tank'&&p.buildings.workshop<1)throw Error('Build a workshop first.');
  if(type==='bomber'&&p.buildings.airport<2)throw Error('Upgrade the airport to level 2 first.');
  if(type==='balloon'&&p.buildings.airport<1)throw Error('Build a level 1 airport first.');
  if(type==='balloon'&&(amount>5||g.spyBalloons.filter(b=>b.nation===nation).length+amount>20))throw Error('Maximum 20 balloons per nation; purchase up to 5 at a time.');
  if(type!=='balloon'&&p.units[type]+amount>MAX_UNITS)throw Error('Province unit limit reached.');
  const unitPrice=discountedPrice(UNIT_COST[type],nation,type==='infantry'?'infantryCost':type==='tank'?'tankCost':'');
  const total=roundMoney(unitPrice*amount);
  if(g.money[nation]<total)throw Error(`Insufficient funds. Need $${total}.`);
  g.money[nation]=roundMoney(g.money[nation]-total);
  if(type==='balloon')for(let i=0;i<amount;i++)g.spyBalloons.push({id:g.nextBalloon++,nation,province:provinceId});
  else{p.units[type]+=amount;p.healthByType[type]=(p.healthByType[type]||0)+UNIT[type].hp*amount;}
  writeLog(g,`${nation} purchased ${amount} ${type}${amount===1?'':'s'} in ${g.provinceDefinitions.get(provinceId).name}.`);
  return {province:provinceId,type,amount,total};
}
// Reconnaissance balloons use server-authoritative travel orders and cannot
// reveal their destination until reaching it. Routes cross any adjacent map
// provinces without declaring war. This uses the same map graph as armies.
function balloonRoute(g,from,to){
  if(from===to)return null;
  const queue=[from], previous=new Map([[from,null]]);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];
    for(const neighbor of g.provinceDefinitions.get(p)?.neighbors||[]){
      if(previous.has(neighbor))continue;
      previous.set(neighbor,p);
      if(neighbor===to){
        const path=[to];let current=p;
        while(current!==null){path.push(current);current=previous.get(current);}
        return path.reverse();
      }
      queue.push(neighbor);
    }
  }
  return null;
}
function balloonFlightPosition(g,balloon,now){
  const move=balloon.movement;
  const current=g.provinceDefinitions.get(balloon.province);
  if(!move)return current?{x:current.x,y:current.y}:null;
  const elapsed=Math.max(0,now-move.startedAt),fraction=elapsed/Math.max(1,move.stepMs);
  const leg=Math.min(move.path.length-2,Math.max(0,Math.floor(fraction)));
  const from=g.provinceDefinitions.get(move.path[leg]),to=g.provinceDefinitions.get(move.path[leg+1]);
  if(!from||!to)return current?{x:current.x,y:current.y}:null;
  const begin=leg===0&&move.visualStart?move.visualStart:from;
  const t=Math.max(0,Math.min(1,fraction-leg));
  return {x:begin.x+(to.x-begin.x)*t,y:begin.y+(to.y-begin.y)*t};
}
export function stationBalloon(g,nation,id,provinceId,now=Date.now()){
  const balloon=g.spyBalloons.find(b=>b.id===id&&b.nation===nation);
  if(!balloon||!Number.isSafeInteger(provinceId)||!g.provinces[provinceId-1]||g.winner)
    throw Error('Invalid spy balloon assignment.');
  if(!Number.isFinite(now))throw Error('Invalid movement time.');
  if(balloon.province===provinceId)throw Error('Choose a different destination for this balloon.');
  const path=balloonRoute(g,balloon.province,provinceId);
  if(!path||path.length<2)throw Error('No valid reconnaissance flight route.');
  // On a redirect, the new route departs from the last actually reached province.
  const origin=balloon.movement?.origin??balloon.province;
  const visualStart=balloon.movement?balloonFlightPosition(g,balloon,now):null;
  balloon.movement={from:balloon.province,to:provinceId,origin,path,visualStart,
    startedAt:now,arrivalAt:now+(path.length-1)*BALLOON_HOP_MS,stepMs:BALLOON_HOP_MS};
  writeLog(g,`${nation} launched reconnaissance balloon #${id} toward ${g.provinceDefinitions.get(provinceId).name}.`);
  return balloon;
}
export function recallBalloon(g,nation,id,now=Date.now()){
  const balloon=g.spyBalloons.find(b=>b.id===id&&b.nation===nation);
  if(!balloon?.movement||g.winner)throw Error('No moving spy balloon to recall.');
  const origin=balloon.movement.origin;
  const visualStart=balloonFlightPosition(g,balloon,now);
  if(origin===balloon.province){
    // The balloon has not crossed a border yet. It still needs a timed return
    // from its in-flight position; the client draws its return leg accordingly.
    const position=Math.max(0,Math.min(1,(now-balloon.movement.startedAt)/balloon.movement.stepMs));
    balloon.movement={from:balloon.province,to:origin,origin,path:[balloon.province,origin],
      visualStart,startedAt:now,arrivalAt:now+Math.max(1000,Math.round(position*BALLOON_HOP_MS)),
      stepMs:Math.max(1000,Math.round(position*BALLOON_HOP_MS)),returning:true};
    return balloon;
  }
  const path=balloonRoute(g,balloon.province,origin);
  if(!path)throw Error('No return route for spy balloon.');
  balloon.movement={from:balloon.province,to:origin,origin,path,visualStart,
    startedAt:now,arrivalAt:now+(path.length-1)*BALLOON_HOP_MS,stepMs:BALLOON_HOP_MS,returning:true};
  return balloon;
}
function tickBalloons(g,now){
  let changed=false;
  for(const balloon of g.spyBalloons){
    const move=balloon.movement;
    if(!move)continue;
    const elapsed=Math.max(0,now-move.startedAt);
    const step=Math.min(move.path.length-1,Math.floor(elapsed/move.stepMs));
    const reached=move.path[step];
    if(reached!==balloon.province){balloon.province=reached;changed=true;}
    if(now>=move.arrivalAt){
      balloon.province=move.to;balloon.movement=null;changed=true;
    }
  }
  return changed;
}
function reconnaissanceZone(g,from,radius=SPY_RADIUS){
  const visited=new Set([from]),queue=[[from,0]];
  for(let i=0;i<queue.length;i++){
    const [id,depth]=queue[i];if(depth>=radius)continue;
    for(const n of g.provinceDefinitions.get(id)?.neighbors||[])if(!visited.has(n)){
      visited.add(n);queue.push([n,depth+1]);
    }
  }
  return visited;
}
export function sendChat(g,nation,content,now=Date.now()){
  const message=typeof content==='string'?content:content?.message;
  const to=typeof content==='string'?'all':content?.to||'all';
  if(!g.map.nations[nation]||typeof message!=='string'||(to!=='all'&&!g.map.nations[to]))throw Error('Invalid message or recipient.');
  const body=message.trim();if(!body||body.length>280)throw Error('Message must contain 1–280 characters.');
  g.chat.push({id:g.chat.length?g.chat[g.chat.length-1].id+1:1,nation,to,text:body,at:now});
  if(g.chat.length>60)g.chat.shift();return true;
}
export function attackPower(p){return unitKeys.reduce((s,k)=>s+(p.units[k]||0)*(UNIT[k].min+UNIT[k].max)/2,0)+SHIP_KEYS.reduce((s,k)=>s+(p.fleet[k]||0)*SHIP[k].damage,0);}
export function rankings(g){
  const nations=Object.keys(g.map.nations);
  const data=nations.map(n=>({nation:n,provinces:g.provinces.filter(p=>p.owner===n).length,
    money:g.money[n],attack:g.provinces.filter(p=>p.owner===n).reduce((s,p)=>s+attackPower(p),0)+
      g.provinces.reduce((s,p)=>s+unitKeys.reduce((sub,t)=>sub+(p.garrison[n]?.[t]||0)*(UNIT[t].min+UNIT[t].max)/2,0),0)+
      g.movements.filter(o=>o.nation===n).reduce((s,o)=>s+unitKeys.reduce((v,t)=>v+(o.units[t]||0)*(UNIT[t].min+UNIT[t].max)/2,0),0)+
      g.navalMovements.filter(o=>o.nation===n).reduce((s,o)=>s+SHIP_KEYS.reduce((v,t)=>v+(o.ships[t]||0)*SHIP[t].damage,0),0)}));
  const sums={provinces:data.reduce((s,x)=>s+x.provinces,0),money:data.reduce((s,x)=>s+x.money,0),attack:data.reduce((s,x)=>s+x.attack,0)};
  for(const r of data){r.score=100*(.5*r.provinces/Math.max(1,sums.provinces)+.25*r.money/Math.max(1,sums.money)+.25*r.attack/Math.max(1,sums.attack));}
  return data.sort((a,b)=>b.score-a.score||b.provinces-a.provinces).map((r,i)=>({...r,place:i+1}));
}
export function checkVictory(g){
  if(g.winner)return g.winner;
  const threshold=g.provinces.length,byNation=Object.fromEntries(Object.keys(g.map.nations).map(n=>[n,0]));
  for(const p of g.provinces)byNation[p.owner]++;
  for(const nation of Object.keys(byNation)){
    const friend=ally(g,nation);
    if(friend){if(byNation[nation]+byNation[friend]>=Math.ceil(threshold*.67)){
      g.winner={nations:[nation,friend],mode:'alliance'};break;}}
    else if(byNation[nation]>=Math.ceil(threshold*.51)){g.winner={nations:[nation],mode:'solo'};break;}
  }
  if(g.winner){g.movements=[];g.navalMovements=[];writeLog(g,`Victory: ${g.winner.nations.join(' + ')} (${g.winner.mode}).`);
    publishWarEvent(g,'victory',{actor:g.winner.nations[0],summary:`Victory for ${g.winner.nations.map(n=>g.map.nations[n]?.name||n).join(' and ')}.`});}
  return g.winner;
}
export function tick(g,now=Date.now()){
  if(g.winner)return false;
  if(g.timeLimitMs>0&&now-g.campaignStartAt>=g.timeLimitMs){
    const winner=rankings(g).find(r=>g.map.nations[r.nation]?.playable);
    if(winner){g.winner={nations:[winner.nation],mode:'time-limit'};g.movements=[];g.navalMovements=[];writeLog(g,`Time expired: ${winner.nation} wins on ranking.`);
      publishWarEvent(g,'victory',{actor:winner.nation,summary:`${g.map.nations[winner.nation].name} won on ranking at the time limit.`});return true;}
  }
  const elapsed=Math.max(0,Math.min(60000,now-g.lastTick));if(elapsed===0)return false;
  const prev=g.lastTick;g.lastTick=now;let changed=false;
  // Bank income is continuous per nation; unclaimed nations still accumulate.
  const bankTotals={};for(const p of g.provinces)bankTotals[p.owner]=(bankTotals[p.owner]||0)+p.buildings.bank;
  for(const [n,c] of Object.entries(bankTotals)){
    // Keep sub-cent production internally. Otherwise rounding each 100ms tick
    // distorts small nation bonuses and makes income depend on tick frequency.
    const exact=g.money[n]+(g.moneyRemainder?.[n]||0)+c*BANK_PER_SECOND*elapsed/1000*nationModifier(n,'bankIncome');
    g.money[n]=roundMoney(exact);
    if(g.moneyRemainder)g.moneyRemainder[n]=exact-g.money[n];
    changed=true;
  }
  // No automatic troop production: recruitment is an explicit paid command.
  const pending=[];
  for(const o of g.movements){
    if(!routeValid(g,o)){
      // Invalid diplomatic passage: attempt an actual timed withdrawal.
      try{changeMovement(g,o.nation,{id:o.id,action:'recall'},now);}
      catch{ // Surrounded armies remain stationary until a route opens.
        o.startedAt=now;o.arrivalAt=now+o.hopMs;
      }
      changed=true;
    }
    if(o.units.bomber>0){
      let elapsed=Math.max(0,now-o.startedAt),accum=o.durations.slice(0,o.processedHops).reduce((a,b)=>a+b,0);
      while(o.processedHops<o.durations.length && elapsed>=accum+o.durations[o.processedHops]){
        accum+=o.durations[o.processedHops];o.processedHops++;
        const step=o.waypoints[o.processedHops];
        if(!step?.id||o.processedHops===o.waypoints.length-1)continue;
        const land=g.provinces[step.id-1];
        if(!['self','ally'].includes(relation(g,o.nation,land.owner))){
          const hostile={tank:land.units.tank||0,bomber:land.units.bomber||0};
          const damage=damageRoll(g,hostile,['tank','bomber']);
          o.healthByType.bomber=Math.max(0,o.healthByType.bomber-damage);
          updateFromHealth(o);changed=true;
        }
      }
    }
    if(!alive(o)){changed=true;continue;}
    if(!o.defenseStruck&&o.attacking&&now>=o.arrivalAt-1000){defensePrestrike(g,o);o.defenseStruck=true;changed=true;}
    if(!alive(o)){changed=true;continue;}
    if(now>=o.arrivalAt){const comeback=resolveArrival(g,o,now);if(comeback&&!g.winner)pending.push(comeback);changed=true;}
    else pending.push(o);
  }
  g.movements=g.winner?[]:pending;
  if(tickNavy(g,now))changed=true;
  if(tickBalloons(g,now))changed=true;
  return changed;
}
function canSeeEnemy(g,nation,p,now=Date.now(),spyVision=null){
  if(!nation)return false;
  if(p.owner===nation||relation(g,nation,p.owner)==='ally')return true;
  if(g.provinceDefinitions.get(p.id).neighbors.some(id=>g.provinces[id-1].owner===nation))return true;
  if(spyVision?.has(p.id))return true;
  return g.movements.some(o=>o.type==='bomber'&&o.nation===nation&&o.to===p.id&&o.attacking&&o.arrivalAt-now<=10000);
}
export function viewFor(g,nation,now=Date.now(),options={allyMoves:true,hostileMoves:true}){
  const spyVision=new Set();
  if(nation)for(const b of g.spyBalloons)if(b.nation===nation||relation(g,nation,b.nation)==='ally')
    for(const id of reconnaissanceZone(g,b.province))spyVision.add(id);
  const provinces=g.provinces.map(p=>{
    const visible=canSeeEnemy(g,nation,p,now,spyVision);
    return {id:p.id,owner:p.owner,units:visible?{...p.units}:null,healthByType:visible?{...p.healthByType}:null,fleet:visible?{...p.fleet}:null,
      garrison:visible?structuredClone(p.garrison):null,buildings:visible?{...p.buildings}:null,
      production:null,visible};
  });
  const movements=g.movements.filter(o=>{
    if(o.nation===nation)return true;
    if(options.allyMoves&&nation&&relation(g,nation,o.nation)==='ally')return true;
    return !!(options.hostileMoves&&nation&&o.attacking&&relation(g,nation,o.nation)==='war'&&
      g.provinces[o.to-1].owner===nation&&o.arrivalAt-now<=20000);
  }).map(o=>({...o}));
  const navalMovements=g.navalMovements.filter(o=>o.nation===nation||(nation&&relation(g,nation,o.nation)==='ally')||
    (nation&&o.attacking&&g.provinces[o.to-1].owner===nation&&o.arrivalAt-now<20000));
  return {provinces,occupied:[],money:nation?g.money[nation]:null,rankings:rankings(g),
    warNews:(g.warEvents||[]).slice(0,80),battleReports:battleReportsFor(g,nation),
    nationTraits:NATION_TRAITS,
    capitals:{...g.capitals},capitalStatus:Object.fromEntries(Object.keys(g.capitals).map(n=>[n,capitalControlled(g,n)])),
    navalMovements:navalMovements.map(o=>({...o})), matchLimitSeconds:g.timeLimitMs/1000,
    spyBalloons:g.spyBalloons.filter(b=>nation&&(b.nation===nation||relation(g,nation,b.nation)==='ally')).map(b=>({...b})),
    campaignDay:campaignDayAt(g,now),elapsedSeconds:Math.max(0,Math.floor((now-g.campaignStartAt)/1000)),
    winner:g.winner,diplomacy:g.diplomacy,requests:g.requests,peaceRequests:g.peaceRequests,
    movements,log:g.log,chat:g.chat.filter(m=>m.to==='all'||m.nation===nation||m.to===nation),hopMs:g.hopMs,serverTime:now};
}
