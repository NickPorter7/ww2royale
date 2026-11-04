/* WW2 Royale 1.21: authoritative coastal-port naval combat and sea lanes.
   Naval units travel through an abstract sea-lane network between coastal provinces.
   Naval victories blockade/bombard; ships NEVER capture land provinces. */
import {nationModifier,discountedPrice} from './traits.js';
import {recordBattle} from './war-events.js';
import {winterSeverityAt,winterNavalDurationMs} from './weather.js';
export const SHIP = Object.freeze({
  destroyer:{hp:105,damage:25,cost:88},
  submarine:{hp:80,damage:32,cost:100},
  battleship:{hp:240,damage:48,cost:225}
});
export const SHIP_KEYS=Object.keys(SHIP);
export const NAVAL_BASE_MS=12000;
export const NAVAL_MS_PER_PX=75;
export const fleetEmpty=()=>({destroyer:0,submarine:0,battleship:0});
export const totalShips=ships=>SHIP_KEYS.reduce((s,k)=>s+(ships?.[k]||0),0);
const round2=n=>Math.round(n*100)/100;
const relation=(g,a,b)=>a===b?'self':g.diplomacy[[a,b].sort().join(':')]||'neutral';
export function buyShips(g,nation,province,type,amount=1){
  const p=g.provinces[province-1],definition=g.provinceDefinitions.get(province);
  if(g.winner||!p||p.owner!==nation||!definition?.coastal)throw Error('Ships require your own coastal province.');
  if(p.buildings.port<1)throw Error('Build a port before commissioning ships.');
  if(!SHIP[type]||!Number.isSafeInteger(amount)||amount<1||amount>20)throw Error('Invalid naval purchase.');
  const total=round2(discountedPrice(SHIP[type].cost,nation,'shipCost')*amount);
  if(g.money[nation]<total)throw Error('Insufficient funds for naval units.');
  g.money[nation]=round2(g.money[nation]-total);p.fleet[type]+=amount;
  g.log.unshift(`${nation} commissioned ${amount} ${type}${amount===1?'':'s'} at ${definition.name}.`);
  g.log.length=Math.min(16,g.log.length);
  return {province,type,amount,total};
}
export function orderFleet(g,nation,data,now=Date.now(),declareWar=null){
  if(g.winner)throw Error('Match finished.');
  const {from,to}=data||{};
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from===to)throw Error('Choose distinct ports.');
  const source=g.provinces[from-1],destination=g.provinces[to-1],a=g.provinceDefinitions.get(from),b=g.provinceDefinitions.get(to);
  if(!source||!destination||!a?.coastal||!b?.coastal)throw Error('Naval operations require coastal provinces.');
  if(source.owner!==nation||source.buildings.port<1)throw Error('Sail from one of your ports.');
  if(!data.ships||typeof data.ships!=='object'||Array.isArray(data.ships)||Object.keys(data.ships).some(k=>!SHIP[k]))throw Error('Invalid fleet selection.');
  const ships=fleetEmpty();
  for(const k of SHIP_KEYS){const n=data.ships[k]||0;if(!Number.isSafeInteger(n)||n<0||n>source.fleet[k])throw Error('Not enough ships.');ships[k]=n;}
  if(!totalShips(ships))throw Error('Select at least one ship.');
  const rel=relation(g,nation,destination.owner);
  if(rel==='neutral'&&!data.autoDeclareWar)throw Error('Confirm the declaration of war before sailing against a neutral nation.');
  if(rel==='neutral'&&typeof declareWar!=='function')throw Error('War declaration unavailable.');
  const distance=Math.hypot(a.x-b.x,a.y-b.y);
  const duration=winterNavalDurationMs(NAVAL_BASE_MS+distance*NAVAL_MS_PER_PX,winterSeverityAt(g,now));
  // Only after all validation succeeds do we spend ships or change diplomacy.
  if(rel==='neutral')declareWar(g,nation,destination.owner,'declareWar');
  for(const k of SHIP_KEYS)source.fleet[k]-=ships[k];
  const order={id:g.nextOrder++,nation,from,to,ships,healthByType:Object.fromEntries(SHIP_KEYS.map(k=>[k,ships[k]*SHIP[k].hp])),
    startedAt:now,arrivalAt:now+duration,naval:true,returning:false,
    attacking:rel==='war'||rel==='neutral',start:{x:a.x,y:a.y},end:{x:b.x,y:b.y}};
  g.navalMovements.push(order);g.events.push({kind:'navalOrder',order:order.id,nation});
  if(g.events.length>300)g.events.splice(0,g.events.length-300);return order;
}
const capitalOk=(g,n)=>!!g.capitals?.[n]&&g.provinces[g.capitals[n]-1]?.owner===n;
function healthShips(hp){return Object.fromEntries(SHIP_KEYS.map(k=>[k,Math.max(0,Math.ceil((hp[k]||0)/SHIP[k].hp-1e-9))]));}
function damageFleet(pool,amount){
  for(const k of ['destroyer','submarine','battleship']){
    const d=Math.min(pool[k]||0,amount);pool[k]-=d;amount-=d;if(amount<=0)break;
  }
}
function volley(g,attack,defender,modifier,subHunters=false,nation=null){
  const n=healthShips(attack);
  let damage=0;
  for(const k of SHIP_KEYS){
    const multi=k==='destroyer'&&subHunters?1.6:k==='submarine'&&(defender.battleship||0)>0?1.5:1;
    damage+=(n[k]||0)*SHIP[k].damage*multi*(.88+g.random()*.24);
  }
  damageFleet(defender,damage*modifier*nationModifier(nation,'navalDamage'));
}
function harbor(g,order){const p=g.provinces[order.to-1];if(!p)return;
  // No teleporting or disappearing at allied ports. Allied docking is handled
  // by a return voyage unless the destination is owned by the fleet's nation.
  const home=p.owner===order.nation?p:g.provinces[order.from-1];
  if(!home||home.owner!==order.nation)return;
  const ships=healthShips(order.healthByType);for(const k of SHIP_KEYS)home.fleet[k]=Math.min(1000,home.fleet[k]+ships[k]);
}
function navalBattle(g,order,now){
  const target=g.provinces[order.to-1];
  const defenderNation=target.owner;
  const beforeAttacker={...order.ships},beforeDefender={...target.fleet,...target.units};
  const aMod=capitalOk(g,order.nation)?1:.8,dMod=capitalOk(g,target.owner)?1:.8;
  const a=Object.fromEntries(SHIP_KEYS.map(k=>[k,order.healthByType[k]*aMod]));
  const d=Object.fromEntries(SHIP_KEYS.map(k=>[k,target.fleet[k]*SHIP[k].hp*dMod]));
  for(let i=0;i<18&&totalShips(healthShips(a))&&totalShips(healthShips(d));i++){
    volley(g,a,d,aMod,true,order.nation);if(totalShips(healthShips(d)))volley(g,d,a,dMod,true,defenderNation);
  }
  const remaining=healthShips(d);
  for(const k of SHIP_KEYS)target.fleet[k]=remaining[k];
  if(!totalShips(healthShips(a))){
    recordBattle(g,{kind:'naval',attacker:order.nation,defender:defenderNation,province:order.to,
      attackerBefore:beforeAttacker,attackerAfter:{},defenderBefore:beforeDefender,defenderAfter:{...remaining,...target.units},won:false,at:now});
    g.log.unshift(`${order.nation} lost its fleet near ${g.provinceDefinitions.get(order.to).name}.`);return null;}
  const survived=healthShips(a);
  // Damage to coastal defenders, without occupying or changing land ownership.
  const bombard=survived.battleship*22+survived.destroyer*4;
  if(bombard>0){
    let damage=bombard;
    for(const [k,hp] of [['infantry',24],['tank',95]]){
      const available=target.healthByType?.[k]??target.units[k]*hp;
      const taken=Math.min(damage,available);
      target.healthByType[k]=Math.max(0,available-taken);
      target.units[k]=Math.max(0,Math.ceil(target.healthByType[k]/hp-1e-9));
      damage-=taken;if(damage<=0)break;
    }
  }
  const name=g.provinceDefinitions.get(order.to).name;
  g.log.unshift(`${order.nation} won a naval clash near ${name}; coastal bombardment inflicted damage.`);
  g.log.length=Math.min(16,g.log.length);
  recordBattle(g,{kind:'naval',attacker:order.nation,defender:defenderNation,province:order.to,
    attackerBefore:beforeAttacker,attackerAfter:survived,defenderBefore:beforeDefender,defenderAfter:{...remaining,...target.units},
    won:!totalShips(remaining),at:now});
  order.healthByType=Object.fromEntries(SHIP_KEYS.map(k=>[k,a[k]/aMod]));
  const home=g.provinceDefinitions.get(order.from),dest=g.provinceDefinitions.get(order.to);
  const duration=winterNavalDurationMs(NAVAL_BASE_MS+Math.hypot(home.x-dest.x,home.y-dest.y)*NAVAL_MS_PER_PX,winterSeverityAt(g,now));
  return {...order,id:g.nextOrder++,from:order.to,to:order.from,start:{x:dest.x,y:dest.y},end:{x:home.x,y:home.y},
    startedAt:now,arrivalAt:now+duration,returning:true,attacking:false};
}
function sailHome(g,order,now){
  const base=g.provinceDefinitions.get(order.from),target=g.provinceDefinitions.get(order.to);
  const duration=winterNavalDurationMs(NAVAL_BASE_MS+Math.hypot(base.x-target.x,base.y-target.y)*NAVAL_MS_PER_PX,winterSeverityAt(g,now));
  return {...order,id:g.nextOrder++,from:order.to,to:order.from,start:{x:target.x,y:target.y},end:{x:base.x,y:base.y},
    returning:true,attacking:false,startedAt:now,arrivalAt:now+duration};
}
export function tickNavy(g,now){
  const previous=g.navalMovements.length;if(!previous)return false;
  const remaining=[];let changed=false;
  for(const order of g.navalMovements){
    if(now<order.arrivalAt){remaining.push(order);continue;}
    changed=true;
    if(order.returning){harbor(g,order);continue;}
    const status=relation(g,order.nation,g.provinces[order.to-1].owner);
    if(status==='war'){const back=navalBattle(g,order,now);if(back)remaining.push(back);}
    else if(status==='self')harbor(g,order);
    else if(status==='ally')remaining.push(sailHome(g,order,now));
    else{
      order.returning=true;order.attacking=false;
      const a=g.provinceDefinitions.get(order.to),b=g.provinceDefinitions.get(order.from);
      const duration=winterNavalDurationMs(NAVAL_BASE_MS+Math.hypot(a.x-b.x,a.y-b.y)*NAVAL_MS_PER_PX,winterSeverityAt(g,now));
      remaining.push({...order,from:order.to,to:order.from,start:{x:a.x,y:a.y},end:{x:b.x,y:b.y},
        startedAt:now,arrivalAt:now+duration});
    }
  }
  g.navalMovements=remaining;return changed;
}
