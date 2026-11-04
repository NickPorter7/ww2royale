from pathlib import Path
p=Path(__file__).resolve().parents[1]
html=p/'client/index.html'
s=html.read_text()
# make account/input accessible
s=s.replace('<div class="lobby-grid">', '<div class="player-name-row"><label for="playerNameInput">YOUR COMMANDER NAME</label><input id="playerNameInput" type="text" maxlength="20" minlength="2" autocomplete="nickname" placeholder="Enter your username" aria-label="Your username"></div><div class="lobby-grid">',1)
s=s.replace('1 in-game year every 20 minutes', '1 in-game year every 15 minutes · Public matches last up to 55 minutes')
s=s.replace('id="movingArmyIcon"', 'id="movingArmyIcon"')
html.write_text(s)

js=p/'client/main.js'
s=js.read_text()
s=s.replace('let selectedSources=[], selectingMore=false, focusedOrderId=null;',"let selectedSources=[], selectingMore=false, focusedOrderId=null;\nlet navalMode=false, navalSelection=null;")
s=s.replace("const AUDIO_FILES = {", "const AUDIO_FILES = {")
# Handle labels
s=s.replace("      const name=nationNames[g.owner]?.toUpperCase();", "      const name=nationNames[g.owner]?.toUpperCase();")
# Paint health bars for moving army using server order hp
needle="    drawUnitIcon(x,y,selectedArmyIcon(order.units||{[order.type]:order.count}),tint);"
insert="""    drawUnitIcon(x,y,selectedArmyIcon(order.units||{[order.type]:order.count}),tint);
    const maxHP=(order.units?.infantry||0)*24+(order.units?.tank||0)*95+(order.units?.bomber||0)*42;
    const remainingHP=Object.values(order.healthByType||{}).reduce((total,value)=>total+Number(value||0),0);
    const health=maxHP?Math.max(0,Math.min(1,remainingHP/maxHP)):1;
    ctx.save();ctx.fillStyle='rgba(5,15,19,.90)';ctx.fillRect(x-21,y+22,42,6);
    ctx.fillStyle=health>.6?'#69ce81':health>.28?'#f2c05c':'#de6866';ctx.fillRect(x-20,y+23,40*health,4);ctx.restore();"""
assert needle in s;s=s.replace(needle,insert)
# redraw naval movements including health
needle='function drawSpyBalloons(){'
naval_draw="""function drawNavalMovements(){
  if(!game?.navalMovements?.length) return;
  const now=gameNow();
  for(const fleet of game.navalMovements){
    const duration=Math.max(1,fleet.arrivalAt-fleet.startedAt),t=Math.max(0,Math.min(1,(now-fleet.startedAt)/duration));
    const a=fleet.start,b=fleet.end;
    if(!a||!b)continue;
    const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
    const friendly=fleet.nation===assigned;
    const tint=friendly?'#e6d18d':'#dd7b6f';
    ctx.save();ctx.strokeStyle=tint;ctx.lineWidth=2.4;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
    const icon=unitArt.battleship;
    if(icon?.complete)ctx.drawImage(icon,x-22,y-22,44,44);
    else{ctx.fillStyle=tint;ctx.fillRect(x-10,y-4,20,8);}
    const hp=Object.values(fleet.healthByType||{}).reduce((v,n)=>v+Number(n||0),0);
    const max=(fleet.ships?.destroyer||0)*105+(fleet.ships?.submarine||0)*80+(fleet.ships?.battleship||0)*240;
    const ratio=max?Math.min(1,hp/max):1;
    ctx.fillStyle='#10212a';ctx.fillRect(x-20,y+22,40,5);
    ctx.fillStyle=ratio>.5?'#75cf82':'#e4a46c';ctx.fillRect(x-20,y+22,40*ratio,5);
    ctx.restore();
  }
}
"""
assert needle in s;s=s.replace(needle,naval_draw+needle)
s=s.replace('drawLabels();drawMovements();drawDraftRoute();', 'drawLabels();drawMovements();drawNavalMovements();drawDraftRoute();')
# station health bar, source not fractional, purposeful HP at starting 100% and that would not visibly change; show exact full health.
needle="    ctx.restore();\n    let line=0;\n    for(const [nation,stack] of garrisons){"
insert="""    ctx.restore();
    // Provincial garrisons begin at full HP; the bar shows readiness.
    ctx.fillStyle='rgba(9,17,20,.8)';ctx.fillRect(x-18/scale,y+11/scale,36/scale,4/scale);
    ctx.fillStyle='#73c88d';ctx.fillRect(x-17/scale,y+12/scale,34/scale,2/scale);
    let line=0;
    for(const [nation,stack] of garrisons){"""
