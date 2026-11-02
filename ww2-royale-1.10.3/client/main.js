/* WW2 Royale — standalone Canvas client. No bundler required. */
'use strict';
const $ = (id) => document.getElementById(id);
const canvas = $('mapCanvas');
const ctx = canvas.getContext('2d');
// A lightweight event adapter over native browser WebSockets, no Socket.IO required.
class MultiplayerSocket {
  constructor(){ this.connected=false;this.listeners=new Map();this.connect(); }
  on(type,cb){ if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(cb); }
  event(type,data){ for(const cb of this.listeners.get(type)||[])cb(data); }
  emit(type,data){ if(this.connected)this.ws.send(JSON.stringify({type,data})); }
  connect(){
    this.ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);
    this.ws.onopen=()=>{this.connected=true;this.event('connect');};
    this.ws.onmessage=e=>{try{const msg=JSON.parse(e.data);this.event(msg.type,msg.data);}catch(err){console.error(err);}};
    this.ws.onclose=()=>{this.connected=false;this.event('disconnect');setTimeout(()=>this.connect(),1700);};
    this.ws.onerror=()=>this.ws.close();
  }
}
const socket = new MultiplayerSocket();
const image = (src) => new Promise((resolve,reject)=>{
  const img = new Image(); img.onload = () => resolve(img); img.onerror=()=>reject(new Error(`Cannot load ${src}`)); img.src=src;
});

let map, mapImage, territoryImage, borderImage, idPixels, originalPixels, tintCanvas;
let definition = new Map(), nationColor = {}, nationNames = {};
let game = null, assigned = null, selected = null, hovered = null, room = null;
let labels = true, pendingOrder=null, draftTarget=null, redirectOrderId=null, redirectTarget=null, isPublicMatch=false;
let lastCountSource=null,lastSidebarAt=0,lastChoiceKey='';
let actionMode=null, territoryBorderCanvas=null, paintKey='';
let movementPrefs={allyMoves:true,hostileMoves:true};
let showJoinOnConnect = true;
let activePanel = null;
let lastChatSeen = null;
let lastRequestsSeen = '';
const PANEL_INFO = {
  army:['ARMY COMMAND','Army management'],
  buildings:['INFRASTRUCTURE','Province buildings'],
  diplomacy:['FOREIGN AFFAIRS','Diplomacy'],
  chat:['COMMUNICATIONS','Messages'],
  orders:['GENERAL STAFF','Army movements'],
  rankings:['GLOBAL INTELLIGENCE','World standings'],
  reports:['INTELLIGENCE OFFICE','War reports'],
  settings:['GAME PREFERENCES','Settings']
};
function setPanel(name){
  if(name&&!PANEL_INFO[name])return;
  activePanel=name;
  $('floatingPanel').hidden=!name;
  for(const [key] of Object.entries(PANEL_INFO))$('panel-'+key).hidden=key!==name;
  for(const b of document.querySelectorAll('.rail-btn[data-panel]')){
    const isActive=b.dataset.panel===name;
    b.classList.toggle('active',isActive);b.setAttribute('aria-pressed',String(isActive));
  }
  if(name){
    $('panelEyebrow').textContent=PANEL_INFO[name][0];
    $('panelTitle').textContent=PANEL_INFO[name][1];
  }
  if(name==='chat')$('chatBadge').hidden=true;
  if(name==='diplomacy')$('diplomacyBadge').hidden=true;
}
function showJoinError(message){ $('joinError').textContent=message; $('joinError').hidden=false; }
async function copyRoomCode(){
  if(!room)return notice('Create or join a server first.');
  try{await navigator.clipboard.writeText(room);notice('Server code '+room+' copied.');}
  catch{notice('Invite code: '+room);}
}

let toastTimeout;
const camera = {zoom:1,panX:0,panY:0,scale:1,tx:0,ty:0,cw:0,ch:0};
let renderPending = false;
const ownerMap = new Map();

function notice(text){
  const node=$('floatingToast');node.textContent=text;node.hidden=false;
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>node.hidden=true,3500);
}
function resize(){
  const rect=canvas.getBoundingClientRect();
  camera.cw=rect.width;camera.ch=rect.height;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(rect.width*dpr));
  canvas.height=Math.max(1,Math.round(rect.height*dpr));
  queueRender();
}
function updateTransform(){
  if (!map) return;
  const fit=Math.min(camera.cw/map.width,camera.ch/map.height);
  camera.scale=fit*camera.zoom;
  camera.tx=(camera.cw-map.width*camera.scale)/2+camera.panX;
  camera.ty=(camera.ch-map.height*camera.scale)/2+camera.panY;
}
function worldFromClient(clientX,clientY){
  const r=canvas.getBoundingClientRect();updateTransform();
  return {x:(clientX-r.left-camera.tx)/camera.scale,y:(clientY-r.top-camera.ty)/camera.scale,
    screenX:clientX-r.left,screenY:clientY-r.top};
}
function pixelProvince(x,y){
  if (!idPixels||!map||x<0||y<0||x>=map.width||y>=map.height)return null;
  const k=(Math.floor(y)*map.width+Math.floor(x))*4;
  return idPixels[k+3] ? idPixels[k] : null;
}
function queueRender(){
  if(renderPending)return;renderPending=true;
  requestAnimationFrame(()=>{renderPending=false;draw();});
}
function hexToRgb(hex){return [1,3,5].map(i=>parseInt(hex.substring(i,i+2),16));}

/* The original textured image is ALWAYS the base layer. Only conquered
   provinces receive a recolouring overlay. Preserve the original texture's
   highlights/shadows, calibrated to the home terrain of the NEW owner.
   No solid-colour mode or brightness boost for occupied territory. */
function rebuildTint(){
  if(!map||!idPixels||!originalPixels||!game)return;
  const w=map.width,h=map.height, ownerOf=game.provinces.map(p=>p.owner);
  const relationColours={self:[48,157,81],ally:[51,117,206],war:[190,52,53]};
  const out=document.createElement('canvas');out.width=w;out.height=h;
  const gc=out.getContext('2d');const result=gc.createImageData(w,h);
  for(let i=0;i<w*h;i++){
    const k=i*4,id=idPixels[k+0];if(!idPixels[k+3]||!id)continue;
    const owner=ownerOf[id-1],relationship=relationWith(owner),rgb=relationColours[relationship];
    if(!rgb)continue; // All neutral land retains untouched beige relief.
    const sourceLum=originalPixels[k]*.30+originalPixels[k+1]*.59+originalPixels[k+2]*.11;
    const relief=Math.max(.63,Math.min(1.53,sourceLum/132));
    const factor=0.67;
    for(let c=0;c<3;c++)result.data[k+c]=Math.round(originalPixels[k+c]*(1-factor)+rgb[c]*relief*factor);
    result.data[k+3]=255;
  }
  gc.putImageData(result,0,0);tintCanvas=out;
  // Draw only the OUTER boundary of each currently owned nation.
  const edge=document.createElement('canvas');edge.width=w;edge.height=h;
  const ectx=edge.getContext('2d');const pixels=ectx.createImageData(w,h);
  const ownId=new Uint8Array(w*h);
  const nationIndex=Object.fromEntries(Object.keys(map.nations).map((n,i)=>[n,i+1]));
  for(let i=0;i<w*h;i++)if(idPixels[i*4+3])ownId[i]=nationIndex[ownerOf[idPixels[i*4]-1]]||0;
  const binary=new Uint8Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x,a=ownId[i];if(!a)continue;
    // Boundaries only: internal provinces belonging to the same nation disappear.
    if(a!==ownId[i-1]||a!==ownId[i+1]||a!==ownId[i-w]||a!==ownId[i+w])binary[i]=1;
  }
  // Dark outline + a restrained gold highlight on the center line.
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const i=y*w+x;
    if(!binary[i])continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(dx*dx+dy*dy>5)continue;
      const k=(i+dy*w+dx)*4;
      pixels.data[k]=14;pixels.data[k+1]=15;pixels.data[k+2]=16;pixels.data[k+3]=230;
    }
  }
  for(let i=0;i<w*h;i++)if(binary[i]){
    const k=i*4;pixels.data[k]=222;pixels.data[k+1]=183;pixels.data[k+2]=116;pixels.data[k+3]=225;
  }
  ectx.putImageData(pixels,0,0);territoryBorderCanvas=edge;queueRender();
}

