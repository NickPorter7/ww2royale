/* WW2 Royale 1.5 — independent authoritative game rules. */
export const UNIT={infantry:{hp:20,min:10,max:12,role:'land'},tank:{hp:100,min:20,max:30,role:'land'},bomber:{hp:50,min:35,max:40,role:'air'}};
export const BUILD={barracks:{cost:20,ms:45000,unit:'infantry'},shop:{cost:90,ms:90000,unit:'tank'},airport:{cost:175,ms:240000,unit:'bomber'},bank:{cost:50},defense:{cost:200}};
export const START_MONEY=100, HOP_MS=5000, MAX_UNITS=100000;
export const MOVE_MS={infantry:10000,tank:20000,bomber:7000};
const unitKeys=Object.keys(UNIT),buildingKeys=Object.keys(BUILD);
const pair=(a,b)=>[a,b].sort().join(':');
const roundMoney=n=>Math.round(n*100)/100;
const troops=()=>({infantry:0,tank:0,bomber:0});
const buildings=()=>({barracks:1,shop:0,airport:0,bank:1,defense:0});
const sumTroops=(stack)=>unitKeys.reduce((n,k)=>n+(stack?.[k]||0),0);
function hasAny(v){return unitKeys.some(k=>(v?.[k]||0)>0);}
export function createGame(map,now=Date.now(),options={}){
  const nations=Object.keys(map.nations);
  return {map,provinceDefinitions:new Map(map.provinces.map(p=>[p.id,p])),
    provinces:map.provinces.map(p=>({id:p.id,owner:p.nation,units:{...troops(),infantry:p.troops},garrison:{},buildings:buildings(),production:{barracks:now+45000,shop:now+90000,airport:now+240000},defenseReady:true})),
    money:Object.fromEntries(nations.map(n=>[n,START_MONEY])),
    diplomacy:{},requests:[],peaceRequests:[],movements:[],chat:[],log:['The struggle for Europe has begun.'],winner:null,
    lastTick:now,campaignStartAt:now,nextOrder:1,hopMs:options.hopMs||HOP_MS,random:options.random||Math.random,events:[]};
}
export function relation(g,a,b){return a===b?'self':g.diplomacy[pair(a,b)]||'neutral';}
export function ally(g,nation){return Object.keys(g.map.nations).find(n=>n!==nation&&relation(g,nation,n)==='ally')||null;}
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
  }else if(action==='breakAlliance'){
    if(status!=='ally')throw Error('These nations are not allied.');
    evictGarrisons(g,nation,target);delete g.diplomacy[key];removePair();
    writeLog(g,`${nation} ended its alliance with ${target}.`);
  }else if(action==='requestAlly'){
    if(status!=='neutral'||ally(g,nation)||ally(g,target)||request('ally').some(x=>pair(x.from,x.to)===key))throw Error('Alliance unavailable: only neutral nations with free alliance slots may request.');
    g.requests.push({from:nation,to:target});
  }else if(action==='acceptAlly'||action==='declineAlly'){
    if(!request('ally').some(r=>r.from===target&&r.to===nation))throw Error('No incoming alliance request.');
    if(action==='acceptAlly'){
      if(status!=='neutral'||ally(g,nation)||ally(g,target))throw Error('Alliance slot unavailable.');
      g.diplomacy[key]='ally';writeLog(g,`${nation} and ${target} formed an alliance.`);
    }removePair();
  }else if(action==='requestPeace'){
    if(status!=='war'||request('peace').some(x=>pair(x.from,x.to)===key))throw Error('Peace request unavailable.');
    g.peaceRequests.push({from:nation,to:target});
  }else if(action==='acceptPeace'||action==='declinePeace'){
    if(!request('peace').some(r=>r.from===target&&r.to===nation))throw Error('No incoming peace request.');
    if(action==='acceptPeace'){delete g.diplomacy[key];writeLog(g,`${nation} and ${target} signed peace.`);}removePair();
  }else throw Error('Unknown diplomacy action.');
  invalidatePassages(g);checkVictory(g);return true;
}
// Movement is measured in province-border crossings. Every unit in a mixed
// army moves at the speed of its slowest unit (tanks > infantry > bombers).
function travelHop(g,stack){return Math.max(...unitKeys.filter(t=>stack[t]>0).map(t=>MOVE_MS[t]))*g.hopMs/HOP_MS;}
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
  const hop=travelHop(g,units);
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
  for(const t of unitKeys)stack[t]-=units[t];
  if(fromGarrison&&!hasAny(stack))delete src.garrison[nation];
  const o={id:g.nextOrder++,nation,from,to,units:{...units},healthByType:Object.fromEntries(unitKeys.map(t=>[t,units[t]*UNIT[t].hp])),
    fromGarrison,hopMs:hop,attacking,returning:false,recalling:false};
  setItinerary(g,o,path.map(id=>node(g,id)),Array(path.length-1).fill(hop),now);
  syncLegacy(o);g.movements.push(o);g.events.push({kind:'order',order:o.id,nation});return o;
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
function itineraryFromCurrent(g,o,now,destination,forcedBack=false){
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
    const durations=[first,...Array(path.length-1).fill(o.hopMs)];
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
  const itinerary=itineraryFromCurrent(g,o,now,destination,action==='recall');
  o.to=destination;o.attacking=action==='redirect'&&rel==='war';
  o.recalling=action==='recall';o.returning=action==='recall';
  setItinerary(g,o,itinerary.waypoints,itinerary.durations,now);
  g.events.push({kind:'changeOrder',order:o.id,nation,action});return o;
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
function volley(g,attacker,defender,modifier=1){
  const dLand=(defender.infantry||0)+(defender.tank||0)>0;
  const dAir=(defender.bomber||0)>0;
  // Land forces can only hit land. Tanks and bombers can instead hit air.
  if(dLand)applyPoolDamage(defender,damageRoll(g,attacker,['infantry','tank','bomber'],modifier),['infantry','tank']);
  else if(dAir)applyPoolDamage(defender,damageRoll(g,attacker,['tank','bomber'],modifier),['bomber']);
}
function fight(g,order,target){
  const attack={...order.healthByType};
  const defend=createPool(target.units);
  const supportOwners=Object.entries(target.garrison||{}).filter(([n])=>relation(g,n,target.owner)==='ally');
  const supportStacks={};for(const [n,u] of supportOwners)supportStacks[n]=createPool(u,.8);
  const merged=()=>{const result=createPool(troops());for(const pool of Object.values(supportStacks))
    for(const t of unitKeys)result[t]+=pool[t];return result;};
  for(let round=0;round<50;round++){
    const attUnits=poolUnits(attack),defUnits=poolUnits(defend),alliedUnits=poolUnits(merged(),.8);
    if(!hasAny(attUnits)||(!hasAny(defUnits)&&!hasAny(alliedUnits)))break;
    const before=JSON.stringify([attack,defend,supportStacks]);
    volley(g,attUnits,defend);
    if(!hasAny(poolUnits(defend)))for(const pool of Object.values(supportStacks)){
      if(!hasAny(poolUnits(pool,.8)))continue;
      volley(g,attUnits,pool);if(hasAny(poolUnits(pool,.8)))break;
    }
    volley(g,defUnits,attack);
    for(const pool of Object.values(supportStacks))volley(g,poolUnits(pool,.8),attack,.8);
    if(before===JSON.stringify([attack,defend,supportStacks]))break;
  }
  target.units=poolUnits(defend);
  for(const [owner,pool] of Object.entries(supportStacks)){
    target.garrison[owner]=poolUnits(pool,.8);
    if(!hasAny(target.garrison[owner]))delete target.garrison[owner];
  }
  order.healthByType={...attack};updateFromHealth(order);
  const won=(order.units.infantry+order.units.tank>0)&&!hasAny(target.units)&&supportOwners.every(([n])=>!target.garrison[n]);
  if(won){
    const old=target.owner;target.owner=order.nation;
    target.units={...troops(),infantry:order.units.infantry,tank:order.units.tank};
    target.garrison={};target.defenseReady=true;
    order.units.infantry=0;order.units.tank=0;order.healthByType.infantry=0;order.healthByType.tank=0;
    writeLog(g,`${order.nation} captured ${g.provinceDefinitions.get(order.to).name} from ${old}.`);
  }else writeLog(g,`${order.nation} attacked ${g.provinceDefinitions.get(order.to).name}.`);
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
  if(p)for(const t of unitKeys)p.units[t]=Math.min(MAX_UNITS,p.units[t]+o.units[t]);
  writeLog(g,`${o.nation} troops returned to their base.`);
}
function bomberReturn(g,o,now){
  if(o.units.bomber<=0)return null;
  const returned={...o,units:{...troops(),bomber:o.units.bomber},healthByType:{...troops(),bomber:o.healthByType.bomber},
    id:g.nextOrder++,from:o.to,to:o.from,attacking:false,returning:true,recalling:false,hopMs:travelHop(g,{...troops(),bomber:1})};
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
  if(status==='self')for(const t of unitKeys)target.units[t]=Math.min(MAX_UNITS,target.units[t]+o.units[t]);
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
  if(g.winner||!p||p.owner!==nation||!b)throw Error('Cannot construct there.');
  if(p.buildings[kind] && kind==='defense')throw Error('One defense system maximum per province.');
  if(g.money[nation]<b.cost)throw Error('Insufficient funds.');
  if(p.buildings[kind]>=100)throw Error('Maximum 100 buildings of this type.');
  g.money[nation]=roundMoney(g.money[nation]-b.cost);p.buildings[kind]++;
  if(b.ms&&p.buildings[kind]===1)p.production[kind]=now+b.ms;
  writeLog(g,`${nation} constructed ${kind} in ${g.provinceDefinitions.get(provinceId).name}.`);
  return p;
}
export function sendChat(g,nation,content,now=Date.now()){
  const message=typeof content==='string'?content:content?.message;
  const to=typeof content==='string'?'all':content?.to||'all';
  if(!g.map.nations[nation]||typeof message!=='string'||(to!=='all'&&!g.map.nations[to]))throw Error('Invalid message or recipient.');
  const body=message.trim();if(!body||body.length>280)throw Error('Message must contain 1–280 characters.');
  g.chat.push({id:g.chat.length?g.chat[g.chat.length-1].id+1:1,nation,to,text:body,at:now});
  if(g.chat.length>60)g.chat.shift();return true;
}
export function attackPower(p){return unitKeys.reduce((s,k)=>s+(p.units[k]||0)*(UNIT[k].min+UNIT[k].max)/2,0);}
export function rankings(g){
  const nations=Object.keys(g.map.nations);
  const data=nations.map(n=>({nation:n,provinces:g.provinces.filter(p=>p.owner===n).length,
    money:g.money[n],attack:g.provinces.filter(p=>p.owner===n).reduce((s,p)=>s+attackPower(p),0)+
      g.provinces.reduce((s,p)=>s+unitKeys.reduce((sub,t)=>sub+(p.garrison[n]?.[t]||0)*(UNIT[t].min+UNIT[t].max)/2,0),0)+
      g.movements.filter(o=>o.nation===n).reduce((s,o)=>s+unitKeys.reduce((v,t)=>v+(o.units[t]||0)*(UNIT[t].min+UNIT[t].max)/2,0),0)}));
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
  if(g.winner){g.movements=[];writeLog(g,`Victory: ${g.winner.nations.join(' + ')} (${g.winner.mode}).`);}
  return g.winner;
}
export function tick(g,now=Date.now()){
  if(g.winner)return false;
  const elapsed=Math.max(0,Math.min(60000,now-g.lastTick));if(elapsed===0)return false;
  const prev=g.lastTick;g.lastTick=now;let changed=false;
  // Bank income is continuous per nation; unclaimed nations still accumulate.
  const bankTotals={};for(const p of g.provinces)bankTotals[p.owner]=(bankTotals[p.owner]||0)+p.buildings.bank;
  for(const [n,c] of Object.entries(bankTotals)){g.money[n]=roundMoney(g.money[n]+c*.1*elapsed/1000);changed=true;}
  for(const p of g.provinces){
    for(const kind of ['barracks','shop','airport']){
      const amount=p.buildings[kind],ms=BUILD[kind].ms;
      if(!amount)continue;
      if(p.production[kind]<=now){
        const cycles=Math.min(1000,Math.floor((now-p.production[kind])/ms)+1);
        // Each building produces one unit per cycle, locally in this province.
        p.units[BUILD[kind].unit]=Math.min(MAX_UNITS,p.units[BUILD[kind].unit]+cycles*amount);
        p.production[kind]+=cycles*ms;changed=true;
      }
    }
  }
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
  return changed;
}
function canSeeEnemy(g,nation,p,now=Date.now()){
  if(!nation)return false;
  if(p.owner===nation||relation(g,nation,p.owner)==='ally')return true;
  if(g.provinceDefinitions.get(p.id).neighbors.some(id=>g.provinces[id-1].owner===nation))return true;
  return g.movements.some(o=>o.type==='bomber'&&o.nation===nation&&o.to===p.id&&o.attacking&&o.arrivalAt-now<=10000);
}
export function viewFor(g,nation,now=Date.now(),options={allyMoves:true,hostileMoves:true}){
  const provinces=g.provinces.map(p=>{
    const visible=canSeeEnemy(g,nation,p,now);
    return {id:p.id,owner:p.owner,units:visible?{...p.units}:null,
      garrison:visible?structuredClone(p.garrison):null,buildings:visible?{...p.buildings}:null,
      production:visible?{...p.production}:null,visible};
  });
  const movements=g.movements.filter(o=>{
    if(o.nation===nation)return true;
    if(options.allyMoves&&nation&&relation(g,nation,o.nation)==='ally')return true;
    return !!(options.hostileMoves&&nation&&o.attacking&&relation(g,nation,o.nation)==='war'&&
      g.provinces[o.to-1].owner===nation&&o.arrivalAt-now<=20000);
  }).map(o=>({...o}));
  return {provinces,occupied:[],money:nation?g.money[nation]:null,rankings:rankings(g),
    campaignDay:Math.max(0,Math.floor((now-g.campaignStartAt)/(g.map.secondsPerDay||10)/1000)),
    winner:g.winner,diplomacy:g.diplomacy,requests:g.requests,peaceRequests:g.peaceRequests,
    movements,log:g.log,chat:g.chat.filter(m=>m.to==='all'||m.nation===nation||m.to===nation),hopMs:g.hopMs,serverTime:now};
}
