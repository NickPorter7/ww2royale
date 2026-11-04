/* Shared public war history and private combat reports. Server only. Do not
   publish hidden unit strength in global headlines. Both arrays stay bounded
   so 55-minute matches cannot exhaust server memory. */
export const MAX_WAR_EVENTS=120;
export const MAX_BATTLE_REPORTS=80;
const playableName=(g,code)=>g.map.nations[code]?.name||code;
function cap(arr,length){if(arr.length>length)arr.splice(0,arr.length-length);}
export function publishWarEvent(g,kind,{actor=null,target=null,province=null,summary=null}={},at=Date.now()){
  if(!g.warEvents)g.warEvents=[];
  const place=province?g.provinceDefinitions.get(province)?.name:null;
  const actorName=actor?playableName(g,actor):null;
  const targetName=target?playableName(g,target):null;
  let headline='WAR IN EUROPE';
  if(kind==='declareWar') headline=`${actorName} Declares War on ${targetName}`;
  if(kind==='alliance') headline=`${actorName} and ${targetName} Form Alliance`;
  if(kind==='peace') headline=`Peace Signed: ${actorName} and ${targetName}`;
  if(kind==='allianceBroken') headline=`${actorName} Ends Alliance with ${targetName}`;
  if(kind==='statement') headline=`Statement from ${actorName}`;
  if(kind==='capitalFall') headline=`${(place||'A Capital').toUpperCase()} HAS FALLEN`;
  if(kind==='newCapital') headline=`${actorName} Establishes New Capital`;
  if(kind==='landBattle') headline=`Battle of ${place||'Europe'}`;
  if(kind==='navalBattle') headline=`Naval Battle near ${place||'Europe'}`;
  if(kind==='victory') headline=`VICTORY: ${actorName}`;
  const safeSummary=summary??(
    kind==='capitalFall'?`${actorName} captured the designated capital of ${targetName}.`:
    kind==='newCapital'?`${actorName} relocated its seat of government to ${place}.`:
    kind==='landBattle'?`${actorName} fought ${targetName} near ${place}.`:
    kind==='navalBattle'?`${actorName} clashed with ${targetName} off ${place}.`:
    `${actorName||'A nation'} — ${targetName||'war dispatch'}.`);
  const item={id:(g.nextWarEventId??1),kind,actor,target,province,headline,summary:safeSummary,at};
  g.nextWarEventId=item.id+1;g.warEvents.unshift(item);cap(g.warEvents,MAX_WAR_EVENTS);
  return item;
}
const sanitizeUnits=u=>Object.fromEntries(['infantry','tank','bomber','destroyer','submarine','battleship'].map(k=>[k,Math.max(0,Math.floor(Number(u?.[k])||0))]).filter(([,n])=>n>0));
export function recordBattle(g,{kind='land',attacker,defender,province,attackerBefore={},attackerAfter={},defenderBefore={},defenderAfter={},won=false,at=Date.now()}={}){
  if(!g.battleReports)g.battleReports=[];
  const report={id:g.nextBattleReportId??1,kind,attacker,defender,province,at,won:!!won,
    attackerBefore:sanitizeUnits(attackerBefore),attackerAfter:sanitizeUnits(attackerAfter),
    defenderBefore:sanitizeUnits(defenderBefore),defenderAfter:sanitizeUnits(defenderAfter)};
  g.nextBattleReportId=report.id+1;g.battleReports.unshift(report);cap(g.battleReports,MAX_BATTLE_REPORTS);
  publishWarEvent(g,kind==='naval'?'navalBattle':'landBattle',{actor:attacker,target:defender,province,
    summary:kind==='naval'?`${playableName(g,attacker)} and ${playableName(g,defender)} exchanged fire near ${g.provinceDefinitions.get(province)?.name}.`:
      `${playableName(g,attacker)} ${won?'captured':'attacked'} ${g.provinceDefinitions.get(province)?.name} in fighting with ${playableName(g,defender)}.`},at);
  return report;
}
export function battleReportsFor(g,nation){
  if(!nation)return [];
  // In particular, do not leak hidden stacks or losses to bystanders.
  return (g.battleReports||[]).filter(r=>r.attacker===nation||r.defender===nation).slice(0,40);
}

export function publishCommanderStatement(g,nation,message,at=Date.now()){
  if(g.winner||!g.map.nations[nation]?.playable)throw Error('Only active commanders can publish statements.');
  if(typeof message!=='string')throw Error('Write a statement first.');
  const body=message.trim().replace(/[\x00-\x1f\x7f]/g,' ');
  if(body.length<5||body.length>160)throw Error('Statements must be 5–160 characters.');
  if(/(?:https?:\/\/|www\.|discord\.gg\/)/i.test(body))throw Error('Links are not allowed in war statements.');
  if(!g.statementCooldown)g.statementCooldown={};
  const last=g.statementCooldown[nation]??-Infinity;
  if(at-last<90000)throw Error('Please wait 90 seconds between war statements.');
  const event=publishWarEvent(g,'statement',{actor:nation,summary:body},at);
  g.statementCooldown[nation]=at;
  return event;
}