function relationWith(owner){
  if(!assigned||!owner)return 'neutral';
  if(owner===assigned)return 'self';
  const key=[assigned,owner].sort().join(':');
  return game?.diplomacy?.[key]||'neutral';
}
function pathFor(province){
  if(province._path)return province._path;
  const path=new Path2D();
  for(const loop of province.paths||[]){
    if(loop.length<3)continue;
    path.moveTo(loop[0][0],loop[0][1]);
    for(let i=1;i<loop.length;i++)path.lineTo(loop[i][0],loop[i][1]);
    path.closePath();
  }
  province._path=path;return path;
}
function drawOutline(id,colour,line){
  if(!id)return;
  const p=definition.get(id);if(!p)return;
  ctx.save();ctx.strokeStyle=colour;ctx.lineWidth=line/camera.scale;ctx.lineJoin='round';
  ctx.stroke(pathFor(p));ctx.restore();
}
/* Country names are rebuilt from CURRENT ownership on every state update.
   Group connected owned provinces, calculate each landmass's real bounds,
   and center/stretch the title across the resulting occupied footprint.
   This deliberately does not rely on starting-country coordinates. */
function buildCountryLabels(){
  if(!map||!game)return [];
  const owned=new Map();
  for(const p of map.provinces){
    const owner=game.provinces[p.id-1].owner;
    if(!owned.has(owner))owned.set(owner,new Set());
    owned.get(owner).add(p.id);
  }
  const all=[];
  for(const [owner,ids] of owned){
    const unseen=new Set(ids);
    const components=[];
    while(unseen.size){
      const start=unseen.values().next().value;
      const stack=[start],component=[];
      unseen.delete(start);
      while(stack.length){
        const id=stack.pop(),p=definition.get(id);
        if(!p)continue;
        component.push(p);
        for(const neighbor of p.neighbors||[]){
          if(unseen.delete(neighbor))stack.push(neighbor);
        }
      }
      if(component.length)components.push(component);
    }
    const info=components.map(provinces=>{
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      let x=0,y=0,area=0;
      for(const p of provinces){
        const weight=Math.max(1,p.area);
        x+=p.x*weight;y+=p.y*weight;area+=weight;
        for(const loop of p.paths||[])for(const point of loop){
          minX=Math.min(minX,point[0]);minY=Math.min(minY,point[1]);
          maxX=Math.max(maxX,point[0]);maxY=Math.max(maxY,point[1]);
        }
      }
      return {provinces,area,x:x/area,y:y/area,minX,minY,maxX,maxY};
    }).sort((a,b)=>b.area-a.area);
    // Display the main nation's name over its largest current landmass.
    // Disconnected sizable colonies receive their own label if large enough.
    const largest=info[0]?.area||0;
    for(const c of info){
      if(c.area<largest*.14&&c!==info[0])continue;
      if(c.maxX-c.minX<75||c.maxY-c.minY<30)continue;
      all.push({...c,owner});
    }
  }
  return all;
}
let countryLabels=[];
/* Find an UNCLIPPED, completely visible position for each country name.
   Text is measured at its real font width and only placed when its bounding
   rectangle fits the currently owned land. Labels are solved again on captures. */
function landAt(x,y,owner){
  const id=pixelProvince(x,y);
  return id!==null && game?.provinces[id-1]?.owner===owner;
}
function textFits(x,y,width,height,angle,owner){
  const cosine=Math.cos(angle),sine=Math.sin(angle);
  // Sample the whole text rectangle, including edges and corners. A small
  // margin prevents antialiased letter edges from touching enemy borders.
  const across=Math.max(4,Math.ceil(width/5));
  const down=Math.max(3,Math.ceil(height/4));
  for(let j=0;j<=down;j++)for(let i=0;i<=across;i++){
    const u=(i/across-.5)*width,v=(j/down-.5)*height;
    if(!landAt(x+u*cosine-v*sine,y+u*sine+v*cosine,owner))return false;
  }
  return true;
}
function fitLabel(g){
  const name=nationNames[g.owner]?.toUpperCase();if(!name)return null;
  const w=g.maxX-g.minX,h=g.maxY-g.minY;
  const primary={x:g.x,y:g.y};
  const candidates=[primary,{x:(g.minX+g.maxX)/2,y:(g.minY+g.maxY)/2}];
  for(const p of g.provinces)candidates.push({x:p.x,y:p.y});
  // Additional anchors find a suitable continuous inland strip even for
  // elongated, horseshoe-shaped or newly-conquered countries.
  for(let y=g.minY+h*.12;y<=g.maxY-h*.12;y+=Math.max(14,h/9))
    for(let x=g.minX+w*.10;x<=g.maxX-w*.10;x+=Math.max(16,w/13))
      if(landAt(x,y,g.owner))candidates.push({x,y});
  const maxSize=Math.min(64,Math.max(8,Math.min(w*.5,h*.7)));
  const angles=w>=h ? [0,-Math.PI/2] : [-Math.PI/2,0];
  // Prefer the largest size that completely fits an owned region; prioritize
  // a centered placement as a tie-breaker. No clipping or horizontal stretching.
  let best=null;
  for(const angle of angles){
    for(let size=maxSize;size>=7;size*=.83){
      ctx.font=`700 ${size}px Georgia,serif`;
      const width=ctx.measureText(name).width+size*.35;
      const height=size*1.16;
      if(width>(angle===0?w:h)*.98 || height>(angle===0?h:w)*.98)continue;
      for(const pt of candidates){
        if(!landAt(pt.x,pt.y,g.owner))continue;
        if(!textFits(pt.x,pt.y,width,height,angle,g.owner))continue;
        const distance=Math.hypot((pt.x-g.x)/Math.max(1,w),(pt.y-g.y)/Math.max(1,h));
        const score=size-distance*1.7;
        if(!best||score>best.score)best={x:pt.x,y:pt.y,angle,size,score};
      }
      if(best&&best.size>=size)break;
    }
  }
  // Tiny or broken-up landmasses may not contain the whole name at readable
  // size. In that case still draw the COMPLETE name above the main landmass,
  // rather than silently cutting off any of its letters.
  return best||{x:g.x,y:g.y,angle:w>=h?0:-Math.PI/2,size:Math.max(7,Math.min(13,Math.min(w,h)*.32))};
}
/* Diplomacy-coloured names: keep the complete, dynamically fitted labels,
   but tint BOTH fill and outline so relations remain legible on textured land. */