assert needle in s;s=s.replace(needle,insert)
# national capital icon on map (after troop drawing); username label at capital
needle='function draw(){'
newfunc="""function drawCapitals(){
  if(!game?.capitals||!map) return;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  for(const [nation,id] of Object.entries(game.capitals)){
    const p=definition.get(id);if(!p)continue;
    const held=game.provinces?.[id-1]?.owner===nation;
    const caption=game.commanders?.[nation]||'';
    const x=p.x,y=p.y-32;
    ctx.fillStyle=held?'#e4c67e':'#c66b62';ctx.strokeStyle='#19242a';ctx.lineWidth=3;
    ctx.font='bold 20px Georgia,serif';ctx.strokeText('★',x,y);ctx.fillText('★',x,y);
    if(caption){ctx.font='700 11px Arial,sans-serif';
      const w=Math.min(140,Math.max(54,ctx.measureText(caption).width+16));
      ctx.fillStyle='rgba(14,27,33,.90)';ctx.fillRect(x-w/2,y-28,w,16);
      ctx.fillStyle='#f9e4b4';ctx.fillText(caption.slice(0,20),x,y-20);}
  }
  ctx.restore();
}
"""
assert needle in s;s=s.replace(needle,newfunc+needle)
s=s.replace('drawSpyBalloons();drawTroops();ctx.restore();', 'drawSpyBalloons();drawTroops();drawCapitals();ctx.restore();')
# bottom bar show fleet, capitals
s=s.replace("    {title:'INFRASTRUCTURE',items:[", "    {title:'NAVY',items:[\n      ['ico-tank',state.fleet?.destroyer||0,'DESTROYERS'],\n      ['ico-airport',state.fleet?.submarine||0,'SUBMARINES'],\n      ['ico-fort',state.fleet?.battleship||0,'BATTLESHIPS']\n    ]},\n    {title:'INFRASTRUCTURE',items:[")
s=s.replace("      ['ico-fort',state.buildings?.defense||0,'DEFENCE']", "      ['ico-fort',state.buildings?.defense||0,'DEFENCE'],\n      ['ico-airport',state.buildings?.port||0,'PORT'],\n      ['ico-bank',state.buildings?.capital||0,'CAPITAL']")
# building data
first=s.index('const BUILDING_TYPES=[');end=s.index('function renderBuildButtons(state){',first)
s=s[:first]+"""const BUILDING_TYPES=[
  {kind:'barracks',label:'Barracks',cost:25,max:1,icon:'ico-barracks',detail:'Unlocks infantry recruitment'},
  {kind:'workshop',label:'Workshop',cost:65,max:1,icon:'ico-autoshop',detail:'Unlocks tanks'},
  {kind:'airport',label:'Airport',cost:125,max:2,icon:'ico-airport',detail:'Lv1 balloons · Lv2 bombers'},
  {kind:'bank',label:'Bank',cost:60,max:3,icon:'ico-bank',detail:'$0.18/sec for each level'},
  {kind:'defense',label:'Defence system',cost:150,max:1,icon:'ico-fort',detail:'20% pre-attack defence'},
  {kind:'port',label:'Naval port',cost:105,max:1,icon:'ico-airport',detail:'Coastal only · commissions ships'},
  {kind:'capital',label:'National capital',cost:245,max:1,icon:'ico-bank',detail:'Build here to relocate · lost capital weakens forces 20%'}
];
const TRAINING_TYPES=[
  {kind:'infantry',label:'Infantry',cost:12,icon:'ico-users',requirement:'Barracks Lv1',level:()=>1},
  {kind:'tank',label:'Tank',cost:55,icon:'ico-tank',requirement:'Workshop Lv1',level:()=>1},
  {kind:'balloon',label:'Spy balloon',cost:180,icon:'ico-airport',requirement:'Airport Lv1',level:()=>1},
  {kind:'bomber',label:'Bomber',cost:110,icon:'ico-airport',requirement:'Airport Lv2',level:()=>2}
];
const SHIP_TYPES=[{kind:'destroyer',label:'Destroyer',cost:88,icon:'destroyer'},
  {kind:'submarine',label:'Submarine',cost:100,icon:'submarine'},
  {kind:'battleship',label:'Battleship',cost:225,icon:'battleship'}];
"""+s[end:]
# building cards
s=s.replace("const count=Number(state.buildings?.[bld.kind]||0),capped=count>=bld.max,canAfford=balance>=bld.cost;",
"const count=Number(state.buildings?.[bld.kind]||0),capped=count>=bld.max&&bld.kind!=='capital',canAfford=balance>=bld.cost;\n    const unavailable=bld.kind==='port'&&!definition.get(province)?.coastal;\n    const capitalHere=bld.kind==='capital'&&game?.capitals?.[assigned]===province;\n    const disabled=unavailable||capped||capitalHere;")
s=s.replace("const buttonLabel=capped?'Max':count===0?'Build':'Upgrade';",
"const buttonLabel=capitalHere?'Current':capped?'Max':bld.kind==='capital'&&game?.capitals?.[assigned]?'Relocate':count===0?'Build':'Upgrade';")
s=s.replace("buy.disabled=capped||!canAfford;", "buy.disabled=disabled||!canAfford;")
# append naval recruit section before spies
needle="  const spies=(game?.spyBalloons||[]).filter(b=>b.nation===assigned);"
naval_shop="""  if(definition.get(province)?.coastal){
    const navy=elem('section','','troop-shop naval-shop');navy.append(elem('h3','NAVAL FLEET · COASTAL PORT'));
    if(!state.buildings?.port)navy.append(elem('small','Build a port to commission ships and launch fleets.'));
    for(const ship of SHIP_TYPES){
      const row=elem('div','','troop-buy-card');
      const art=document.createElement('img');art.className='naval-art';art.alt='';art.src=`/assets/units/${ship.icon}.svg`;
      const info=elem('div','','troop-buy-info');info.append(elem('strong',ship.label),elem('small',`${cash(ship.cost)} each · ${state.fleet?.[ship.kind]||0} stationed`));
      const actions=elem('div','','troop-buy-actions');
      const btn=createButton('+1',()=>socket.emit('buyShip',{province,type:ship.kind,amount:1}),'troop-buy-button');
      btn.disabled=!state.buildings?.port||balance<ship.cost;actions.append(btn);
      row.append(art,info,actions);navy.append(row);
    }
    if(state.buildings?.port){
      const controls=elem('div','','naval-dispatch');
      controls.append(elem('strong','FLEET TO DISPATCH'));
      for(const ship of SHIP_TYPES){
        const row=elem('label','','fleet-amount');row.append(elem('span',ship.label));
        const input=document.createElement('input');input.type='number';input.min='0';input.max=String(state.fleet?.[ship.kind]||0);
        input.value=String(state.fleet?.[ship.kind]||0);input.id='ship-'+ship.kind;input.inputMode='numeric';
        row.append(input);controls.append(row);
      }
      controls.append(createButton('Sail fleet · choose coastal target',()=>{
        const ships={};let count=0;
        for(const ship of SHIP_TYPES){
          const el=$('ship-'+ship.kind),qty=Number(el?.value||0),max=Number(state.fleet?.[ship.kind]||0);
          if(!Number.isSafeInteger(qty)||qty<0||qty>max)return notice('Invalid ship quantity.','error');
          ships[ship.kind]=qty;count+=qty;
        }
        if(!count)return notice('Select at least one ship.','error');
        navalSelection={from:province,ships};navalMode=true;setPanel(null);
        notice('Tap a coastal province to sail your fleet.','info');
      },'primary-button'));
      navy.append(controls);
    }
    out.append(navy);
  }
"""
assert needle in s;s=s.replace(needle,naval_shop+needle)
s=s.replace("const levels=['barracks','workshop','airport','bank','defense'].map(k=>state.buildings?.[k]||0);",
"const levels=['barracks','workshop','airport','bank','defense','port','capital'].map(k=>state.buildings?.[k]||0);\n  levels.push(game?.capitals?.[assigned]||0);\n  levels.push(...SHIP_TYPES.map(ship=>state.fleet?.[ship.kind]||0));")
# inclusion of naval units in province info list
s=s.replace("  builds.append(list);\n}", "  builds.append(list);\n  if(state.fleet)builds.append(elem('div',`FLEET · ${Object.entries(state.fleet).map(([k,v])=>`${k} ${v}`).join(' · ')}`,'detail-heading'));\n}")
s=s.replace("['defense','Defence','ico-fort','20% pre-attack HP loss']", "['defense','Defence','ico-fort','20% pre-attack HP loss'],\n    ['port','Port','ico-airport','Builds naval units'],\n    ['capital','Capital','ico-bank','20% combat penalty if lost']")
s=s.replace("[[cash(banks*.1)+'/s','BANK INCOME']", "[[cash(banks*.18)+'/s','BANK INCOME']")
# labels and usernames
s=s.replace("  const key=JSON.stringify([(game?.occupied||[]),assigned,isPublicMatch,playable,names]);",
"  const key=JSON.stringify([(game?.occupied||[]),assigned,isPublicMatch,playable,names,game?.commanders]);")
s=s.replace("const b=createButton(`${names[i]}${occupied?' (TAKEN)':''}`,()=>socket.emit('chooseNation',id),'nation-choice');",
"const commander=game?.commanders?.[id];\n    const b=createButton(`${names[i]}${commander?' · '+commander:''}${occupied?' (TAKEN)':''}`,()=>socket.emit('chooseNation',id),'nation-choice');")
s=s.replace("`${rank.place}. ${nationNames[rank.nation]}`", "`${rank.place}. ${nationNames[rank.nation]}${game?.commanders?.[rank.nation]?' · '+game.commanders[rank.nation]:''}`")
s=s.replace("    if(state)showNationIdentity($('selectionOwner'),state.owner,map.nations[state.owner]?.capital===p?.name?'CAPITAL':'');",
"    if(state)showNationIdentity($('selectionOwner'),state.owner,`${game?.commanders?.[state.owner]||'Unclaimed'}${game?.capitals?.[state.owner]===selected?' · CAPITAL':''}`);")
s=s.replace("    if(state)showNationIdentity($('buildingProvinceOwner'),state.owner,map.nations[state.owner]?.capital===p?.name?'CAPITAL':'');",
"    if(state)showNationIdentity($('buildingProvinceOwner'),state.owner,`${game?.commanders?.[state.owner]||'Unclaimed'}${game?.capitals?.[state.owner]===selected?' · CAPITAL':''}`);")
s=s.replace("  const intelKey=JSON.stringify([selected,state.owner,state.visible,state.units,state.buildings,state.garrison,",
"  const intelKey=JSON.stringify([selected,state.owner,state.visible,state.units,state.buildings,state.fleet,state.garrison,game?.capitals,game?.commanders,")
s=s.replace("  $('intelProvince').textContent=province.name.toUpperCase();",
"  $('intelProvince').textContent=province.name.toUpperCase()+(game?.capitals?.[state.owner]===selected?' ★ CAPITAL':'')+(game?.commanders?.[state.owner]?' · '+game.commanders[state.owner]:'');")
# add click map naval order before other selection and balloon
needle="  if(deployingBalloonId){if(!id)return notice('Choose a land province for the balloon.');"
naval_click="""  if(navalMode){
    if(!id||!definition.get(id)?.coastal)return notice('Select a coastal destination.','error');
    if(id===navalSelection?.from)return notice('Choose a different destination.','error');
    const rel=relationWith(game.provinces[id-1].owner);
    const data={...navalSelection,to:id,autoDeclareWar:rel==='neutral'};
    const desc=rel==='neutral'?`Sail your fleet to ${definition.get(id).name}? This declares war with ${nationNames[game.provinces[id-1].owner]}.`:`Sail fleet to ${definition.get(id).name}? Naval attacks bombard coastal defenders but do not capture land.`;
    showAttackConfirmation({event:'sailFleet',data},desc);
    $('confirmModal').querySelector('h1').textContent='CONFIRM NAVAL ORDER';
    $('confirmYes').textContent='Sail fleet';return;
  }
"""
assert needle in s;s=s.replace(needle,naval_click+needle)
# confirmation cleanup
s=s.replace("if(['move','moveGroup'].includes(pendingOrder.event))clearDeployment();",
"if(['move','moveGroup'].includes(pendingOrder.event))clearDeployment();\n    if(pendingOrder.event==='sailFleet'){navalMode=false;navalSelection=null;clearDeployment();}")
s=s.replace("$('confirmNo').onclick=()=>{pendingOrder=null;$('confirmModal').hidden=true;};",
"$('confirmNo').onclick=()=>{pendingOrder=null;$('confirmModal').hidden=true;navalMode=false;navalSelection=null;};")
# ensure form submit username
needle="$('joinForm').onsubmit=e=>{"
username="""function registerUsername(){
  const name=$('playerNameInput').value.trim();
  if(name.length<2){showJoinError('Enter a username of at least two characters.');return false;}
  localStorage.setItem('ww2royale-username',name.slice(0,20));
  socket.emit('setUsername',name.slice(0,20));return true;
}
$('playerNameInput').value=localStorage.getItem('ww2royale-username')||'';
"""
assert needle in s;s=s.replace(needle,username+needle)
s=s.replace("  if(!socket.connected)return showJoinError('Not connected to the server.');\n  $('joinError').hidden=true;socket.emit('joinRoom',code);",
"  if(!socket.connected)return showJoinError('Not connected to the server.');\n  if(!registerUsername())return;\n  $('joinError').hidden=true;socket.emit('joinRoom',code);")
s=s.replace("  $('joinError').hidden=true;socket.emit('joinRandom');",
"  if(!registerUsername())return;\n  $('joinError').hidden=true;socket.emit('joinRandom');")
s=s.replace("  $('joinError').hidden=true;socket.emit('createRoom');",
"  if(!registerUsername())return;\n  $('joinError').hidden=true;socket.emit('createRoom');")
s=s.replace("  if(room){if(isPublicMatch)socket.emit('joinRandom');",
"  if(room){socket.emit('setUsername',localStorage.getItem('ww2royale-username')||'Commander');if(isPublicMatch)socket.emit('joinRandom');")
s=s.replace("  if(next.winner)$('winnerName').textContent=next.winner.nations.map(n=>nationNames[n]).join(' + ')+' VICTORIOUS';",
"  if(next.winner)$('winnerName').textContent=next.winner.nations.map(n=>nationNames[n]).join(' + ')+' VICTORIOUS';")
s=s.replace("else {$('restartButton').textContent='Return to main menu';$('victoryDescription').textContent='Victory requires 51% of territories solo, or 67% of territories with an ally.';}",
"else {$('restartButton').textContent='Return to main menu';$('victoryDescription').textContent=next.winner?.mode==='time-limit'?'Public match finished after 55 minutes. Winner determined by territory, treasury, and military ranking.':'Victory requires 51% of territories solo, or 67% of territories with an ally.';}")
s=s.replace("socket.on('orderAccepted',o=>{playSound(orderSound(o.units||{[o.type]:o.count},o.kind),{volume:0.48});notice(`Army dispatched · ETA ${fmtSeconds((o.arrivalAt-Date.now())/1000)}`);});",
"socket.on('orderAccepted',o=>{playSound(o.naval?'plane':orderSound(o.units||{[o.type]:o.count},o.kind),{volume:0.48});notice(`${o.naval?'Fleet':'Army'} dispatched · ETA ${fmtSeconds((o.arrivalAt-Date.now())/1000)}`);});")
# naval movement draws need continuously render
s=s.replace("if(game?.movements?.length)queueRender();", "if(game?.movements?.length||game?.navalMovements?.length)queueRender();")
js.write_text(s)
print('client updated')
