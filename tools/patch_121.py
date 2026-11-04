from pathlib import Path
p=Path(__file__).resolve().parents[1]
g=p/'server/game.js'
s=g.read_text()
assert "export const UNIT={infantry" in s
s=s.replace("/* WW2 Royale 1.5 — independent authoritative game rules. */", "/* WW2 Royale 1.21 — authoritative rules and balanced pacing. */\nimport {SHIP,SHIP_KEYS,fleetEmpty,buyShips,orderFleet,tickNavy} from './naval.js';\nexport {SHIP};")
s=s.replace("export const UNIT={infantry:{hp:20,min:10,max:12,role:'land'},tank:{hp:100,min:20,max:30,role:'land'},bomber:{hp:50,min:35,max:40,role:'air'}};",
"export const UNIT={infantry:{hp:24,min:7,max:9,role:'land'},tank:{hp:95,min:18,max:25,role:'land'},bomber:{hp:42,min:30,max:38,role:'air'}};")
s=s.replace("export const BUILD={barracks:{cost:20,max:1},workshop:{cost:90,max:1},airport:{cost:175,max:2},bank:{cost:50,max:3},defense:{cost:200,max:1}};",
"export const BUILD={barracks:{cost:25,max:1},workshop:{cost:65,max:1},airport:{cost:125,max:2},bank:{cost:60,max:3},defense:{cost:150,max:1},port:{cost:105,max:1},capital:{cost:245,max:1}};")
s=s.replace("export const UNIT_COST={infantry:15,tank:75,bomber:150,balloon:200};",
"export const UNIT_COST={infantry:12,tank:55,bomber:110,balloon:180};")
s=s.replace("export const START_MONEY=100, HOP_MS=5000, MAX_UNITS=100000;",
"export const START_MONEY=175, HOP_MS=5000, MAX_UNITS=100000;\nexport const BANK_PER_SECOND=.18, PUBLIC_MATCH_MS=55*60*1000;")
s=s.replace("export const MOVE_MS={infantry:15000,tank:30000,bomber:10500};",
"export const MOVE_MS={infantry:11000,tank:20000,bomber:8500};")
s=s.replace("const buildings=()=>({barracks:1,workshop:0,airport:0,bank:1,defense:0});",
"const buildings=()=>({barracks:1,workshop:0,airport:0,bank:1,defense:0,port:0,capital:0});")
s=s.replace("provinces:map.provinces.map(p=>({id:p.id,owner:p.nation,units:{...troops(),infantry:p.troops},garrison:{},buildings:buildings(),defenseReady:true})),",
"provinces:map.provinces.map(p=>({id:p.id,owner:p.nation,units:{...troops(),infantry:p.troops},fleet:fleetEmpty(),garrison:{},buildings:{...buildings(),capital:p.capital?1:0},defenseReady:true})),")
s=s.replace("money:Object.fromEntries(nations.map(n=>[n,START_MONEY])),",
"money:Object.fromEntries(nations.map(n=>[n,START_MONEY])),\n    capitals:Object.fromEntries(nations.map(n=>[n,map.provinces.find(p=>p.nation===n&&p.capital)?.id||map.provinces.find(p=>p.nation===n)?.id||null])),\n    timeLimitMs:0,")
s=s.replace("diplomacy:{},requests:[],peaceRequests:[],movements:[],spyBalloons:[]",
"diplomacy:{},requests:[],peaceRequests:[],movements:[],navalMovements:[],spyBalloons:[]")
# export capital helper next to ally
s=s.replace("export function ally(g,nation){return Object.keys(g.map.nations).find(n=>n!==nation&&relation(g,nation,n)==='ally')||null;}",
"export function ally(g,nation){return Object.keys(g.map.nations).find(n=>n!==nation&&relation(g,nation,n)==='ally')||null;}\nexport function capitalControlled(g,nation){const id=g.capitals?.[nation];return !!(id&&g.provinces[id-1]?.owner===nation);}\nexport function commissionShip(g,nation,province,type,amount){return buyShips(g,nation,province,type,amount);}\nexport function sailFleet(g,nation,data,now=Date.now()){return orderFleet(g,nation,data,now,changeDiplomacy);}")
# battle effects
s=s.replace("  const attack={...order.healthByType};\n  const defend=createPool(target.units);",
"  const attackMultiplier=capitalControlled(g,order.nation)?1:.8;\n  const defenseMultiplier=capitalControlled(g,target.owner)?1:.8;\n  const attack=Object.fromEntries(unitKeys.map(t=>[t,order.healthByType[t]*attackMultiplier]));\n  const defend=createPool(target.units,defenseMultiplier);")
s=s.replace("    const attUnits=poolUnits(attack),defUnits=poolUnits(defend),alliedUnits=poolUnits(merged(),.8);",
"    const attUnits=poolUnits(attack,attackMultiplier),defUnits=poolUnits(defend,defenseMultiplier),alliedUnits=poolUnits(merged(),.8);")
s=s.replace("    volley(g,attUnits,defend);",
"    volley(g,attUnits,defend,attackMultiplier);")
s=s.replace("    volley(g,defUnits,attack);",
"    volley(g,defUnits,attack,defenseMultiplier);")
s=s.replace("  target.units=poolUnits(defend);",
"  target.units=poolUnits(defend,defenseMultiplier);")
s=s.replace("  order.healthByType={...attack};updateFromHealth(order);",
"  order.healthByType=Object.fromEntries(unitKeys.map(t=>[t,attack[t]/attackMultiplier]));updateFromHealth(order);")
# special building
s=s.replace("  if(p.buildings[kind]>=b.max)throw Error(`Maximum ${b.max} ${kind} level(s) in this province.`);",
"  if(kind==='port'&&!g.provinceDefinitions.get(provinceId)?.coastal)throw Error('Ports can only be built in coastal provinces.');\n  if(kind==='capital'&&g.capitals[nation]===provinceId&&capitalControlled(g,nation))throw Error('This province is already your capital.');\n  if(kind!=='capital'&&p.buildings[kind]>=b.max)throw Error(`Maximum ${b.max} ${kind} level(s) in this province.`);")
s=s.replace("  p.buildings[kind]++;\n  writeLog(g,`${nation} upgraded ${kind} in ${g.provinceDefinitions.get(provinceId).name} to level ${p.buildings[kind]}.`);",
"  if(kind==='capital'){\n    const old=g.capitals[nation];if(old&&g.provinces[old-1])g.provinces[old-1].buildings.capital=0;\n    g.capitals[nation]=provinceId;p.buildings.capital=1;\n    writeLog(g,`${nation} established its new capital at ${g.provinceDefinitions.get(provinceId).name}.`);\n  }else{p.buildings[kind]++;writeLog(g,`${nation} upgraded ${kind} in ${g.provinceDefinitions.get(provinceId).name} to level ${p.buildings[kind]}.`);}")
s=s.replace("export function attackPower(p){return unitKeys.reduce((s,k)=>s+(p.units[k]||0)*(UNIT[k].min+UNIT[k].max)/2,0);}",
"export function attackPower(p){return unitKeys.reduce((s,k)=>s+(p.units[k]||0)*(UNIT[k].min+UNIT[k].max)/2,0)+SHIP_KEYS.reduce((s,k)=>s+(p.fleet[k]||0)*SHIP[k].damage,0);}")
s=s.replace("  if(g.winner){g.movements=[];writeLog(g,`Victory: ${g.winner.nations.join(' + ')} (${g.winner.mode}).`);}",
"  if(g.winner){g.movements=[];g.navalMovements=[];writeLog(g,`Victory: ${g.winner.nations.join(' + ')} (${g.winner.mode}).`);}")
s=s.replace("  if(g.winner)return false;\n  const elapsed=Math.max(0,Math.min(60000,now-g.lastTick));",
"  if(g.winner)return false;\n  if(g.timeLimitMs>0&&now-g.campaignStartAt>=g.timeLimitMs){\n    const winner=rankings(g).find(r=>g.map.nations[r.nation]?.playable);\n    if(winner){g.winner={nations:[winner.nation],mode:'time-limit'};g.movements=[];g.navalMovements=[];writeLog(g,`Time expired: ${winner.nation} wins on ranking.`);return true;}\n  }\n  const elapsed=Math.max(0,Math.min(60000,now-g.lastTick));")
s=s.replace("g.money[n]=roundMoney(g.money[n]+c*.1*elapsed/1000)", "g.money[n]=roundMoney(g.money[n]+c*BANK_PER_SECOND*elapsed/1000)")
s=s.replace("  g.movements=g.winner?[]:pending;\n  return changed;",
"  g.movements=g.winner?[]:pending;\n  if(tickNavy(g,now))changed=true;\n  return changed;")
s=s.replace("    return {id:p.id,owner:p.owner,units:visible?{...p.units}:null,",
"    return {id:p.id,owner:p.owner,units:visible?{...p.units}:null,fleet:visible?{...p.fleet}:null,")
s=s.replace("  return {provinces,occupied:[],money:nation?g.money[nation]:null,rankings:rankings(g),",
"  const navalMovements=g.navalMovements.filter(o=>o.nation===nation||(nation&&relation(g,nation,o.nation)==='ally')||\n    (nation&&o.attacking&&g.provinces[o.to-1].owner===nation&&o.arrivalAt-now<20000));\n  return {provinces,occupied:[],money:nation?g.money[nation]:null,rankings:rankings(g),\n    capitals:{...g.capitals},capitalStatus:Object.fromEntries(Object.keys(g.capitals).map(n=>[n,capitalControlled(g,n)])),\n    navalMovements:navalMovements.map(o=>({...o})), matchLimitSeconds:g.timeLimitMs/1000,")
s=s.replace(" * October 6 arrives exactly 20 real minutes after the last anniversary.", " * October 6 arrives exactly 15 real minutes after the last anniversary.")
g.write_text(s)
print('patched game.js')