function drawLabels(){
  if(!labels||!game)return;
  const palette={fill:'rgba(235,223,194,.84)',stroke:'rgba(46,39,32,.94)'};
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  for(const g of countryLabels){
    const name=nationNames[g.owner]?.toUpperCase();if(!name||!g.label)continue;
    const place=g.label;
    // All country labels use the same parchment lettering regardless of diplomacy.
    ctx.save();ctx.translate(place.x,place.y);ctx.rotate(place.angle);
    ctx.font=`700 ${place.size}px Georgia,serif`;
    ctx.lineJoin='round';
    // Two outlines create separation from both bright mountains and dark land.
    ctx.lineWidth=Math.max(2.0,place.size*.19);
    ctx.strokeStyle='rgba(6,12,17,.70)';
    ctx.strokeText(name,0,0);
    ctx.lineWidth=Math.max(1.1,place.size*.105);
    ctx.strokeStyle=palette.stroke;
    ctx.strokeText(name,0,0);
    ctx.fillStyle=palette.fill;
    ctx.fillText(name,0,0);
    ctx.restore();
  }
  ctx.restore();
}
function updateLabels(){
  countryLabels=buildCountryLabels();
  for(const group of countryLabels)group.label=fitLabel(group);
}
function fmtSeconds(seconds){
  seconds=Math.max(0,Math.ceil(seconds));
  return seconds>=60?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:`${seconds}s`;
}
function unitTotal(stack){return ['infantry','tank','bomber'].reduce((s,t)=>s+(stack?.[t]||0),0);}
function cash(v){return '$'+Number(v||0).toFixed(2);}
function armyDescription(o){
  const u=o.units||{[o.type]:o.count};
  return [['infantry','INF'],['tank','TNK'],['bomber','AIR']].filter(([t])=>u[t]>0).map(([t,name])=>`${name} ${u[t]}`).join(' / ');
}
function orderPosition(order,now){
  const pts=order.waypoints||order.path.map(id=>definition.get(id)).filter(Boolean);
  const durations=order.durations||Array(Math.max(0,pts.length-1)).fill((order.arrivalAt-order.startedAt)/Math.max(1,pts.length-1));
  if(pts.length<2)return null;
  let elapsed=Math.max(0,now-order.startedAt);
  for(let i=0;i<durations.length;i++){
    const d=durations[i],t=Math.min(1,d>0?elapsed/d:1),a=pts[i],b=pts[i+1];
    if(elapsed<=d||i===durations.length-1)return {pts,i,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    elapsed-=d;
  }
  return null;
}
function drawMovements(){
  if(!game?.movements?.length)return;
  const now=Date.now();ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const order of game.movements){
    const info=orderPosition(order,now);if(!info)continue;
    const {pts,i,x,y}=info;
    const friendly=order.nation===assigned;
    const tint=friendly?'#f7e4a9':relationWith(order.nation)==='ally'?'#74b8e8':'#ed807b';
    ctx.beginPath();ctx.moveTo(x,y);
    for(let j=i+1;j<pts.length;j++)ctx.lineTo(pts[j].x,pts[j].y);
    ctx.lineWidth=3.6;ctx.strokeStyle='rgba(6,14,20,.9)';ctx.setLineDash([]);ctx.stroke();
    ctx.lineWidth=2.2;ctx.strokeStyle=tint;ctx.setLineDash([11,8]);ctx.lineDashOffset=-now/85;ctx.stroke();ctx.setLineDash([]);
    const theta=Math.atan2(pts[i+1].y-pts[i].y,pts[i+1].x-pts[i].x);
    ctx.save();ctx.translate(x,y);ctx.rotate(theta);
    ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-9,-7);ctx.lineTo(-4,0);ctx.lineTo(-9,7);ctx.closePath();
    ctx.fillStyle=tint;ctx.strokeStyle='#18232a';ctx.lineWidth=2.4;ctx.fill();ctx.stroke();ctx.restore();
    const label=`${armyDescription(order)} · ${fmtSeconds((order.arrivalAt-now)/1000)}`;
    ctx.font='700 13px Inter,Arial,sans-serif';const w=ctx.measureText(label).width+16;
    ctx.fillStyle='rgba(9,21,27,.92)';ctx.strokeStyle=tint;ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x-w/2,y-38,w,24,5);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff3d5';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y-26);
  }
  ctx.restore();
}
function drawTroops(){
  if(!game)return;
  const f=Math.max(12,Math.min(20,12/camera.scale));
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${f}px Inter,Arial,sans-serif`;
  for(const p of map.provinces){
    const state=game.provinces[p.id-1],visible=state.units!==null;
    const str=visible?String(unitTotal(state.units)):'?';
    const w=Math.max(f*1.5,ctx.measureText(str).width+12),h=f+9;
    ctx.fillStyle='rgba(7,17,22,.78)';ctx.strokeStyle=state.owner===assigned?'#f7d89b':'rgba(240,243,230,.5)';
    ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-h/2,w,h,4);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f7f2e6';ctx.fillText(str,p.x,p.y+1);
    // Allied garrisons are distinct armies, NOT part of the host's troop stack.
    // Render each allied nation's deployed force separately at this province.
    const stationed=Object.entries(state.garrison||{}).filter(([,stack])=>unitTotal(stack)>0);
    for(let i=0;i<stationed.length;i++){
      const [nation,stack]=stationed[i];
      const label=`${nation} ${unitTotal(stack)}`;
      const width=Math.max(f*1.7,ctx.measureText(label).width+12);
      const x=p.x, y=p.y+h+5+i*(h+3);
      ctx.fillStyle='rgba(7,17,22,.94)';
      ctx.strokeStyle=nationColor[nation]||'#fff';ctx.lineWidth=2;
      ctx.beginPath();ctx.roundRect(x-width/2,y-h/2,width,h,4);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff';ctx.fillText(label,x,y+1);
    }
  }
  ctx.restore();
}
function draw(){
  const dpr=canvas.width/Math.max(1,camera.cw);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,camera.cw,camera.ch);
  ctx.fillStyle='#092632';ctx.fillRect(0,0,camera.cw,camera.ch);
  if(!map||!mapImage)return;updateTransform();
  ctx.save();ctx.translate(camera.tx,camera.ty);ctx.scale(camera.scale,camera.scale);
  ctx.drawImage(mapImage,0,0);if(tintCanvas)ctx.drawImage(tintCanvas,0,0);
  if(borderImage)ctx.drawImage(borderImage,0,0);if(territoryBorderCanvas)ctx.drawImage(territoryBorderCanvas,0,0);drawLabels();drawMovements();
  drawOutline(hovered,'rgba(251,236,157,.8)',2.7);drawOutline(selected,'#ffdc87',4);drawOutline(draftTarget,'#85eeec',3);drawOutline(redirectTarget,'#ffbc76',3);
  drawTroops();ctx.restore();if(game?.movements?.length)queueRender();
}
function createButton(label,action,cls=''){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  if(cls)b.className=cls;b.onclick=action;return b;
}
function elem(tag,txt,cls=''){const el=document.createElement(tag);el.textContent=txt;if(cls)el.className=cls;return el;}
function renderProvinceStats(state,visible){
  const troops=$('selectionDetails'),builds=$('buildingDetails');
  troops.replaceChildren();builds.replaceChildren();
  if(!visible){
    troops.append(elem('div','Troop information classified. Border a hostile province or scout it with incoming bombers.','locked-info'));
    builds.append(elem('div','Buildings are concealed until this province is scouted.','locked-info'));
    return;
  }
  troops.append(elem('div','STATIONED TROOPS','detail-heading'));
  const grid=elem('div','','unit-grid');
  for(const [kind,label,role] of [['infantry','Infantry','LAND'],['tank','Tanks','ARMOURED'],['bomber','Bombers','AIR']]){
    const tile=elem('div','','unit-tile');tile.append(elem('small',label),elem('strong',Number(state.units?.[kind]||0).toLocaleString()),elem('em',role));grid.append(tile);
  }
  troops.append(grid);
  for(const [nation,stack] of Object.entries(state.garrison||{})){
    if(!unitTotal(stack))continue;
    const item=elem('div','','garrison-line');
    const title=elem('strong',`${nationNames[nation]||nation} · allied garrison`);
    title.style.color=nationColor[nation]||'#f4e1b5';
    item.append(title,elem('span',`${stack.infantry||0} infantry  ·  ${stack.tank||0} tanks  ·  ${stack.bomber||0} bombers`));
    troops.append(item);
  }
  if(state.owner===assigned){
    // A compact summary sits above the purchase catalogue; the catalogue itself
    // shows individual building counts, costs and effects (no duplicate list).
    const metrics=elem('div','','build-metrics');
    const banks=Number(state.buildings?.bank||0);
    const barracks=Number(state.buildings?.barracks||0);
    const shops=Number(state.buildings?.shop||0);
    const airports=Number(state.buildings?.airport||0);
    const defense=Number(state.buildings?.defense||0);
    for(const [value,label] of [
      [cash(banks*.1)+'/s','BANK INCOME'],
      [String(barracks+shops+airports),'PRODUCTION SITES'],
      [defense?'ACTIVE':'NONE','DEFENCE SYSTEM']
    ]){
      const tile=elem('div','','build-metric');
      tile.append(elem('span',label),elem('strong',value));
      metrics.append(tile);
    }
    builds.append(metrics);
  }else{
    builds.append(elem('div','SCOUTED INFRASTRUCTURE','detail-heading'));
    const list=elem('div','','buildings-list');
    for(const [key,label,icon,benefit] of [
      ['barracks','Barracks','ico-barracks','1 infantry / 45s'],
      ['shop','Auto shops','ico-autoshop','1 tank / 90s'],
      ['airport','Airports','ico-airport','1 bomber / 240s'],
      ['bank','Banks','ico-bank','$0.10 / sec'],
      ['defense','Defences','ico-fort','20% incoming damage']
    ]){
      const tile=elem('div','','building-summary');
      const symbol=elem('span','','building-summary-icon');symbol.append(iconSvg(icon));
      const info=elem('div','','building-summary-info');
      info.append(elem('strong',label),elem('small',benefit));
      tile.append(symbol,info,elem('b',String(state.buildings?.[key]||0),'building-summary-count'));
      list.append(tile);
    }
    builds.append(list);
  }
}
function iconSvg(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');
  use.setAttribute('href','#'+name);svg.append(use);return svg;
}
const BUILDING_TYPES=[
  {kind:'barracks',label:'Barracks',cost:20,icon:'ico-barracks',category:'INFANTRY',detail:'Trains 1 infantry every 45 seconds',rate:'1 INF / 45 SEC'},
  {kind:'shop',label:'Auto shop',cost:90,icon:'ico-autoshop',category:'ARMOURED',detail:'Assembles 1 tank every 90 seconds',rate:'1 TANK / 90 SEC'},
  {kind:'airport',label:'Airport',cost:175,icon:'ico-airport',category:'AIR FORCE',detail:'Produces 1 bomber every 240 seconds',rate:'1 BOMBER / 240 SEC'},
  {kind:'bank',label:'Bank',cost:50,icon:'ico-bank',category:'ECONOMY',detail:'Generates $0.10 each second',rate:'+$0.10 / SEC'},
  {kind:'defense',label:'Defence system',cost:200,icon:'ico-fort',category:'FORTIFICATION',detail:'Reduces an incoming army’s health by 20%',rate:'−20% ENEMY HP'}
];
function renderBuildButtons(state){
  const out=$('buildOptions');out.replaceChildren();
  const balance=Number(game?.money||0);
  const summary=elem('div','','construction-balance');
  const balanceLeft=elem('div','','construction-balance-left');
  const purse=elem('span','','balance-purse');purse.append(iconSvg('ico-coins'));
  const balanceText=elem('div','','balance-text');balanceText.append(elem('span','AVAILABLE TREASURY'),elem('strong',cash(balance)));
  balanceLeft.append(purse,balanceText);
  summary.append(balanceLeft,elem('small','Purchases apply to this province.','balance-help'));
  out.append(summary);
  const list=elem('div','','build-catalogue');
  for(const bld of BUILDING_TYPES){
    const count=state.buildings?.[bld.kind]||0;
    const capped=bld.kind==='defense'&&count>=1;
    const canAfford=balance>=bld.cost;
    const card=elem('article','','building-shop-card'+(capped?' capped':'')+(!canAfford&&!capped?' unaffordable':''));
    const top=elem('div','','building-shop-top');
    const emblem=elem('div','','building-shop-emblem');emblem.append(iconSvg(bld.icon));
    const heading=elem('div','','building-shop-heading');
    heading.append(elem('span',bld.category,'building-shop-category'),elem('strong',bld.label));
    const countBadge=elem('span',`${count} BUILT`,'building-count-pill');
    top.append(emblem,heading,countBadge);
    const effect=elem('div','','building-shop-effect');effect.append(elem('span',bld.detail),elem('strong',bld.rate));
    const bottom=elem('div','','building-shop-bottom');
    const price=elem('div','','building-shop-price');price.append(elem('small','BUILD COST'),elem('strong',cash(bld.cost)));
    const buy=createButton(capped?'MAX BUILT':canAfford?'Construct':'Not enough $',()=>{
      // Capture the selected province when clicked; the server validates the order.
      const province=selected;if(!province)return;
      socket.emit('build',{province,kind:bld.kind});
    },'building-shop-buy');
    buy.disabled=capped||!canAfford;
    buy.title=capped?'Only one defence system allowed':!canAfford?`Need ${cash(bld.cost-balance)} more`:`Build ${bld.label} in this province`;
    bottom.append(price,buy);
    card.append(top,effect,bottom);list.append(card);
  }
  out.append(list);
}
function setArmyPreset(full){
  if(!selected||!game||!assigned)return;
  const state=game.provinces?.[selected-1];
  if(!state)return;
  const own=state.owner===assigned;
  const stack=own?state.units:state.garrison?.[assigned];
  for(const kind of ['infantry','tank','bomber']){
    const input=$('army'+kind[0].toUpperCase()+kind.slice(1));
    input.value=full?String(Math.max(0,stack?.[kind]||0)):'0';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  updateSidebar();
}
function updateSidebar(){
  if(!map)return;
  $('myNation').textContent=assigned?nationNames[assigned]:'Spectator';
  $('changeNation').disabled=!!assigned;
  $('myFlag').style.backgroundColor=assigned?nationColor[assigned]:'#536168';
  $('moneyValue').textContent=assigned?cash(game?.money):'—';
  const rank=game?.rankings?.find(x=>x.nation===assigned);
  $('placementValue').textContent=rank?`#${rank.place} / ${Object.keys(map.nations).length}`:'—';
  const terr=game?.provinces?.filter(t=>t.owner===assigned)||[];
  $('provinceCount').textContent=terr.length;
  $('troopCount').textContent=(terr.reduce((n,p)=>n+unitTotal(p.units),0)+(game?.provinces||[]).reduce((n,p)=>n+unitTotal(p.garrison?.[assigned]),0)).toLocaleString();
  $('productionCount').textContent=terr.reduce((n,p)=>n+(p.buildings?.barracks||0),0)+' active barracks';
  $('playersOnline').textContent=(game?.occupied?.length||0)+' commanders';
  const card=$('selectionCard');card.hidden=!selected;
  $('emptyProvince').hidden=!!selected;
  $('buildingProvinceCard').hidden=!selected;
  $('emptyBuildings').hidden=!!selected;
  $('quickCommand').hidden=true;
  if(selected){
    const p=definition.get(selected),state=game?.provinces?.[selected-1];
    $('selectionName').textContent=p?.name||'Unknown';
    $('buildingProvinceName').textContent=p?.name||'Unknown';
    $('selectionOwner').textContent=state?nationNames[state.owner]:'';
    $('buildingProvinceOwner').textContent=state?nationNames[state.owner]:'';
    const own=state?.owner===assigned;
    const fromAlly=state?.owner!==assigned&&relationWith(state?.owner)==='ally'&&unitTotal(state?.garrison?.[assigned])>0;
    const visible=!!state?.visible;
    const relation=relationWith(state?.owner);
    const status=$('provinceStatus');status.textContent=relation==='self'?'YOUR TERRITORY':relation==='ally'?'ALLIED':relation==='war'?'AT WAR':'NEUTRAL';
    status.className='status-pill '+relation;
    $('selectionOwner').style.borderColor=nationColor[state?.owner]||'#c9ad72';
    $('buildingProvinceOwner').style.borderColor=nationColor[state?.owner]||'#c9ad72';
    $('quickCommand').hidden=!(own||fromAlly);
    $('quickBuild').disabled=!own;
    if(state){
      renderProvinceStats(state,visible);
      // The army composer is a contextual on-map panel, not part of the Army tab.
      $('buildingControls').hidden=!own;
      $('provinceDiplomacy').hidden=own;
      if(!own){
        $('provinceDiplomacy').replaceChildren();
        const relationLine=elem('div','','diplomacy-inline');
        relationLine.append(elem('span',`${nationNames[state.owner]} · ${relation.toUpperCase()}`),createButton('Diplomacy →',()=>{
          $('dipTarget').value=state.owner;setPanel('diplomacy');renderDiplomacy();
        }));
        $('provinceDiplomacy').append(relationLine);
      }
      if(own||fromAlly){
        const stack=own?state.units:state.garrison?.[assigned];
        for(const t of ['infantry','tank','bomber']){
          const el=$('army'+t[0].toUpperCase()+t.slice(1));
          const available=Math.max(0,stack?.[t]||0);
          // Range inputs clamp values to their max. Always set max BEFORE
          // assigning the 100% default, otherwise every new order starts at 0.
          el.max=String(available);
          if(lastCountSource!==selected)el.value=String(available);
          else if(Number(el.value)>available)el.value=String(available);
          $('available'+t[0].toUpperCase()+t.slice(1)).textContent=available+' available';
        }
        lastCountSource=selected;
        $('destinationCard').hidden=!draftTarget;
        $('clearDestination').hidden=!draftTarget;
        const rel=draftTarget?relationWith(game.provinces[draftTarget-1]?.owner):null;
        $('destinationName').textContent=draftTarget?definition.get(draftTarget)?.name||'Unknown':'—';
        $('destinationRelation').textContent=rel==='war'?'Hostile — Attack order required':rel==='ally'?'Allied territory — Move':rel==='self'?'Owned territory — Move':rel==='neutral'?'Neutral — attacking automatically declares war':'Select another province';
        const hasUnits=['infantry','tank','bomber'].some(t=>Number($('army'+t[0].toUpperCase()+t.slice(1)).value)>0);
        $('quickMove').disabled=!hasUnits;
        $('quickAttack').disabled=!hasUnits;
        if(own)renderBuildButtons(state);
        // The order status and action buttons are managed by updateOrderUI().
      }else{lastCountSource=null;draftTarget=null;if(own)renderBuildButtons(state);}
    }
  }
  updateOrderUI();
  renderNationChoices();renderOrders();renderRankings();renderDiplomacy();renderChat();
  const log=$('warLog');log.replaceChildren();for(const entry of game?.log||[])log.append(elem('div',entry,'log-entry'));
}
function renderRankings(){
  const list=$('leaderboard');list.replaceChildren();
  for(const rank of game?.rankings||[]){
    const row=elem('div','', 'rank-row');const color=elem('span','','rank-color');color.style.background=nationColor[rank.nation];
    row.append(color,elem('span',`${rank.place}. ${nationNames[rank.nation]}`,'rank-name'),elem('span',`${rank.score.toFixed(1)} pts · ${rank.provinces} provinces`,'rank-count'));
    list.append(row);
  }
}
function renderNationChoices(){
  if(!map)return;
  const key=(game?.occupied||[]).join(',')+'|'+assigned+'|'+isPublicMatch;if(key===lastChoiceKey)return;lastChoiceKey=key;
  const out=$('nationChoices');out.replaceChildren();
  const random=createButton('🎲 Pick random available nation',()=>socket.emit('chooseRandomNation'), 'nation-choice random-nation');
  if(assigned)random.disabled=true;out.append(random);
  for(const id of Object.keys(map.nations).filter(id=>map.nations[id].playable)){
    const occupied=game?.occupied?.includes(id)&&assigned!==id;
    const b=createButton(`${nationNames[id]} ${occupied?'(TAKEN)':''}`,()=>socket.emit('chooseNation',id),'nation-choice');b.disabled=!!occupied||!!assigned;
    const swatch=elem('span','','swatch');swatch.style.background=nationColor[id];b.prepend(swatch);out.append(b);
  }
}
function renderDiplomacy(){
  const panel=$('diplomacyPanel');panel.replaceChildren();if(!assigned)return;
  const selector=$('dipTarget');
  const valid=Object.keys(nationNames).filter(n=>n!==assigned);
  if(selector.options.length!==valid.length||[...selector.options].some((o,i)=>o.value!==valid[i])){
    const old=selector.value;selector.replaceChildren();
    for(const n of valid){const option=document.createElement('option');option.value=n;option.textContent=nationNames[n];selector.append(option);}
    if(valid.includes(old))selector.value=old;
  }
  if(selector.selectedIndex<0)selector.selectedIndex=0;
  const n=selector.value,rel=relationWith(n);
  panel.append(elem('p',`Relationship with ${nationNames[n]}: ${rel.toUpperCase()}`,'diplomacy-heading'));
  const buttons=elem('div','','diplomacy-actions');
  const add=(txt,action,cls='')=>buttons.append(createButton(txt,()=>socket.emit('diplomacy',{action,target:n}),cls));
  if(rel==='ally'){add('Break alliance','breakAlliance','danger');}
  else if(rel!=='war'){add('Declare war','declareWar','danger');add('Request alliance','requestAlly');}
  else add('Request peace','requestPeace');
  panel.append(buttons);
  const inbox=[...(game?.requests||[]).filter(x=>x.to===assigned).map(r=>({...r,kind:'Ally'})),
    ...(game?.peaceRequests||[]).filter(x=>x.to===assigned).map(r=>({...r,kind:'Peace'}))];
  for(const item of inbox){const row=elem('div',`${nationNames[item.from]}: ${item.kind} request`,'request-card');
    row.append(createButton('Accept',()=>socket.emit('diplomacy',{action:item.kind==='Ally'?'acceptAlly':'acceptPeace',target:item.from})),
      createButton('Decline',()=>socket.emit('diplomacy',{action:item.kind==='Ally'?'declineAlly':'declinePeace',target:item.from})));
    panel.append(row);
  }
  const friend=Object.keys(nationNames).find(n=>n!==assigned&&relationWith(n)==='ally');
  panel.append(elem('div',`Alliance slot: ${friend?nationNames[friend]:'Available (maximum one)'}`,'ally-slot'));
}
function renderChat(){
  const recipient=$('chatRecipient'),previous=recipient.value;
  const options=['all',...Object.keys(nationNames).filter(n=>n!==assigned)];
  if(recipient.options.length!==options.length||[...recipient.options].some((o,i)=>o.value!==options[i])){
    recipient.replaceChildren();for(const n of options){const option=document.createElement('option');option.value=n;option.textContent=n==='all'?'All nations':nationNames[n];recipient.append(option);}
    if(options.includes(previous))recipient.value=previous;
  }
  const view=$('chatMessages');const stick=view.scrollTop+view.clientHeight+40>=view.scrollHeight;
  view.replaceChildren();
  for(const m of game?.chat||[]){
    const line=elem('div','', 'chat-line');
    const name=elem('strong',nationNames[m.nation]+(m.to==='all'?' [GLOBAL]':' [PRIVATE → '+nationNames[m.to]+']')+': ');name.style.color=nationColor[m.nation];line.append(name,document.createTextNode(m.text));view.append(line);
  }
  if(stick)view.scrollTop=view.scrollHeight;
}
function renderOrders(){
  const out=$('movementOrders');out.replaceChildren();
  const orders=(game?.movements||[]).filter(o=>o.nation===assigned);
  if(redirectOrderId&&!orders.some(o=>o.id===redirectOrderId)){redirectOrderId=null;redirectTarget=null;}
  const hint=$('redirectHint');hint.hidden=!redirectOrderId;
  if(redirectOrderId){
    hint.textContent=redirectTarget?`Order #${redirectOrderId}: ${definition.get(redirectTarget)?.name}. Choose Move or Attack below.`:`Choose a new target on the map for order #${redirectOrderId}. The army continues moving while you decide.`;
    if(redirectTarget){
      const d=game.provinces[redirectTarget-1],rel=relationWith(d.owner);
      const actions=elem('div','','order-actions');
      const command=rel==='war'?'attack':rel==='self'||rel==='ally'?'move':null;
      if(command)actions.append(createButton(command==='attack'?'Attack target':'Confirm move',()=>{
        const data={id:redirectOrderId,action:'redirect',to:redirectTarget,kind:command};
        socket.emit('changeMovement',data);
        redirectOrderId=null;redirectTarget=null;renderOrders();
      }));
      else actions.append(elem('span','Declare war before attacking neutral provinces.'));
      actions.append(createButton('Clear',()=>{redirectTarget=null;renderOrders();}));out.append(actions);
    }
  }
  if(!orders.length){out.append(elem('div','No armies in transit.'));return;}
  for(const o of orders){
    const row=elem('div','', 'order-row');
    const info=elem('div');info.append(elem('span',`${armyDescription(o)} · ${definition.get(o.from)?.name} → ${definition.get(o.to)?.name}`));
    const time=elem('b',fmtSeconds((o.arrivalAt-Date.now())/1000),'order-remaining');time.dataset.arrival=String(o.arrivalAt);info.append(time);row.append(info);
    row.append(elem('div',o.recalling?'Returning to base':o.returning?'Returning bombers':o.attacking?'Attack in progress':'Army deployment','order-meta'));
    const buttons=elem('div','','order-actions');
    if(!o.recalling){
      buttons.append(createButton('Change target',()=>{redirectOrderId=o.id;redirectTarget=null;setPanel('orders');renderOrders();notice('Select a new destination on the map.');}));
      buttons.append(createButton('Recall army',()=>{
        if(confirm('Recall this army? The troops will travel back at normal speed.')){
          socket.emit('changeMovement',{id:o.id,action:'recall'});
          if(redirectOrderId===o.id){redirectOrderId=null;redirectTarget=null;}
        }
      },'danger'));
    }
    row.append(buttons);out.append(row);
  }
}
function showNationModal(){if(room)$('nationModal').hidden=false;}
function updateCountryAndOwner(){
  if(!game)return;
  const key=[assigned||'',...(game.provinces||[]).map(p=>p.owner),JSON.stringify(game.diplomacy||{})].join('|');
  if(key!==paintKey){paintKey=key;updateLabels();rebuildTint();}
  queueRender();
}

