from pathlib import Path
root=Path(__file__).resolve().parent.parent
p=root/'client/main.js'
s=p.read_text()
needle="function hexToRgb(hex){return [1,3,5].map(i=>parseInt(hex.substring(i,i+2),16));}"
ins='''
// Local historical flag assets; never sourced from a remote image server.
function nationFlag(code,extraClass=''){
  const flag=document.createElement('img');flag.className='nation-flag '+extraClass;
  flag.alt=(nationNames[code]||code||'Unknown')+' · 1939 flag';
  flag.src=code&&map?.nations[code]?`/assets/flags/${code}.svg`:'/assets/flags/GB.svg';
  flag.loading='lazy';flag.decoding='async';return flag;
}
function showNationIdentity(element,code,extra=''){
  element.replaceChildren(nationFlag(code),document.createTextNode((nationNames[code]||code||'Unknown')+(extra?' · '+extra:'')));
}
function effectiveOrderKind(){
  if(!draftTarget||!game)return actionMode;
  const rel=relationWith(game.provinces[draftTarget-1]?.owner);
  return rel==='neutral'||rel==='war'?'attack':'move';
}
function selectedArmyIcon(units){return units?.bomber>0?'bomber':units?.tank>0?'tank':'infantry';}
function drawUnitIcon(x,y,type,tint,alpha=1){
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);
  ctx.fillStyle='rgba(8,18,23,.95)';ctx.strokeStyle=tint;ctx.lineWidth=1.8;
  ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=tint;ctx.strokeStyle=tint;ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';
  if(type==='bomber'){
    ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(3,-3);ctx.lineTo(13,3);ctx.lineTo(13,7);ctx.lineTo(3,5);ctx.lineTo(3,10);ctx.lineTo(7,12);ctx.lineTo(-7,12);ctx.lineTo(-3,10);ctx.lineTo(-3,5);ctx.lineTo(-13,7);ctx.lineTo(-13,3);ctx.lineTo(-3,-3);ctx.closePath();ctx.fill();
  }else if(type==='tank'){
    ctx.fillRect(-11,0,22,7);ctx.fillRect(-8,-6,14,8);ctx.fillRect(4,-5,9,3);
    ctx.fillStyle='#142630';for(let a=-7;a<=7;a+=7){ctx.beginPath();ctx.arc(a,4,1.5,0,Math.PI*2);ctx.fill();}
  }else{
    ctx.beginPath();ctx.arc(0,-7,4,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(0,9);ctx.moveTo(-7,2);ctx.lineTo(7,2);ctx.moveTo(0,9);ctx.lineTo(-6,13);ctx.moveTo(0,9);ctx.lineTo(6,13);ctx.stroke();
  }
  ctx.restore();
}
'''
assert needle in s;s=s.replace(needle,needle+ins)
# actual movement icon instead of triangular arrow
old='''    const theta=Math.atan2(pts[i+1].y-pts[i].y,pts[i+1].x-pts[i].x);
    ctx.save();ctx.translate(x,y);ctx.rotate(theta);
    ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-9,-7);ctx.lineTo(-4,0);ctx.lineTo(-9,7);ctx.closePath();
    ctx.fillStyle=tint;ctx.strokeStyle='#18232a';ctx.lineWidth=2.4;ctx.fill();ctx.stroke();ctx.restore();'''
new='''    // The highest-tier unit present determines the moving-army icon:
    // bomber > tank > infantry. No triangular route arrowhead.
    drawUnitIcon(x,y,selectedArmyIcon(order.units||{[order.type]:order.count}),tint);'''