function armyFormUnits(){
  const units={};
  for(const t of ['infantry','tank','bomber'])units[t]=Number($('army'+t[0].toUpperCase()+t.slice(1)).value);
  return units;
}
function showAttackConfirmation(command,description){
  pendingOrder=command;$('confirmDetails').textContent=description;$('confirmModal').hidden=false;
}
function dispatch(kind){
  if(!selected||!draftTarget||!assigned)return notice('Select a destination province.');
  const units=armyFormUnits(),state=game.provinces[selected-1];
  const stack=state.owner===assigned?state.units:state.garrison?.[assigned];
  if(!['infantry','tank','bomber'].every(t=>Number.isSafeInteger(units[t])&&units[t]>=0&&units[t]<=(stack?.[t]||0))||!unitTotal(units))
    return notice('Select valid troop quantities.');
  const rel=relationWith(game.provinces[draftTarget-1].owner);
  if((kind==='attack')!==['war','neutral'].includes(rel))return notice('Choose Move for friendly territory or Attack for hostile territory.');
  const data={from:selected,to:draftTarget,units,kind,autoDeclareWar:kind==='attack'&&rel==='neutral'};
  socket.emit('move',data);
  if(data.autoDeclareWar)notice(`War declared on ${nationNames[game.provinces[draftTarget-1].owner]}. Attack launched.`);
  clearDeployment();
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
  if(actionMode==='move'&&rel!=='self'&&rel!=='ally')return {valid:false,message:'Move requires owned or allied territory. Use Attack for hostile territory.'};
  if(actionMode==='attack'&&rel!=='war'&&rel!=='neutral')return {valid:false,message:'Attack requires enemy or neutral territory. Use Move for friendly territory.'};
  return {valid:true,message:actionMode==='attack'&&rel==='neutral'?'Confirming this attack automatically declares war.':`Ready to ${actionMode}. Confirm to dispatch your army.`};
}
function updateArmyReadouts(){
  for(const t of ['infantry','tank','bomber']){
    const id=t[0].toUpperCase()+t.slice(1),range=$('army'+id),out=$('army'+id+'Value');
    const max=Number(range.max)||0;
    if(Number(range.value)>max)range.value=String(max);
    out.value=Number(range.value).toLocaleString();
    range.style.setProperty('--slider-percent',max?`${Number(range.value)/max*100}%`:'0%');
    range.setAttribute('aria-valuetext',`${range.value} of ${max} ${t}`);
  }
}
function updateOrderUI(){
  const planner=$('orderPlanner'),active=!!(selected&&game&&assigned&&actionMode);
  planner.hidden=!active;
  const confirming=active&&!!draftTarget;
  for(const id of ['quickMove','quickAttack','quickBuild'])$(id).hidden=confirming;
  for(const id of ['confirmOrderBtn','cancelOrderBtn'])$(id).hidden=!confirming;
  if(!active)return;
  $('plannerTitle').textContent=actionMode==='attack'?'Attack order':'Movement order';
  $('plannerTitle').dataset.kind=actionMode;
  $('plannerSource').textContent=definition.get(selected)?.name||'Source';
  $('plannerInstructions').textContent=confirming?'Review your troops and target, then confirm or cancel.':'Adjust unit counts, then click a destination province on the map.';
  updateArmyReadouts();
  const status=currentOrderValidity();
  $('orderHint').textContent=status.message;
  $('orderHint').classList.toggle('order-warning',!status.valid&&confirming);
  $('confirmOrderBtn').disabled=!status.valid;
  $('confirmOrderBtn').classList.toggle('is-attack',actionMode==='attack');
  $('confirmOrderBtn').querySelector('span').textContent=actionMode==='attack'?'Confirm attack':'Confirm move';
}
function armAction(kind){
  if(!selected||!game||!assigned)return notice('Select your departure province first.');
  const state=game.provinces[selected-1];
  if(state.owner!==assigned&&!(relationWith(state.owner)==='ally'&&unitTotal(state.garrison?.[assigned])>0))
    return notice('Select a province containing your troops.');
  actionMode=kind;draftTarget=null;
  setPanel(null);
  notice(`Select ${kind==='attack'?'attack':'movement'} units with the sliders, then choose a destination.`);
  updateSidebar();queueRender();
}
function cancelDraftOrder(){
  actionMode=null;draftTarget=null;
  updateSidebar();queueRender();
}
function clearDeployment(){
  selected=null;draftTarget=null;lastCountSource=null;actionMode=null;
  if(activePanel==='army'||activePanel==='buildings')setPanel(null);
  updateSidebar();queueRender();
}
function clickWorld(cx,cy){
  if(!game||!map)return;
  const pos=worldFromClient(cx,cy),id=pixelProvince(pos.x,pos.y);
  if(redirectOrderId){if(!id)return;redirectTarget=id;setPanel('orders');renderOrders();queueRender();return;}
  if(actionMode&&selected){
    if(!id)return notice('Choose a land province or press Cancel to abandon the order.');
    if(id===selected)return notice('Choose a different destination.');
    draftTarget=id;
    updateSidebar();queueRender();
    return; // Selecting a target never sends troops; only Confirm dispatches.
  }
  if(!id){clearDeployment();return;}
  selected=selected===id?null:id;draftTarget=null;lastCountSource=null;
  if(selected&&game.provinces[selected-1].owner!==assigned){
    const n=game.provinces[selected-1].owner;if($('dipTarget'))$('dipTarget').value=n;
  }
  if(selected)setPanel('army');else if(activePanel==='army'||activePanel==='buildings')setPanel(null);
  updateSidebar();queueRender();
}

let pointer=null;
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1&&e.button!==2)return;
  canvas.setPointerCapture(e.pointerId);
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,panX:camera.panX,panY:camera.panY,drag:false,button:e.button};
});
canvas.addEventListener('pointermove',e=>{
  if(pointer&&pointer.id===e.pointerId){const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.hypot(dx,dy)>6)pointer.drag=true;
    if(pointer.drag){camera.panX=pointer.panX+dx;camera.panY=pointer.panY+dy;queueRender();}}
  const p=worldFromClient(e.clientX,e.clientY),id=pixelProvince(p.x,p.y);
  if(id!==hovered){hovered=id;queueRender();}
  const tip=$('hoverTip');if(!id||!game){tip.hidden=true;return;}
  const state=game.provinces[id-1];tip.hidden=false;tip.replaceChildren();
  tip.append(elem('b',definition.get(id).name),elem('div',nationNames[state.owner]),elem('span',state.visible?`${unitTotal(state.units)} host troops${Object.entries(state.garrison||{}).map(([nation,units])=>` · ${nationNames[nation]}: ${unitTotal(units)} stationed`).join('')}`:'Unknown garrison'));
  tip.style.left=Math.min(p.screenX+18,camera.cw-220)+'px';tip.style.top=Math.min(p.screenY+17,camera.ch-95)+'px';
});
canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.drag&&pointer.button===0)clickWorld(e.clientX,e.clientY);pointer=null;});
canvas.addEventListener('pointercancel',()=>pointer=null);
canvas.addEventListener('pointerleave',()=>{$('hoverTip').hidden=true;hovered=null;queueRender();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
  e.preventDefault();const before=worldFromClient(e.clientX,e.clientY);
  camera.zoom=Math.max(.75,Math.min(5,camera.zoom*(e.deltaY<0?1.14:1/1.14)));
  updateTransform();const after=worldFromClient(e.clientX,e.clientY);
  camera.panX+=(after.x-before.x)*camera.scale;camera.panY+=(after.y-before.y)*camera.scale;queueRender();
},{passive:false});
function zoom(f){camera.zoom=Math.max(.75,Math.min(5,camera.zoom*f));queueRender();}
$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(.8);
$('zoomReset').onclick=()=>{camera.zoom=1;camera.panX=0;camera.panY=0;queueRender();};
for(const t of ['infantry','tank','bomber'])$('army'+t[0].toUpperCase()+t.slice(1)).addEventListener('input',()=>{
  updateArmyReadouts();
  updateDispatchButtons();
});
function updateDispatchButtons(){
  const units=armyFormUnits();
  const hasUnits=unitTotal(units)>0;
  $('quickMove').disabled=!selected||!hasUnits;
  $('quickAttack').disabled=!selected||!hasUnits;
  updateOrderUI();
}
$('quickMove').onclick=()=>armAction('move');
$('quickAttack').onclick=()=>armAction('attack');
$('confirmOrderBtn').onclick=()=>{
  const check=currentOrderValidity();
  if(!check.valid)return notice(check.message);
  dispatch(actionMode);
};
$('cancelOrderBtn').onclick=cancelDraftOrder;
$('plannerCancel').onclick=cancelDraftOrder;
$('quickBuild').onclick=()=>{
  if(!selected||!game)return;
  if(game.provinces?.[selected-1]?.owner!==assigned)return notice('You can only construct in your own provinces.');
  setPanel('buildings');updateSidebar();
};
$('clearDestination').onclick=()=>{draftTarget=null;updateSidebar();queueRender();};
$('labelsMode').onchange=e=>{labels=e.target.checked;queueRender();};
$('dipTarget').onchange=()=>renderDiplomacy();
$('showAlly').onchange=e=>{movementPrefs.allyMoves=e.target.checked;socket.emit('preferences',movementPrefs);};
$('showHostile').onchange=e=>{movementPrefs.hostileMoves=e.target.checked;socket.emit('preferences',movementPrefs);};
for(const btn of document.querySelectorAll('.rail-btn[data-panel]')){
  btn.onclick=()=>setPanel(activePanel===btn.dataset.panel?null:btn.dataset.panel);
}
$('panelClose').onclick=()=>setPanel(null);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&actionMode){cancelDraftOrder();return;}if(e.key==='Escape'&&$('confirmModal').hidden&&$('nationModal').hidden){setPanel(null);}});
$('chatForm').onsubmit=e=>{e.preventDefault();const input=$('chatInput');if(input.value.trim())socket.emit('chat',{to:$('chatRecipient').value,message:input.value.trim()});input.value='';};
$('confirmYes').onclick=()=>{if(pendingOrder){socket.emit(pendingOrder.event,pendingOrder.data);if(pendingOrder.event==='move')clearDeployment();}pendingOrder=null;$('confirmModal').hidden=true;updateSidebar();queueRender();};
$('confirmNo').onclick=()=>{pendingOrder=null;$('confirmModal').hidden=true;};
$('joinForm').onsubmit=e=>{
  e.preventDefault();const code=$('roomInput').value.trim();
  if(!/^[0-9]{6}$/.test(code))return showJoinError('Please enter exactly six digits.');
  if(!socket.connected)return showJoinError('Not connected to the server.');
  $('joinError').hidden=true;socket.emit('joinRoom',code);
};
$('joinRandom').onclick=()=>{
  if(!socket.connected)return showJoinError('Not connected to the server.');
  $('joinError').hidden=true;socket.emit('joinRandom');
};
$('leaveQueue').onclick=()=>{socket.emit('leaveRoom');$('publicWaiting').hidden=true;room=null;assigned=null;isPublicMatch=false;$('joinModal').hidden=false;};
$('createRoom').onclick=()=>{
  if(!socket.connected)return showJoinError('Not connected to the server.');
  $('joinError').hidden=true;socket.emit('createRoom');
};
$('roomButton').onclick=()=>{
  if(room){if(!confirm('Leave your current campaign and choose another server? Your nation will be released.'))return;}
  $('joinError').hidden=true;$('returnGame').hidden=!room;$('joinModal').hidden=false;
};
$('returnGame').onclick=()=>{$('joinModal').hidden=true;};
$('copyRoom').onclick=copyRoomCode;
$('copyLobbyCode').onclick=copyRoomCode;
$('changeNation').onclick=showNationModal;
$('spectateButton').onclick=()=>{$('nationModal').hidden=true;};
$('restartButton').onclick=()=>{socket.emit('leaveRoom');$('victoryModal').hidden=true;};
function updateCampaignClock(state){
  const el=$('campaignDate');if(!el||!state)return;
  const day=Math.max(0,Number(state.campaignDay)||0);
  const now=new Date(Date.UTC(1939,9,6)+day*86400000);
  el.textContent=now.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).toUpperCase();
}
socket.on('connect',()=>{
  $('connectionDot').classList.add('online');$('connectionText').textContent='Server connected';
  if(room){if(isPublicMatch)socket.emit('joinRandom');else socket.emit('joinRoom',room);assigned=null;selected=null;}else if(showJoinOnConnect)$('joinModal').hidden=false;
});
socket.on('disconnect',()=>{$('connectionDot').classList.remove('online');$('connectionText').textContent='Server disconnected';notice('Connection lost; reconnecting…');});
socket.on('joined',({code,public:isPublic})=>{
  lastChatSeen=null;lastRequestsSeen='';$('chatBadge').hidden=true;$('diplomacyBadge').hidden=true;
  $('returnGame').hidden=false;paintKey='';
  room=code;isPublicMatch=!!isPublic;$('roomCode').textContent=isPublic?'PUBLIC '+code:code;$('lobbyRoomCode').textContent=code;$('joinModal').hidden=true;showJoinOnConnect=false;assigned=null;selected=null;setPanel(null);
  $('spectateButton').hidden=isPublicMatch;
  showNationModal();
  socket.emit('preferences',movementPrefs);updateSidebar();
});
socket.on('assigned',({nation})=>{assigned=nation;if(nation)$('nationModal').hidden=true;selected=null;paintKey='';updateSidebar();updateCountryAndOwner();queueRender();});
socket.on('state',next=>{
  // When a new chat or diplomacy request arrives, flag its icon without opening a panel.
  const latestId=next.chat?.at(-1)?.id??0;
  if(lastChatSeen!==null&&latestId>lastChatSeen&&activePanel!=='chat')$('chatBadge').hidden=false;
  lastChatSeen=Math.max(lastChatSeen??0,latestId);
  const requestKey=[...(next.requests||[]),...(next.peaceRequests||[])].filter(r=>r.to===assigned).map(r=>r.from+':'+r.to).sort().join('|');
  if(lastRequestsSeen!==''&&requestKey!==lastRequestsSeen&&requestKey&&activePanel!=='diplomacy')$('diplomacyBadge').hidden=false;
  lastRequestsSeen=requestKey;
  game=next;
  if(!$('nationModal').hidden)renderNationChoices();
  $('publicWaiting').hidden=!(next.public&&!next.started);
  if(next.public&&!next.started){$('waitingCount').textContent=`${next.playerCount} of 8 commanders connected. Match begins once all eight commanders select nations.`; $('waitingBar').style.width=(next.playerCount/8*100)+'%';$('waitingNation').textContent=assigned?`You will command ${nationNames[assigned]}.`:'Choose your nation to enter the campaign.';}
  const now=Date.now();if(now-lastSidebarAt>500){lastSidebarAt=now;updateSidebar();}updateCountryAndOwner();queueRender();
  $('victoryModal').hidden=!next.winner;
  if(next.winner)$('winnerName').textContent=next.winner.nations.map(n=>nationNames[n]).join(' + ')+' VICTORIOUS';
  const eliminated=!!(assigned&&next.started&&next.provinces.every(p=>p.owner!==assigned));
  if(eliminated&&!next.winner){$('victoryModal').hidden=false;$('winnerName').textContent='NATION ELIMINATED';$('victoryDescription').textContent='Your nation has lost every province. Return to the main menu to join another campaign.';$('restartButton').textContent='Return to main menu';}
  else {$('restartButton').textContent='Return to main menu';$('victoryDescription').textContent='Victory requires 51% of territories solo, or 67% of territories with an ally.';}
  updateCampaignClock(next);
});
socket.on('errorMessage',msg=>notice(String(msg)));
socket.on('joinError',msg=>{showJoinError(String(msg));$('joinModal').hidden=false;});
socket.on('orderAccepted',o=>notice(`Army dispatched · ETA ${fmtSeconds((o.arrivalAt-Date.now())/1000)}`));
socket.on('leftRoom',()=>{room=null;assigned=null;game=null;paintKey='';isPublicMatch=false;selected=null;draftTarget=null;actionMode=null;redirectOrderId=null;redirectTarget=null;$('publicWaiting').hidden=true;$('joinModal').hidden=false;updateSidebar();queueRender();});
setInterval(()=>{
  for(const el of document.querySelectorAll('.order-remaining'))el.textContent=fmtSeconds((Number(el.dataset.arrival)-Date.now())/1000);
  // polling UI for money and timers: state updates from server every 100 ms or from game timer
},250);
(async function init(){
  try{
    const [data,terrain,territories,borders]=await Promise.all([
      fetch('/map.json').then(async r=>{if(!r.ok)throw Error('Map unavailable');return r.json();}),
      image('/assets/europe-map.png'),image('/assets/province-ids.png'),image('/assets/province-lines.png')
    ]);
    map=data;mapImage=terrain;territoryImage=territories;borderImage=borders;
    for(const p of map.provinces)definition.set(p.id,p);
    for(const [id,nation] of Object.entries(map.nations)){nationColor[id]=nation.color;nationNames[id]=nation.name;}
    const scratch=document.createElement('canvas');scratch.width=map.width;scratch.height=map.height;
    const sc=scratch.getContext('2d',{willReadFrequently:true});sc.drawImage(territoryImage,0,0);
    idPixels=sc.getImageData(0,0,map.width,map.height).data;
    sc.clearRect(0,0,map.width,map.height);sc.drawImage(mapImage,0,0);originalPixels=sc.getImageData(0,0,map.width,map.height).data;
    updateSidebar();if(game){updateLabels();rebuildTint();}resize();new ResizeObserver(resize).observe(canvas.parentElement);
  }catch(e){console.error('Game initialization failed:',e);notice(`Map initialization error: ${e.message||e}`);}
})();

// Army selection shortcuts; one-click full army by default, manual edits remain possible.
$('armySelectAll').addEventListener('click',()=>setArmyPreset(true));
$('armySelectNone').addEventListener('click',()=>setArmyPreset(false));