assert old in s;s=s.replace(old,new)
needle='function drawTroops(){'
ins='''// Ghost order preview: route and advancing icon are intentionally faint until
// the player confirms. No second highlighted province outline is drawn.
function draftRoute(){
  if(!game||!selected||!draftTarget)return [];
  const from=definition.get(selected),to=definition.get(draftTarget);
  if(!from||!to)return [];
  if(armyFormUnits().infantry===0 && armyFormUnits().tank===0 && armyFormUnits().bomber>0)
    return [from,to];
  const source=selected,goal=draftTarget,queue=[source],parent=new Map([[source,null]]);
  while(queue.length){
    const cur=queue.shift();if(cur===goal)break;
    for(const n of definition.get(cur)?.neighbors||[]){
      if(parent.has(n))continue;
      const owner=game.provinces[n-1]?.owner,rel=relationWith(owner);
      if(n!==goal&&!['self','ally'].includes(rel))continue;
      parent.set(n,cur);queue.push(n);
    }
  }
  if(!parent.has(goal))return [from,to];
  const path=[];for(let cur=goal;cur!==null;cur=parent.get(cur))path.push(definition.get(cur));
  return path.reverse();
}
function drawDraftRoute(){
  if(!selected||!draftTarget||!actionMode)return;
  const pts=draftRoute();if(pts.length<2)return;
  const hostile=effectiveOrderKind()==='attack';
  const tint=hostile?'#ff9892':'#eac978';
  ctx.save();ctx.globalAlpha=.45;ctx.lineWidth=2.8;ctx.strokeStyle=tint;
  ctx.lineCap='round';ctx.setLineDash([9,9]);ctx.lineDashOffset=-performance.now()/100;ctx.beginPath();
  ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();ctx.setLineDash([]);
  // A faint arrow at the destination communicates intended direction.
  const end=pts.at(-1),prev=pts.at(-2),angle=Math.atan2(end.y-prev.y,end.x-prev.x);
  ctx.save();ctx.translate(end.x,end.y);ctx.rotate(angle);ctx.fillStyle=tint;
  ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-8,-5);ctx.lineTo(-8,5);ctx.closePath();ctx.fill();ctx.restore();
  let total=0;const lengths=[];for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lengths.push(d);total+=d;}
  let travelled=(performance.now()/21)%Math.max(1,total),x=pts[0].x,y=pts[0].y;
  for(let i=0;i<lengths.length;i++){
    if(travelled<=lengths[i]){const t=travelled/Math.max(1,lengths[i]);x=pts[i].x+(pts[i+1].x-pts[i].x)*t;y=pts[i].y+(pts[i+1].y-pts[i].y)*t;break;}
    travelled-=lengths[i];
  }
  drawUnitIcon(x,y,selectedArmyIcon(armyFormUnits()),tint,.85);
  ctx.restore();queueRender();
}
'''
assert needle in s;s=s.replace(needle,ins+needle)
s=s.replace('drawLabels();drawMovements();','drawLabels();drawMovements();drawDraftRoute();')
s=s.replace("drawOutline(selected,'#ffdc87',4);drawOutline(draftTarget,'#85eeec',3);", "drawOutline(draftTarget?null:selected,'#ffdc87',4);")
# selected province should not auto open army menu
s=s.replace("  if(selected)setPanel('army');else if(activePanel==='army'||activePanel==='buildings')setPanel(null);", "  // Province taps never open a menu automatically. Build remains an explicit action.\n  if(!selected&&(activePanel==='army'||activePanel==='buildings'))setPanel(null);")
# New effective attack behavior and neutral-only confirmation
start=s.index('function dispatch(kind){')
end=s.index('function updateArmyReadouts(){',start)
s=s[:start]+'''function dispatch(kind){
  if(!selected||!draftTarget||!assigned)return notice('Select a destination province.');
  const units=armyFormUnits(),state=game.provinces[selected-1];
  const stack=state.owner===assigned?state.units:state.garrison?.[assigned];
  if(!['infantry','tank','bomber'].every(t=>Number.isSafeInteger(units[t])&&units[t]>=0&&units[t]<=(stack?.[t]||0))||!unitTotal(units))
    return notice('Select valid troop quantities.');
  const rel=relationWith(game.provinces[draftTarget-1].owner);
  const actualKind=rel==='neutral'||rel==='war'?'attack':'move';
  const command={from:selected,to:draftTarget,units,kind:actualKind,autoDeclareWar:rel==='neutral'};
  if(rel==='neutral'){
    // Only a neutral target causes a SECOND warning; the server declares war
    // on dispatch after this explicit confirmation.
    showAttackConfirmation({event:'move',data:command},`Confirm attack: this will declare war with ${nationNames[game.provinces[draftTarget-1].owner]}.`);
    return;
  }
  socket.emit('move',command);clearDeployment();
}
function currentOrderValidity(){
  if(!game||!selected||!actionMode)return {valid:false,message:'Select a starting province.'};
  const source=game.provinces[selected-1];
  const stack=source.owner===assigned?source.units:source.garrison?.[assigned];
  const units=armyFormUnits();
  if(!['infantry','tank','bomber'].every(t=>Number.isSafeInteger(units[t])&&units[t]>=0&&units[t]<=(stack?.[t]||0))||!unitTotal(units))
    return {valid:false,message:'Choose at least one available unit.'};
  if(!draftTarget)return {valid:false,message:'Click a destination province on the map.'};
  const rel=relationWith(game.provinces[draftTarget-1].owner);
  if(actionMode==='attack'&&(rel==='self'||rel==='ally'))return {valid:false,message:'Choose Move for your or allied territory.'};
  return {valid:true,message:rel==='neutral'?'This neutral attack requires an explicit war declaration confirmation.':`Ready to ${effectiveOrderKind()}. Confirm to dispatch.`};
}
'''+s[end:]
s=s.replace("$('confirmOrderBtn').classList.toggle('is-attack',actionMode==='attack');", "$('confirmOrderBtn').classList.toggle('is-attack',effectiveOrderKind()==='attack');")
s=s.replace("$('confirmOrderBtn').querySelector('span').textContent=actionMode==='attack'?'Confirm attack':'Confirm move';", "$('confirmOrderBtn').querySelector('span').textContent=effectiveOrderKind()==='attack'?'Confirm attack':'Confirm move';")
s=s.replace("  $('destinationRelation').textContent=rel==='war'?'Hostile — Attack order required'", "  $('destinationRelation').textContent=rel==='war'?'Hostile — Attack order'")
# flag in settings, panel headers, selection, build, rank, nation modal, diplomacy, messages
s=s.replace("  $('myFlag').style.backgroundColor=assigned?nationColor[assigned]:'#536168';", "  $('myFlag').replaceChildren(assigned?nationFlag(assigned):document.createTextNode('—'));\n  const badge=$('panelIdentity');if(badge){badge.hidden=!assigned;if(assigned)showNationIdentity(badge,assigned);}")
s=s.replace("    $('selectionOwner').textContent=state?nationNames[state.owner]:'';", "    if(state)showNationIdentity($('selectionOwner'),state.owner,map.nations[state.owner]?.capital===p?.name?'CAPITAL':'');")
s=s.replace("    $('buildingProvinceOwner').textContent=state?nationNames[state.owner]:'';", "    if(state)showNationIdentity($('buildingProvinceOwner'),state.owner,map.nations[state.owner]?.capital===p?.name?'CAPITAL':'');")
s=s.replace("    row.append(color,elem('span',`${rank.place}. ${nationNames[rank.nation]}`,'rank-name')", "    row.append(nationFlag(rank.nation),elem('span',`${rank.place}. ${nationNames[rank.nation]}`,'rank-name')")
s=s.replace("    const swatch=elem('span','','swatch');swatch.style.background=nationColor[id];b.prepend(swatch);out.append(b);", "    b.prepend(nationFlag(id));out.append(b);")
s=s.replace("  panel.append(elem('p',`Relationship with ${nationNames[n]}: ${rel.toUpperCase()}`,'diplomacy-heading'));", "  const relationHeading=elem('p','', 'diplomacy-heading');relationHeading.append(nationFlag(n),document.createTextNode(` ${nationNames[n]} · ${rel.toUpperCase()}`));panel.append(relationHeading);")
s=s.replace("    row.append(createButton('Accept'", "    row.prepend(nationFlag(item.from));row.append(createButton('Accept'")
s=s.replace("    const name=elem('strong',nationNames[m.nation]+(m.to==='all'?' [GLOBAL]':' [PRIVATE → '+nationNames[m.to]+']')+': ');name.style.color=nationColor[m.nation];line.append(name,document.createTextNode(m.text));view.append(line);", "    const name=elem('strong',nationNames[m.nation]+(m.to==='all'?' [GLOBAL]':' [PRIVATE → '+nationNames[m.to]+']')+': ');line.append(nationFlag(m.nation),name,document.createTextNode(m.text));view.append(line);")
# set render chat recipient flag and diplomacy selected flag integrated header; panel identity enough
# no automatic province-selected panel but keep manual direct icons
p.write_text(s)
print('client script patched')
