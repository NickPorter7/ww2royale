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

const AUDIO_FILES = {
  music:'/assets/audio/war-impact.mp3',
  click:'/assets/audio/click.wav',
  build:'/assets/audio/build.wav',
  message:'/assets/audio/message.wav',
  infantry:'/assets/audio/buy-infantry.wav',
  tank:'/assets/audio/buy-tank.wav',
  plane:'/assets/audio/move-plane.wav',
  move:'/assets/audio/move.wav',
  attack:'/assets/audio/attack.wav'
};
function unlockAudio(){
  if(soundState.ready) return;
  soundState.ready = true;
  if(!soundState.music){
    const music = new Audio(AUDIO_FILES.music);
    music.loop = true; music.volume = 0.22; music.preload = 'auto';
    // The chosen Pixabay MP3 is user-supplied. Preserve existing audio as fallback.
    music.addEventListener('error',()=>{
      if(music.dataset.fallback==='true')return;
      music.dataset.fallback='true'; music.src='/assets/audio/music-loop.wav';
      if(soundState.enabled)music.play().catch(()=>{});
    });
    soundState.music = music;
  }
  soundState.music.play().catch(()=>{});
}
function playSound(kind, opts={}){
  if(!soundState.enabled || !AUDIO_FILES[kind]) return;
  unlockAudio();
  const a = new Audio(AUDIO_FILES[kind]);
  a.volume = Math.max(0, Math.min(1, opts.volume ?? 0.55));
  a.play().catch(()=>{});
}
function orderSound(units, kind){
  if(kind==='attack') return 'attack';
  if((units?.bomber||0)>0) return 'plane';
  if((units?.tank||0)>0) return 'tank';
  return 'move';
}
window.addEventListener('pointerdown', unlockAudio, {once:true});
window.addEventListener('keydown', unlockAudio, {once:true});
document.addEventListener('click', event=>{
  const btn = event.target.closest('button');
  if(!btn || btn.disabled) return;
  const now = performance.now();
  if(now-soundState.lastButtonAt<45) return;
  soundState.lastButtonAt = now;
  playSound('click',{volume:0.35});
}, true);

let map, mapImage, territoryImage, borderImage, idPixels, originalPixels, tintCanvas, smoothBorderCanvas;
let unitArt = {};
let soundState = {ready:false,music:null,enabled:true,lastButtonAt:0};
let definition = new Map(), nationColor = {}, nationNames = {};
let game = null, assigned = null, selected = null, hovered = null, room = null;
// Treasury is authoritative on every server tick, but numbers on screen update only every 5 seconds.
const TREASURY_DISPLAY_INTERVAL_MS=5000;
let treasuryDisplay={value:null,at:0,nation:null};
function displayedTreasury(){
  if(!assigned||!game){treasuryDisplay={value:null,at:0,nation:null};return null;}
  const now=performance.now();
  if(treasuryDisplay.nation!==assigned||treasuryDisplay.value===null||now-treasuryDisplay.at>=TREASURY_DISPLAY_INTERVAL_MS){
    treasuryDisplay={value:Number(game.money)||0,at:now,nation:assigned};
  }
  return treasuryDisplay.value;
}
let deployingBalloonId=null, currentSeason="autumn", seasonAssets={}, currentSeasonImage=null;
let seasonIntensity=0.35, weatherIntensity=0.35;
let labels = true, pendingOrder=null, draftTarget=null, redirectOrderId=null, redirectTarget=null, isPublicMatch=false;
let lastCountSource=null,lastSidebarAt=0,lastChoiceKey='',lastBuildRenderKey='';
let actionMode=null, territoryBorderCanvas=null, paintKey='';
let selectedSources=[], selectingMore=false, focusedOrderId=null;
let navalMode=false, navalSelection=null;
let movementPrefs={allyMoves:true,hostileMoves:true};
let showJoinOnConnect = true;
let activePanel = null;
let lastChatSeen = null;
let lastNewsSeen=null,lastNewsRenderKey=null,lastBattleRenderKey=null,capitalBannerTimer=null;
let battleFxEnabled=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const activeBattleFx=[];
let lastRequestsSeen = '';
const PANEL_INFO = {
  army:['ARMY COMMAND','Army management'],
  buildings:['INFRASTRUCTURE','Province buildings'],
  diplomacy:['FOREIGN AFFAIRS','Diplomacy'],
  chat:['COMMUNICATIONS','Messages'],
  orders:['GENERAL STAFF','Army movements'],
  rankings:['GLOBAL INTELLIGENCE','World standings'],
  reports:['BATTLE INTELLIGENCE','After-action reports'],
  news:['WAR CHRONICLE','War Newspaper'],
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
  if(name==='news'){ $('newsBadge').hidden=true;renderWarNews(); }
  if(name==='reports')renderBattleReports();
}
function showJoinError(message){ $('joinError').textContent=message; $('joinError').hidden=false; }
async function copyRoomCode(){
  if(!room)return notice('Create or join a server first.');
  try{await navigator.clipboard.writeText(room);notice('Server code '+room+' copied.');}
  catch{notice('Invite code: '+room);}
}

let toastTimeout;
const camera = {zoom:window.matchMedia('(max-width:700px)').matches?2.9:1,panX:0,panY:0,scale:1,tx:0,ty:0,cw:0,ch:0};
let renderPending = false;
// Compare incoming order times with a monotonic clock synchronized to the server.
let gameClockServerAt = 0, gameClockClientAt = 0;
function gameNow(){ return gameClockServerAt ? gameClockServerAt+(performance.now()-gameClockClientAt) : Date.now(); }
const ownerMap = new Map();

function notice(text,kind='info'){
  const stack=$('toastStack');if(!stack)return;
  const node=document.createElement('div');node.className='float-toast '+kind;node.textContent=String(text);
  stack.append(node);
  while(stack.children.length>4)stack.firstElementChild.remove();
  node.addEventListener('animationend',()=>node.remove(),{once:true});
  setTimeout(()=>node.remove(),3200);
}
function syncElapsed(){
  if(!game||!game.started){$('elapsedClock').textContent='00:00';return;}
  const n=Math.max(0,Math.floor((game.elapsedSeconds||0)+(gameNow()-(game.serverTime||gameNow()))/1000));
  const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;
  $('elapsedClock').textContent=h?`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function seasonalDepth(date){
  // Progress grows from early season toward its centre, then decreases.
  const month=date.getUTCMonth(), day=date.getUTCDate();
  const seasonMonth=(month+1)%3; // Dec/Mar/Jun/Sep are 0, next months 1 and 2.
  const progress=Math.min(1,(seasonMonth+(day-1)/30.5)/3);
  return Math.max(.17,Math.min(1,.17+.83*Math.sin(Math.PI*progress)));
}
function setSeason(season, depth=0.5){
  const weather=$('weatherLayer');
  const next=Math.max(.17,Math.min(1,depth));
  const changed=season!==currentSeason||weather.dataset.ready!=='yes';
  seasonIntensity=next;weatherIntensity=next;
  weather.style.opacity=String(.35+.65*next);
  const updateParticleDensity=()=>{
    const nodes=[...weather.querySelectorAll('.weather-particle')];
    const visible=Math.round(nodes.length*next);
    nodes.forEach((particle,i)=>{particle.style.opacity=i<visible?'':'0';});
  };
  if(!changed){updateParticleDensity();queueRender();return;}
  currentSeason=season; currentSeasonImage=seasonAssets[season]||null;
  weather.className='weather-layer '+season;weather.replaceChildren();
  if(season!=='summer'){
    const mobile=window.matchMedia('(max-width:700px)').matches;
    // Density increases visually toward the deepest part of the season.
    const count=season==='winter'?(mobile?92:156):(mobile?24:45);
    for(let i=0;i<count;i++){
      const flake=document.createElement('span');flake.className='weather-particle';
      flake.style.setProperty('--x',`${(i*61.8034)%100}%`);
      if(season==='winter'){flake.style.setProperty('--size',`${2+(i%5)*0.75}px`);flake.style.setProperty('--blur',`${(i%4)*0.35}px`);}
      flake.style.setProperty('--speed',`${6+(i%9)*1.1}s`);
      flake.style.setProperty('--delay',`${-(i*2.17)%15}s`);
      flake.style.setProperty('--drift',`${(i%2===0?1:-1)*(12+(i%8)*9)}px`);
      flake.style.setProperty('--opacity',`${.30+(i%6)*.08}`);
      weather.append(flake);
    }
  }
  weather.dataset.ready='yes';updateParticleDensity();queueRender();
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
function focusNationOnMobile(nation){
  if(!map||!nation||!window.matchMedia('(max-width:700px)').matches)return;
  const provinces=map.provinces.filter(p=>p.nation===nation);
  if(!provinces.length)return;
  const points=provinces.flatMap(p=>(p.paths||[]).flat());
  const xs=points.map(pt=>pt[0]),ys=points.map(pt=>pt[1]);
  if(!xs.length)return;
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const fit=Math.min(camera.cw/map.width,camera.ch/map.height);
  if(!(fit>0))return;
  // Fit the complete starting nation at roughly 76% of viewport width and
  // 62% of height. Small nations (Portugal, Hungary, Romania) now open large
  // enough to tap individual provinces without immediately pinch-zooming.
  const zoomW=camera.cw*.76/(Math.max(60,right-left)*fit);
  const zoomH=camera.ch*.62/(Math.max(60,bottom-top)*fit);
  camera.zoom=Math.max(2.9,Math.min(9,zoomW,zoomH));
  const scale=fit*camera.zoom;
  const cx=(left+right)/2,cy=(top+bottom)/2;
  camera.panX=(map.width/2-cx)*scale;
  camera.panY=(map.height/2-cy)*scale;
  queueRender();
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
  const icon=unitArt[type];
  ctx.save();ctx.globalAlpha*=alpha;ctx.translate(x,y);
  ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=8;ctx.shadowOffsetY=2;
  if(icon&&icon.complete){
    const size=34;
    ctx.drawImage(icon,-size/2,-size/2,size,size);
    ctx.shadowBlur=0;
    ctx.strokeStyle=tint;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.stroke();
  }else{
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
  }
  ctx.restore();
}


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
// Detailed province paths follow the actual ID-mask contours. No per-province
// corner rounding: different neighbours must NEVER diverge from shared edges.
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
function buildProvinceBorderCanvas(){
  if(!map||!idPixels)return null;
  const w=map.width,h=map.height;
  const canvas=document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const c=canvas.getContext('2d');
  const img=c.createImageData(w,h);
  const edge=new Uint8Array(w*h);
  const expand=new Uint8Array(w*h);
  const getId=(x,y)=>{const i=(y*w+x)*4; return idPixels[i+3]? idPixels[i] : 0;};
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const id=getId(x,y); if(!id) continue;
    const left=getId(x-1,y), right=getId(x+1,y), up=getId(x,y-1), down=getId(x,y+1);
    if((left&&left!==id)||(right&&right!==id)||(up&&up!==id)||(down&&down!==id)) edge[y*w+x]=1;
  }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x; if(!edge[i]) continue;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) expand[i+dy*w+dx]=1;
  }
  for(let i=0;i<w*h;i++){
    const k=i*4;
    if(expand[i]){
      img.data[k]=22; img.data[k+1]=29; img.data[k+2]=31; img.data[k+3]=130;
    }
    if(edge[i]){
      img.data[k]=244; img.data[k+1]=240; img.data[k+2]=224; img.data[k+3]=215;
    }
  }
  c.putImageData(img,0,0);
  return canvas;
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
  const now=gameNow();ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  for(const order of game.movements){
    const info=orderPosition(order,now);if(!info)continue;
    const {pts,i,x,y}=info;
    const friendly=order.nation===assigned;
    const tint=friendly?'#f7e4a9':relationWith(order.nation)==='ally'?'#74b8e8':'#ed807b';
    ctx.beginPath();ctx.moveTo(x,y);
    for(let j=i+1;j<pts.length;j++)ctx.lineTo(pts[j].x,pts[j].y);
    ctx.lineWidth=3.6;ctx.strokeStyle='rgba(6,14,20,.9)';ctx.setLineDash([]);ctx.stroke();
    ctx.lineWidth=2.2;ctx.strokeStyle=tint;ctx.setLineDash([11,8]);ctx.lineDashOffset=-now/85;ctx.stroke();ctx.setLineDash([]);
    // The highest-tier unit present determines the moving-army icon:
    // bomber > tank > infantry. No triangular route arrowhead.
    if(order.id===focusedOrderId){ctx.save();ctx.strokeStyle='#ffe9a7';ctx.lineWidth=3;ctx.shadowColor='#f2c45a';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(x,y,29,0,Math.PI*2);ctx.stroke();ctx.restore();}
    drawUnitIcon(x,y,selectedArmyIcon(order.units||{[order.type]:order.count}),tint);
    const maxHP=(order.units?.infantry||0)*24+(order.units?.tank||0)*95+(order.units?.bomber||0)*42;
    const remainingHP=Object.values(order.healthByType||{}).reduce((total,value)=>total+Number(value||0),0);
    const health=maxHP?Math.max(0,Math.min(1,remainingHP/maxHP)):1;
    ctx.save();ctx.fillStyle='rgba(5,15,19,.90)';ctx.fillRect(x-21,y+22,42,6);
    ctx.fillStyle=health>.6?'#69ce81':health>.28?'#f2c05c':'#de6866';ctx.fillRect(x-20,y+23,40*health,4);ctx.restore();
    // Animated army counter rides with the arrow instead of sitting at its source.
    const movingCount=unitTotal(order.units||{[order.type]:order.count});
    const token=String(movingCount);
    const badgeW=Math.max(25,ctx.measureText(token).width+14);
    ctx.font='800 12px Inter,Arial,sans-serif';
    ctx.fillStyle='rgba(7,18,26,.96)';ctx.strokeStyle=tint;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.roundRect(x-badgeW/2,y+10,badgeW,22,7);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(token,x,y+21);
    const label=`${armyDescription(order)} · ${fmtSeconds((order.arrivalAt-now)/1000)}`;
    ctx.font='700 13px Inter,Arial,sans-serif';const w=ctx.measureText(label).width+16;
    ctx.fillStyle='rgba(9,21,27,.92)';ctx.strokeStyle=tint;ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x-w/2,y-38,w,24,5);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff3d5';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y-26);
  }
  ctx.restore();
}
// Ghost order preview: route and advancing icon are intentionally faint until
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
  let total=0;const lengths=[];for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lengths.push(d);total+=d;}
  let travelled=(performance.now()/21)%Math.max(1,total),x=pts[0].x,y=pts[0].y;
  for(let i=0;i<lengths.length;i++){
    if(travelled<=lengths[i]){const t=travelled/Math.max(1,lengths[i]);x=pts[i].x+(pts[i+1].x-pts[i].x)*t;y=pts[i].y+(pts[i+1].y-pts[i].y)*t;break;}
    travelled-=lengths[i];
  }
  drawUnitIcon(x,y,selectedArmyIcon(armyFormUnits()),tint,.85);
  ctx.restore();queueRender();
}
function drawNavalMovements(){
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
function spyMapPosition(balloon){
  const move=balloon.movement;
  if(!move){const p=definition.get(balloon.province);return p?{x:p.x+21,y:p.y-30}:null;}
  const points=move.path||[];
  const f=Math.max(0,(gameNow()-move.startedAt)/Math.max(1,move.stepMs));
  const leg=Math.max(0,Math.min(points.length-2,Math.floor(f)));
  const a=definition.get(points[leg]),b=definition.get(points[leg+1]);
  if(!a||!b)return null;
  const start=leg===0&&move.visualStart?move.visualStart:a;
  const t=Math.max(0,Math.min(1,f-leg));
  return {x:start.x+(b.x-start.x)*t,y:start.y+(b.y-start.y)*t};
}
function drawSpyBalloons(){
  if(!game?.spyBalloons?.length)return;
  const now=gameNow();
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  const stationary=new Map();
  for(const spy of game.spyBalloons){
    if(spy.movement){
      const m=spy.movement,steps=m.path||[];
      const fraction=Math.max(0,(now-m.startedAt)/Math.max(1,m.stepMs));
      const leg=Math.max(0,Math.min(steps.length-2,Math.floor(fraction)));
      const a=definition.get(steps[leg]),b=definition.get(steps[leg+1]);
      if(!a||!b)continue;
      const progress=Math.max(0,Math.min(1,fraction-leg));
      const pos=spyMapPosition(spy);
      if(!pos)continue;
      const {x,y}=pos;
      ctx.save();
      ctx.strokeStyle='#c6d5ba';ctx.lineWidth=1.6;ctx.setLineDash([4,6]);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);
      const art=unitArt.balloon;
      if(art?.complete)ctx.drawImage(art,x-16,y-22,32,35);
      else{ctx.fillStyle='#efe2bd';ctx.beginPath();ctx.ellipse(x,y,8,12,0,0,Math.PI*2);ctx.fill();}
      ctx.font='800 10px Arial';ctx.fillStyle='#fff1cd';
      ctx.fillText(fmtSeconds((m.arrivalAt-now)/1000),x,y-28);
      ctx.restore();
      continue;
    }
    const key=spy.province+':'+spy.nation;
    stationary.set(key,(stationary.get(key)||0)+1);
  }
  for(const [key,count] of stationary){
    const [id,nation]=key.split(':'),p=definition.get(Number(id));if(!p)continue;
    const x=p.x+21,y=p.y-30;
    ctx.strokeStyle=nation===assigned?'#e6d196':'#89c0f3';ctx.lineWidth=1.4;
    const art=unitArt.balloon;
    if(art?.complete)ctx.drawImage(art,x-17,y-20,34,38);
    else{ctx.fillStyle='#f4e3ad';ctx.beginPath();ctx.ellipse(x,y,10,14,0,0,Math.PI*2);ctx.fill();}
    ctx.font='900 12px Arial';ctx.fillStyle='#f9f2dc';ctx.strokeStyle='#0b1d26';ctx.lineWidth=3;
    ctx.strokeText(String(count),x,y+22);ctx.fillText(String(count),x,y+22);
  }
  ctx.restore();
}
function drawTroops(){
  if(!game||!map)return;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  const scale=Math.max(.75,Math.min(2.0,camera.scale));
  const size=12/scale;
  ctx.font=`800 ${size}px Inter,Arial,sans-serif`;
  for(const p of map.provinces){
    const state=game.provinces?.[p.id-1];
    // The backend redacts non-visible units. Never show question marks or numbers
    // for classified provinces; never infer counts from ownership alone.
    if(!state?.visible||!state.units)continue;
    const count=unitTotal(state.units);
    const garrisons=Object.entries(state.garrison||{}).filter(([,a])=>unitTotal(a)>0);
    if(!count&&!garrisons.length)continue;
    const type=selectedArmyIcon(state.units);
    const icon=unitArt[type];
    const x=p.x,y=p.y;
    const label=String(count);
    const width=Math.max(27/scale,ctx.measureText(label).width+22/scale),height=20/scale;
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,.42)';ctx.shadowBlur=4/scale;
    ctx.fillStyle=state.owner===assigned?'rgba(14,41,41,.9)':'rgba(24,34,39,.84)';
    ctx.strokeStyle=state.owner===assigned?'rgba(217,239,207,.84)':'rgba(215,227,229,.7)';
    ctx.lineWidth=1/scale;
    ctx.beginPath();ctx.roundRect(x-width/2,y-height/2,width,height,3/scale);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;
    const iconSize=14/scale;
    if(icon?.complete)ctx.drawImage(icon,x-width/2+2/scale,y-iconSize/2,iconSize,iconSize);
    ctx.fillStyle='#f7f0db';ctx.textAlign='right';
    ctx.fillText(label,x+width/2-4/scale,y+0.6/scale);
    ctx.restore();
    // Persisted server health pools make this a real garrison HP bar.
    const fullHP=(state.units.infantry||0)*24+(state.units.tank||0)*95+(state.units.bomber||0)*42;
    const hp=Object.values(state.healthByType||{}).reduce((v,n)=>v+Number(n||0),0);
    const hpFraction=fullHP?Math.max(0,Math.min(1,hp/fullHP)):1;
    ctx.fillStyle='rgba(9,17,20,.8)';ctx.fillRect(x-18/scale,y+11/scale,36/scale,4/scale);
    ctx.fillStyle=hpFraction>.6?'#73c88d':hpFraction>.25?'#e0bf65':'#d96461';
    ctx.fillRect(x-17/scale,y+12/scale,(34*hpFraction)/scale,2/scale);
    let line=0;
    for(const [nation,stack] of garrisons){
      const allyCount=unitTotal(stack);
      if(!allyCount)continue;
      const allyText=`${nation} ${allyCount}`;
      ctx.font=`800 ${10/scale}px Inter,Arial,sans-serif`;
      const aw=ctx.measureText(allyText).width+12/scale;
      const ay=y+height/2+9/scale+(line++)*15/scale;
      ctx.fillStyle='rgba(11,30,39,.88)';ctx.strokeStyle=nationColor[nation]||'#a1cfff';
      ctx.beginPath();ctx.roundRect(x-aw/2,ay-6/scale,aw,13/scale,3/scale);ctx.fill();ctx.stroke();
      ctx.fillStyle='#f2f6ff';ctx.textAlign='center';ctx.fillText(allyText,x,ay);
    }
    ctx.font=`800 ${size}px Inter,Arial,sans-serif`;
  }
  ctx.restore();
}
function drawCapitals(){
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
function draw(){
  const dpr=canvas.width/Math.max(1,camera.cw);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,camera.cw,camera.ch);
  ctx.fillStyle='#092632';ctx.fillRect(0,0,camera.cw,camera.ch);
  if(!map||!mapImage)return;updateTransform();
  ctx.save();ctx.translate(camera.tx,camera.ty);ctx.scale(camera.scale,camera.scale);
  ctx.drawImage(mapImage,0,0);if(tintCanvas)ctx.drawImage(tintCanvas,0,0);if(currentSeasonImage){
    ctx.save();
    ctx.globalAlpha=.23+.77*seasonIntensity;
    ctx.drawImage(currentSeasonImage,0,0);
    ctx.restore();
  }
  // Province boundaries use the shared, pixel-aligned border asset.
  // Previous release referenced a removed canvas and crashed all map rendering.
  if(borderImage)ctx.drawImage(borderImage,0,0);
  if(territoryBorderCanvas)ctx.drawImage(territoryBorderCanvas,0,0);
  drawLabels();drawMovements();drawNavalMovements();drawDraftRoute();
  drawOutline(hovered,'rgba(251,236,157,.8)',2.7);
  for(const id of selectedSources.filter(id=>id!==selected))drawOutline(id,'#8adbb8',2.3);
  drawOutline(draftTarget?null:selected,'#ffdc87',4);drawOutline(redirectTarget,'#ffbc76',3);
  drawSpyBalloons();drawTroops();drawCapitals();drawBattleEffects();ctx.restore();if(game?.movements?.length||game?.navalMovements?.length||game?.spyBalloons?.some(b=>b.movement))queueRender();
}
function createButton(label,action,cls=''){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  if(cls)b.className=cls;b.onclick=action;return b;
}
function elem(tag,txt,cls=''){const el=document.createElement(tag);el.textContent=txt;if(cls)el.className=cls;return el;}

function nationTrait(nation){return game?.nationTraits?.[nation]||null;}
function adjustedCost(base,kind){
  const trait=nationTrait(assigned);
  const applies=(kind==='port'&&trait?.kind==='portCost')||
    (kind==='infantry'&&trait?.kind==='infantryCost')||
    (kind==='tank'&&trait?.kind==='tankCost')||
    (['destroyer','submarine','battleship'].includes(kind)&&trait?.kind==='shipCost');
  return applies?Math.round(base*trait.value*100)/100:base;
}
function renderWarNews(){
  if(activePanel!=='news')return;
  const entries=game?.warNews||[],key=entries.map(e=>e.id).join(',');
  if(key===lastNewsRenderKey)return;
  lastNewsRenderKey=key;
  const target=$('warNewsList');target.replaceChildren();
  if(!entries.length){target.append(elem('p','No major dispatches yet. The first significant battle or diplomatic change will appear here.','news-empty'));return;}
  for(const event of entries){
    const card=elem('article','','war-story'+(event.kind==='capitalFall'?' war-story-capital':''));
    const meta=elem('div','','war-story-meta');
    meta.append(elem('span',(event.kind||'news').replace(/([A-Z])/g,' $1').toUpperCase()),elem('time',new Date(event.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));
    const title=elem('h3',event.headline||'Dispatch');
    const detail=elem('p',event.summary||'');
    card.append(meta,title,detail);
    if(event.actor&&map?.nations?.[event.actor]){
      const byline=elem('div','','war-story-byline');byline.append(nationFlag(event.actor),elem('span',nationNames[event.actor]||event.actor));card.append(byline);
    }
    target.append(card);
  }
}
function lossString(before={},after={}){
  const labels={infantry:'Inf',tank:'Tank',bomber:'Air',destroyer:'Dest',submarine:'Sub',battleship:'BB'};
  return Object.keys(labels).filter(t=>(before[t]||0)>0).map(t=>`${labels[t]} ${Math.max(0,(before[t]||0)-(after[t]||0))}`).join(' · ')||'No casualties';
}
function renderBattleReports(){
  if(activePanel!=='reports')return;
  const reports=game?.battleReports||[],key=reports.map(e=>e.id).join(',');
  if(key===lastBattleRenderKey)return;
  lastBattleRenderKey=key;
  const target=$('battleReportList');target.replaceChildren();
  if(!reports.length){target.append(elem('div','No battles involving your nation have been reported.','news-empty'));return;}
  for(const r of reports){
    const card=elem('article','','battle-report-card');
    const friendly=r.attacker===assigned;
    const head=elem('div','','battle-report-head');
    head.append(elem('strong',`${r.kind==='naval'?'NAVAL CLASH':'BATTLE'} · ${definition.get(r.province)?.name||'Unknown'}`),
      elem('time',new Date(r.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));
    const countries=elem('div','','battle-report-parties');
    countries.append(nationFlag(r.attacker),elem('span',nationNames[r.attacker]||r.attacker),elem('b','VS'),nationFlag(r.defender),elem('span',nationNames[r.defender]||r.defender));
    const result=elem('p',`${r.won?'Territory / fleet breakthrough':'Defenders held or assault repelled'} · ${friendly?'Attacking':'Defending'} commander`,'battle-result');
    const losses=elem('div','','battle-losses');
    const att=elem('div','','battle-loss');att.append(elem('small','ATTACKER LOSSES'),elem('strong',lossString(r.attackerBefore,r.attackerAfter)));
    const def=elem('div','','battle-loss');def.append(elem('small','DEFENDER LOSSES'),elem('strong',lossString(r.defenderBefore,r.defenderAfter)));
    losses.append(att,def);card.append(head,countries,result,losses);target.append(card);
  }
}
function showCapitalFall(event){
  const banner=$('capitalBanner');if(!banner)return;
  $('capitalBannerTitle').textContent=event.headline||'CAPITAL CAPTURED';
  $('capitalBannerDetail').textContent=event.summary||'The balance of power has changed';
  banner.hidden=false;banner.classList.remove('capital-banner-enter');void banner.offsetWidth;banner.classList.add('capital-banner-enter');
  clearTimeout(capitalBannerTimer);
  capitalBannerTimer=setTimeout(()=>{banner.hidden=true;},4100);
}
function processWarEffects(next){
  const entries=next.warNews||[];
  const highest=entries[0]?.id??0;
  if(lastNewsSeen===null){lastNewsSeen=highest;return;}
  if(highest<=lastNewsSeen)return;
  const unseen=entries.filter(e=>e.id>lastNewsSeen).reverse();
  lastNewsSeen=highest;
  if(activePanel!=='news'&&unseen.length)$('newsBadge').hidden=false;
  for(const item of unseen.slice(-8)){
    if(item.kind==='capitalFall'){
      showCapitalFall(item);playSound('attack',{volume:.45});
    } else if(item.kind==='landBattle'||item.kind==='navalBattle'){
      if(battleFxEnabled&&Number.isInteger(item.province)){
        activeBattleFx.push({id:item.id,province:item.province,kind:item.kind,started:performance.now()});
        if(activeBattleFx.length>8)activeBattleFx.shift();
      }
    }
  }
}
function drawBattleEffects(){
  if(!battleFxEnabled||!activeBattleFx.length)return;
  const now=performance.now();
  for(let i=activeBattleFx.length-1;i>=0;i--){
    const effect=activeBattleFx[i],elapsed=now-effect.started;
    if(elapsed>2300){activeBattleFx.splice(i,1);continue;}
    const province=definition.get(effect.province);if(!province)continue;
    const x=province.x,y=province.y,radius=8+(elapsed/2300)*38,fade=1-elapsed/2300;
    ctx.save();ctx.globalAlpha=fade*.68;
    ctx.strokeStyle=effect.kind==='naval'?'#b4e4eb':'#ffbc71';ctx.lineWidth=2.4;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
    for(let j=0;j<8;j++){
      const angle=j*Math.PI/4+effect.id*1.3,rad=radius*.5;
      const px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad;
      ctx.fillStyle=j%2?'#d9c9ab':'#ffad70';
      ctx.beginPath();ctx.arc(px,py,1.8+2*fade,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  if(activeBattleFx.length)queueRender();
}
const TUTORIAL_LESSONS=[
  {title:'Choose your country',copy:'You are about to command France. Every nation controls its own provinces and armies.',button:'Take command of France',feedback:'France selected. Your capital is Paris.'},
  {title:'Prepare your army',copy:'Barracks unlock infantry purchases. Recruit three additional infantry before issuing an order.',button:'Recruit 3 Infantry',feedback:'Three infantry recruited in Paris. Your army is getting stronger.'},
  {title:'Move your troops',copy:'Movement takes time. Send a portion of your infantry from Paris to friendly Lyon.',button:'Move 10 troops to Lyon',feedback:'Troops have deployed to Lyon. Real matches show their travel progress.'},
  {title:'Capture enemy territory',copy:'To invade a neutral country you must confirm a declaration of war. Attack the simulated enemy-held Strasbourg.',button:'Declare war and capture Strasbourg',feedback:'Strasbourg captured. You expanded your country by one province.'},
  {title:'Use diplomacy',copy:'Military power matters, but diplomacy can protect your borders. Send a simulated alliance request.',button:'Request an alliance',feedback:'Training complete. Diplomacy and planning can decide a match.'}
];
let tutorialStep=0;
function renderTutorial(){
  const lesson=TUTORIAL_LESSONS[tutorialStep],done=tutorialStep>=TUTORIAL_LESSONS.length;
  $('tutorialStepCount').textContent=done?'TRAINING COMPLETE':`LESSON ${tutorialStep+1} / ${TUTORIAL_LESSONS.length}`;
  $('tutorialHeading').textContent=done?'Ready to command Europe':lesson.title;
  $('tutorialText').textContent=done?'You have practiced recruitment, movement, attack and diplomacy. Start a real match whenever you are ready.':lesson.copy;
  $('tutorialProgressFill').style.width=`${(Math.min(tutorialStep,TUTORIAL_LESSONS.length)/TUTORIAL_LESSONS.length)*100}%`;
  $('tutorialAction').textContent=done?'Close training':lesson.button;
  $('trainingParisCount').textContent=tutorialStep>=2?'28':'25';
  $('trainingLyonCount').textContent=tutorialStep>=3?'25':'15';
  $('trainingStrasCount').textContent=tutorialStep>=4?'10':'20';
  $('tutorialFeedback').textContent=done?'You can repeat this training from the command menu.':tutorialStep===0?'This is a separate practice exercise. No live multiplayer actions are sent.':TUTORIAL_LESSONS[tutorialStep-1].feedback;
  for(const [index,name] of [[0,'paris'],[1,'lyon'],[2,'strasbourg']]){
    const node=document.querySelector('.training-'+name);
    node?.classList.toggle('training-captured',index===2&&tutorialStep>=4);
  }
}
function openTutorial(){tutorialStep=0;$('tutorialModal').hidden=false;renderTutorial();}
function closeTutorial(){$('tutorialModal').hidden=true;}

function renderProvinceStats(state,visible){
  const troops=$('selectionDetails'),builds=$('buildingDetails');
  troops.replaceChildren();builds.replaceChildren();
  if(!visible){
    troops.append(elem('div','Intelligence classified. Approach from a bordering province, negotiate an alliance, or deploy a spy balloon.','locked-info'));
    builds.append(elem('div','Infrastructure classified until recon is available.','locked-info'));
    return;
  }
  const grid=elem('div','','unit-grid');
  for(const [kind,label,role] of [['infantry','Infantry','LAND'],['tank','Tanks','ARMOURED'],['bomber','Bombers','AIR']]){
    const tile=elem('div','','unit-tile');tile.append(elem('small',label),elem('strong',Number(state.units?.[kind]||0).toLocaleString()),elem('em',role));grid.append(tile);
  }
  troops.append(elem('div','STATIONED TROOPS','detail-heading'),grid);
  for(const [nation,stack] of Object.entries(state.garrison||{})){
    if(!unitTotal(stack))continue;
    const item=elem('div','','garrison-line');
    const title=elem('strong',`${nationNames[nation]||nation} · allied garrison`);
    title.style.color=nationColor[nation]||'#f4e1b5';
    item.append(title,elem('span',`${stack.infantry||0} infantry · ${stack.tank||0} tanks · ${stack.bomber||0} bombers`));troops.append(item);
  }
  const banks=Number(state.buildings?.bank||0);
  const metrics=elem('div','','build-metrics');
  for(const [value,label] of [[cash(banks*.18)+'/s','BANK INCOME'],[String(banks)+'/3','BANK LEVEL'],[state.buildings?.defense?'ACTIVE':'NONE','DEFENCE']]){
    const tile=elem('div','','build-metric');tile.append(elem('span',label),elem('strong',value));metrics.append(tile);
  }
  builds.append(metrics);
  const list=elem('div','','buildings-list');
  for(const [key,label,icon,benefit] of [
    ['barracks','Barracks','ico-barracks','Recruit infantry'],
    ['workshop','Workshop','ico-autoshop','Purchase tanks'],
    ['airport','Airport','ico-airport','L1 balloons · L2 bombers'],
    ['bank','Bank','ico-bank','+$0.18/sec per level'],
    ['defense','Defence','ico-fort','20% pre-attack HP loss'],
    ['port','Port','ico-airport','Builds naval units'],
    ['capital','Capital','ico-bank','20% combat penalty if lost']
  ]){
    const tile=elem('div','','building-summary');
    const symbol=elem('span','','building-summary-icon');symbol.append(iconSvg(icon));
    const info=elem('div','','building-summary-info');info.append(elem('strong',label),elem('small',benefit));
    tile.append(symbol,info,elem('b','Lv '+Number(state.buildings?.[key]||0),'building-summary-count'));list.append(tile);
  }
  builds.append(list);
  if(state.fleet)builds.append(elem('div',`FLEET · ${Object.entries(state.fleet).map(([k,v])=>`${k} ${v}`).join(' · ')}`,'detail-heading'));
}
let lastIntelRenderKey="";
function renderProvinceIntel(){
  const bar=$('provinceInfoBar');
  if(actionMode){ bar.hidden=true; return; }
  bar.hidden=!(selected&&game); if(bar.hidden) return;
  const state=game.provinces?.[selected-1],province=definition.get(selected);
  if(!state||!province){bar.hidden=true;lastIntelRenderKey='';return;}
  // Preserve horizontal scroll position in the compact mobile intelligence dock.
  // Server snapshots arrive often; rebuild tiles only when intelligence changes.
  const intelKey=JSON.stringify([selected,state.owner,state.visible,state.units,state.healthByType,state.buildings,state.fleet,state.garrison,game?.capitals,game?.commanders,
    (game.spyBalloons||[]).filter(b=>b.province===selected).map(b=>b.id)]);
  if(lastIntelRenderKey===intelKey)return;
  lastIntelRenderKey=intelKey;
  $('intelProvince').textContent=province.name.toUpperCase()+(game?.capitals?.[state.owner]===selected?' ★ CAPITAL':'')+(game?.commanders?.[state.owner]?' · '+game.commanders[state.owner]:'');
  const status=relationWith(state.owner);
  $('intelRelation').textContent=status==='self'?'YOUR PROVINCE':status==='ally'?'ALLIED':status==='war'?'AT WAR':'NEUTRAL';
  const flag=$('intelNationFlag');
  flag.src=`/assets/flags/${state.owner}.svg`; flag.alt=(nationNames[state.owner]||state.owner)+' flag';
  const out=$('intelDetails');out.replaceChildren();
  if(!state.visible){
    const classified=elem('div','','intel-classified');
    classified.append(iconSvg('ico-target'),elem('div','INTELLIGENCE CLASSIFIED','intel-classified-title'),elem('small','Border, ally with or scout this province to reveal forces and buildings.'));
    out.append(classified);return;
  }
  const groups=[
    {title:'ARMY',items:[
      ['ico-users',state.units?.infantry||0,'INFANTRY'],
      ['ico-tank',state.units?.tank||0,'TANKS'],
      ['ico-airport',state.units?.bomber||0,'BOMBERS']
    ]},
    {title:'NAVY',items:[
      ['ico-tank',state.fleet?.destroyer||0,'DESTROYERS'],
      ['ico-airport',state.fleet?.submarine||0,'SUBMARINES'],
      ['ico-fort',state.fleet?.battleship||0,'BATTLESHIPS']
    ]},
    {title:'INFRASTRUCTURE',items:[
      ['ico-barracks',state.buildings?.barracks||0,'BARRACKS'],
      ['ico-autoshop',state.buildings?.workshop||0,'WORKSHOP'],
      ['ico-airport',state.buildings?.airport||0,'AIRPORT'],
      ['ico-bank',state.buildings?.bank||0,'BANK'],
      ['ico-fort',state.buildings?.defense||0,'DEFENCE'],
      ['ico-airport',state.buildings?.port||0,'PORT'],
      ['ico-bank',state.buildings?.capital||0,'CAPITAL']
    ]}
  ];
  for(const section of groups){
    const group=elem('div','','intel-group');
    group.append(elem('span',section.title,'intel-section-title'));
    const tiles=elem('div','','intel-tiles');
    for(const [icon,count,label] of section.items){
      const tile=elem('div','','intel-tile');tile.title=label;
      const pictogram=elem('span','','intel-tile-icon');pictogram.append(iconSvg(icon));
      tile.append(pictogram,elem('strong',String(count),'intel-tile-count'),elem('small',label,'intel-tile-label'));
      tiles.append(tile);
    }
    group.append(tiles);out.append(group);
  }
  const balloons=(game.spyBalloons||[]).filter(b=>b.province===selected);
  if(balloons.length){
    const spy=elem('span','','intel-spy');spy.title='Friendly reconnaissance balloons';
    spy.append(iconSvg('ico-airport'),document.createTextNode('Spy balloons '+balloons.length));out.append(spy);
  }
  const allies=Object.entries(state.garrison||{}).filter(([,a])=>unitTotal(a)>0);
  if(allies.length)out.append(elem('div',allies.map(([n,a])=>`${nationNames[n]} garrison: ${unitTotal(a)}`).join(' · '),'intel-garrison'));
}
function iconSvg(name){
  const artwork={'ico-users':'infantry','ico-tank':'tank','ico-autoshop':'tank','ico-barracks':'infantry','ico-airport':'bomber','ico-quick-build':'build','ico-quick-move':'move','ico-quick-attack':'attack','ico-diplomacy':'diplomacy','ico-chat':'chat','ico-orders':'orders','ico-ranking':'rankings'};
  if(artwork[name]){const img=document.createElement('img');img.src=`/assets/units/${artwork[name]}.svg`;img.alt='';img.className='art-icon';return img;}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS('http://www.w3.org/2000/svg','use');
  use.setAttribute('href','#'+name);svg.append(use);return svg;
}
const BUILDING_TYPES=[
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
function renderBuildButtons(state){
  const out=$('buildOptions');out.replaceChildren();
  const balance=Number(game?.money||0),province=selected;
  const summary=elem('div','','construction-balance compact-balance');
  const balanceLeft=elem('div','','construction-balance-left');
  const purse=elem('span','','balance-purse');purse.append(iconSvg('ico-coins'));
  const balanceText=elem('div','','balance-text');balanceText.append(elem('span','TREASURY'),elem('strong',cash(displayedTreasury())));
  balanceLeft.append(purse,balanceText);summary.append(balanceLeft);
  out.append(summary);
  const list=elem('div','','build-catalogue compact-build-catalogue');
  for(const bld of BUILDING_TYPES){
    const count=Number(state.buildings?.[bld.kind]||0),capped=count>=bld.max&&bld.kind!=='capital';
    const priceNow=adjustedCost(bld.cost,bld.kind),canAfford=balance>=priceNow;
    const unavailable=bld.kind==='port'&&!definition.get(province)?.coastal;
    const capitalHere=bld.kind==='capital'&&game?.capitals?.[assigned]===province;
    const disabled=unavailable||capped||capitalHere;
    const card=elem('article','','building-row'+(capped?' capped':'')+(!canAfford&&!capped?' unaffordable':''));
    const emblem=elem('span','','building-row-icon');emblem.append(iconSvg(bld.icon));
    const info=elem('div','','building-row-info');
    const heading=elem('div','','building-row-heading');
    heading.append(elem('strong',bld.label),elem('span',`Lv ${count}/${bld.max}`,'building-row-level'));
    info.append(heading,elem('small',bld.detail));
    const actions=elem('div','','building-row-actions');
    const buttonLabel=capitalHere?'Current':capped?'Max':bld.kind==='capital'&&game?.capitals?.[assigned]?'Relocate':count===0?'Build':'Upgrade';
    const price=elem('span',capped?'Complete':cash(priceNow),'building-row-price');
    const buy=createButton(buttonLabel,()=>{
      if(!selected||selected!==province)return;
      socket.emit('build',{province,kind:bld.kind});
    },'building-shop-buy building-row-buy');
    buy.disabled=disabled||!canAfford;
    buy.title=capped?`${bld.label} at maximum level`:canAfford?`${buttonLabel} ${bld.label} for ${cash(priceNow)}`:`Need ${cash(priceNow)} to ${buttonLabel.toLowerCase()} ${bld.label.toLowerCase()}`;
    actions.append(price,buy);card.append(emblem,info,actions);list.append(card);
  }
  out.append(list);
  const recruit=elem('section','','troop-shop compact-recruit');recruit.append(elem('h3','RECRUIT UNITS'));
  for(const unit of TRAINING_TYPES){
    const unitPrice=adjustedCost(unit.cost,unit.kind);
    const built=unit.kind==='infantry'?state.buildings?.barracks:unit.kind==='tank'?state.buildings?.workshop:state.buildings?.airport;
    const unlocked=Number(built||0)>=unit.level();
    const card=elem('div','','troop-buy-card');
    const emblem=elem('div','','troop-buy-emblem');emblem.append(iconSvg(unit.icon));
    const info=elem('div','','troop-buy-info');info.append(elem('strong',unit.label),elem('small',unlocked?`${cash(unitPrice)} per unit`:unit.requirement));
    const actions=elem('div','','troop-buy-actions');
    for(const amount of [1,5]){
      const button=createButton(`+${amount}`,()=>socket.emit('buyUnit',{province:selected,type:unit.kind,amount}),'troop-buy-button');
      button.disabled=!unlocked||balance<unitPrice*amount;button.title=`Buy ${amount} ${unit.label.toLowerCase()} for ${cash(unitPrice*amount)}`;actions.append(button);
    }
    card.append(emblem,info,actions);recruit.append(card);
  }
  out.append(recruit);
  if(definition.get(province)?.coastal){
    const navy=elem('section','','troop-shop naval-shop');navy.append(elem('h3','NAVAL FLEET · COASTAL PORT'));
    if(!state.buildings?.port)navy.append(elem('small','Build a port to commission ships and launch fleets.'));
    for(const ship of SHIP_TYPES){
      const shipPrice=adjustedCost(ship.cost,ship.kind);
      const row=elem('div','','troop-buy-card');
      const art=document.createElement('img');art.className='naval-art';art.alt='';art.src=`/assets/units/${ship.icon}.svg`;
      const info=elem('div','','troop-buy-info');info.append(elem('strong',ship.label),elem('small',`${cash(shipPrice)} each · ${state.fleet?.[ship.kind]||0} stationed`));
      const actions=elem('div','','troop-buy-actions');
      const btn=createButton('+1',()=>socket.emit('buyShip',{province,type:ship.kind,amount:1}),'troop-buy-button');
      btn.disabled=!state.buildings?.port||balance<shipPrice;actions.append(btn);
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
        navalSelection={from:province,ships};navalMode=true;$('cancelNaval').hidden=false;setPanel(null);
        notice('Tap a coastal province to sail your fleet.','info');
      },'primary-button'));
      navy.append(controls);
    }
    out.append(navy);
  }
  const spies=(game?.spyBalloons||[]).filter(b=>b.nation===assigned);
  const spyPanel=elem('details','','spy-section compact-spies');
  spyPanel.append(elem('summary',`Spy balloons (${spies.length}/20)`));
  spyPanel.append(elem('small','Reconnaissance reveals the current province and its immediate neighbours. Balloons fly between provinces at 8.5 seconds per border.','intel-locked'));
  for(const spy of spies){
    const row=elem('div','','spy-item');
    const details=elem('span',`#${spy.id} · ${definition.get(spy.province)?.name||'Unknown'}`);
    if(spy.movement){
      const target=definition.get(spy.movement.to)?.name||'Destination';
      details.append(elem('small',` → ${target} · ${fmtSeconds((spy.movement.arrivalAt-gameNow())/1000)}`,'order-meta'));
    }
    row.append(details);
    row.append(createButton(spy.movement?'Redirect':'Move',()=>{
      deployingBalloonId=spy.id;setPanel(null);
      notice('Choose a destination province for the balloon.');
    },'spy-deploy'));
    if(spy.movement)row.append(createButton('Retreat',()=>{
      socket.emit('recallBalloon',{id:spy.id});
      notice('Balloon recalled at normal speed.','success');
    },'spy-deploy'));
    spyPanel.append(row);
  }
  out.append(spyPanel);
}

function updateBuildCatalogue(state){
  const balance=Number(game?.money||0);
  // Avoid destroying purchase buttons mid-click during frequent state snapshots.
  const levels=['barracks','workshop','airport','bank','defense','port','capital'].map(k=>state.buildings?.[k]||0);
  levels.push(game?.capitals?.[assigned]||0);
  levels.push(...SHIP_TYPES.map(ship=>state.fleet?.[ship.kind]||0));
  const affordability=[...BUILDING_TYPES.map(b=>adjustedCost(b.cost,b.kind)),...TRAINING_TYPES.flatMap(u=>[adjustedCost(u.cost,u.kind),adjustedCost(u.cost,u.kind)*5])].map(price=>Number(balance>=price));
  const spyKey=(game?.spyBalloons||[]).filter(b=>b.nation===assigned).map(b=>b.id+':'+b.province+':'+(b.movement?.arrivalAt||0)).join(',');
  const key=[selected,assigned,...levels,...affordability,spyKey].join('|');
  if(key!==lastBuildRenderKey){lastBuildRenderKey=key;renderBuildButtons(state);}
  else {const money=$('buildOptions')?.querySelector('.balance-text strong');if(money)money.textContent=cash(displayedTreasury());}
}
function setArmyPreset(full){
  if(!selected||!game||!assigned)return;
  const stack=sourceTotals();
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
  $('myFlag').replaceChildren(assigned?nationFlag(assigned):document.createTextNode('—'));
  const badge=$('panelIdentity');if(badge){badge.hidden=!assigned;if(assigned)showNationIdentity(badge,assigned);}
  const trait=assigned?nationTrait(assigned):null;
  $('traitIdentity').textContent=trait?`${trait.name} · ${trait.description}`:'';
  $('moneyValue').textContent=assigned?cash(displayedTreasury()):'—';
  const rank=game?.rankings?.find(x=>x.nation===assigned);
  $('placementValue').textContent=rank?`#${rank.place} / ${Object.keys(map.nations).length}`:'—';
  const terr=game?.provinces?.filter(t=>t.owner===assigned)||[];
  $('provinceCount').textContent=terr.length;
  $('troopCount').textContent=(terr.reduce((n,p)=>n+unitTotal(p.units),0)+(game?.provinces||[]).reduce((n,p)=>n+unitTotal(p.garrison?.[assigned]),0)).toLocaleString();
  $('productionCount').textContent=terr.reduce((n,p)=>n+(p.buildings?.bank||0),0)+' active bank levels'+(assigned&&game?.capitalStatus?.[assigned]===false?' · CAPITAL LOST (-20% HEALTH / ATTACK)':'');
  $('playersOnline').textContent=(game?.occupied?.length||0)+' commanders';
  const card=$('selectionCard');card.hidden=!selected;
  $('emptyProvince').hidden=!!selected;
  $('buildingProvinceCard').hidden=!selected;
  $('emptyBuildings').hidden=!!selected;
  $('quickCommand').hidden=true;
  $('selectMoreBtn').hidden=true;
  if(selected){
    const p=definition.get(selected),state=game?.provinces?.[selected-1];
    $('selectionName').textContent=p?.name||'Unknown';
    $('buildingProvinceName').textContent=p?.name||'Unknown';
    if(state)showNationIdentity($('selectionOwner'),state.owner,`${game?.commanders?.[state.owner]||'Unclaimed'}${game?.capitals?.[state.owner]===selected?' · CAPITAL':''}`);
    if(state)showNationIdentity($('buildingProvinceOwner'),state.owner,`${game?.commanders?.[state.owner]||'Unclaimed'}${game?.capitals?.[state.owner]===selected?' · CAPITAL':''}`);
    const own=state?.owner===assigned;
    const fromAlly=state?.owner!==assigned&&relationWith(state?.owner)==='ally'&&unitTotal(state?.garrison?.[assigned])>0;
    const visible=!!state?.visible;
    const relation=relationWith(state?.owner);
    const status=$('provinceStatus');status.textContent=relation==='self'?'YOUR TERRITORY':relation==='ally'?'ALLIED':relation==='war'?'AT WAR':'NEUTRAL';
    status.className='status-pill '+relation;
    $('selectionOwner').style.borderColor=nationColor[state?.owner]||'#c9ad72';
    $('buildingProvinceOwner').style.borderColor=nationColor[state?.owner]||'#c9ad72';
    $('quickCommand').hidden=!(own||fromAlly);
    $('selectMoreBtn').hidden=!(own||fromAlly)||!!actionMode;
    $('selectMoreBtn').classList.toggle('active',selectingMore);
    $('selectMoreLabel').textContent=selectingMore?`Done selecting (${getSourceIds().length})`:`Select more${getSourceIds().length>1?' ('+getSourceIds().length+')':''}`;
    $('quickBuild').disabled=!own||getSourceIds().length>1;
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
        const stack=sourceTotals();
        const sourceKey=getSourceIds().join(',');
        for(const t of ['infantry','tank','bomber']){
          const el=$('army'+t[0].toUpperCase()+t.slice(1));
          const available=Math.max(0,stack?.[t]||0);
          // Range inputs clamp values to their max. Always set max BEFORE
          // assigning the 100% default, otherwise every new order starts at 0.
          el.max=String(available);
          if(lastCountSource!==sourceKey)el.value=String(available);
          else if(Number(el.value)>available)el.value=String(available);
          $('available'+t[0].toUpperCase()+t.slice(1)).textContent=available+' available';
        }
        lastCountSource=sourceKey;
        $('destinationCard').hidden=!draftTarget;
        $('clearDestination').hidden=!draftTarget;
        const rel=draftTarget?relationWith(game.provinces[draftTarget-1]?.owner):null;
        $('destinationName').textContent=draftTarget?definition.get(draftTarget)?.name||'Unknown':'—';
        $('destinationRelation').textContent=rel==='war'?'Hostile — Attack order':rel==='ally'?'Allied territory — Move':rel==='self'?'Owned territory — Move':rel==='neutral'?'Neutral — attacking automatically declares war':'Select another province';
        const hasUnits=['infantry','tank','bomber'].some(t=>Number($('army'+t[0].toUpperCase()+t.slice(1)).value)>0);
        $('quickMove').disabled=!hasUnits;
        $('quickAttack').disabled=!hasUnits;
        if(own)updateBuildCatalogue(state);
        // The order status and action buttons are managed by updateOrderUI().
      }else{lastCountSource=null;draftTarget=null;if(own)updateBuildCatalogue(state);}
    }
  }
  if(!selected)$('selectMoreBtn').hidden=true;
  updateOrderUI();renderProvinceIntel();renderMovingArmyPanel();
  renderNationChoices();renderOrders();renderRankings();renderDiplomacy();renderChat();renderWarNews();renderBattleReports();
  const log=$('warLog');log.replaceChildren();for(const entry of game?.log||[])log.append(elem('div',entry,'log-entry'));
}
function renderRankings(){
  const list=$('leaderboard');list.replaceChildren();
  for(const rank of game?.rankings||[]){
    const row=elem('div','', 'rank-row');const color=elem('span','','rank-color');color.style.background=nationColor[rank.nation];
    row.append(nationFlag(rank.nation),elem('span',`${rank.place}. ${nationNames[rank.nation]}${game?.commanders?.[rank.nation]?' · '+game.commanders[rank.nation]:''}`,'rank-name'),elem('span',`${rank.score.toFixed(1)} pts · ${rank.provinces} provinces`,'rank-count'));
    list.append(row);
  }
}
function renderNationChoices(){
  if(!map?.nations)return;
  // Use the authoritative map metadata, not the separately populated label cache.
  // The lobby can receive a server snapshot while seasonal images are still loading.
  const playable=Object.keys(map.nations).filter(id=>map.nations[id].playable);
  const names=playable.map(id=>map.nations[id].name || nationNames[id] || id);
  const key=JSON.stringify([(game?.occupied||[]),assigned,isPublicMatch,playable,names,game?.commanders]);
  if(key===lastChoiceKey)return;
  lastChoiceKey=key;
  const out=$('nationChoices');out.replaceChildren();
  const random=createButton('🎲 Pick random available nation',()=>socket.emit('chooseRandomNation'), 'nation-choice random-nation');
  if(assigned)random.disabled=true;out.append(random);
  for(let i=0;i<playable.length;i++){
    const id=playable[i],occupied=game?.occupied?.includes(id)&&assigned!==id;
    const commander=game?.commanders?.[id];
    const b=createButton(`${names[i]}${commander?' · '+commander:''}${occupied?' (TAKEN)':''}`,()=>socket.emit('chooseNation',id),'nation-choice');b.disabled=!!occupied||!!assigned;
    b.prepend(nationFlag(id));
    const trait=game?.nationTraits?.[id];if(trait)b.append(elem('small',`${trait.name} · ${trait.description}`,'nation-trait'));
    out.append(b);
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
  const relationHeading=elem('p','', 'diplomacy-heading');relationHeading.append(nationFlag(n),document.createTextNode(` ${nationNames[n]} · ${rel.toUpperCase()}`));panel.append(relationHeading);
  const buttons=elem('div','','diplomacy-actions');
  const add=(txt,action,cls='')=>buttons.append(createButton(txt,()=>socket.emit('diplomacy',{action,target:n}),cls));
  if(rel==='ally'){add('Break alliance','breakAlliance','danger');}
  else if(rel!=='war'){add('Declare war','declareWar','danger');add('Request alliance','requestAlly');}
  else add('Request peace','requestPeace');
  panel.append(buttons);
  const inbox=[...(game?.requests||[]).filter(x=>x.to===assigned).map(r=>({...r,kind:'Ally'})),
    ...(game?.peaceRequests||[]).filter(x=>x.to===assigned).map(r=>({...r,kind:'Peace'}))];
  for(const item of inbox){const row=elem('div',`${nationNames[item.from]}: ${item.kind} request`,'request-card');
    row.prepend(nationFlag(item.from));row.append(createButton('Accept',()=>socket.emit('diplomacy',{action:item.kind==='Ally'?'acceptAlly':'acceptPeace',target:item.from})),
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
    const name=elem('strong',nationNames[m.nation]+(m.to==='all'?' [GLOBAL]':' [PRIVATE → '+nationNames[m.to]+']')+': ');line.append(nationFlag(m.nation),name,document.createTextNode(m.text));view.append(line);
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
  const fleets=(game?.navalMovements||[]).filter(o=>o.nation===assigned);
  for(const f of fleets){const row=elem('div','','order-row');
    row.append(elem('div',`FLEET · ${Object.entries(f.ships||{}).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join(', ')} · ${definition.get(f.from)?.name} → ${definition.get(f.to)?.name}`),elem('b',fmtSeconds((f.arrivalAt-gameNow())/1000),'order-meta'));out.append(row);}
  const balloons=(game?.spyBalloons||[]).filter(b=>b.nation===assigned&&b.movement);
  for(const balloon of balloons){
    const move=balloon.movement,row=elem('div','','order-row');
    row.append(elem('div',`SPY BALLOON #${balloon.id} · ${definition.get(move.from)?.name||'Unknown'} → ${definition.get(move.to)?.name||'Unknown'}`),
      elem('b',fmtSeconds((move.arrivalAt-gameNow())/1000),'order-meta'));
    row.append(createButton('Retreat',()=>socket.emit('recallBalloon',{id:balloon.id}),'spy-deploy'));
    out.append(row);
  }
  if(!orders.length){if(!fleets.length&&!balloons.length)out.append(elem('div','No armies, fleets or spy balloons in transit.'));return;}
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

function commandStack(provinceId){
  const state=game?.provinces?.[provinceId-1];
  if(!state||!assigned)return null;
  if(state.owner===assigned)return state.units;
  if(relationWith(state.owner)==='ally')return state.garrison?.[assigned]||null;
  return null;
}
function eligibleCommandSource(provinceId){return unitTotal(commandStack(provinceId))>0;}
function getSourceIds(){return [...new Set(selectedSources.length?selectedSources:[selected])].filter(id=>eligibleCommandSource(id));}
function sourceTotals(){
  const result={infantry:0,tank:0,bomber:0};
  for(const id of getSourceIds()){const s=commandStack(id);for(const t of Object.keys(result))result[t]+=s?.[t]||0;}
  return result;
}
// Greedy deterministic allocation ensures no unit can be counted twice. User's
// aggregate sliders control the total across all selected source provinces.
function commandsForSources(target){
  const remaining={...armyFormUnits()};
  const commands=[];
  const rel=relationWith(game.provinces[target-1].owner);
  const kind=['neutral','war'].includes(rel)?'attack':'move';
  for(const from of getSourceIds()){
    const available=commandStack(from),units={infantry:0,tank:0,bomber:0};
    for(const t of Object.keys(units)){
      units[t]=Math.min(remaining[t],available?.[t]||0);
      remaining[t]-=units[t];
    }
    if(unitTotal(units))commands.push({from,to:target,units,kind,autoDeclareWar:rel==='neutral'});
  }
  if(Object.values(remaining).some(n=>n!==0))throw Error('Not enough units in selected provinces.');
  return commands;
}
function currentArrivalMode(){return document.querySelector('input[name="arrivalMode"]:checked')?.value||'separate';}
function closestMovingArmy(x,y){
  if(!game?.movements?.length||!assigned)return null;
  let closest=null,closestD=Infinity;
  for(const order of game.movements){
    if(order.nation!==assigned)continue;
    const pos=orderPosition(order,gameNow());if(!pos)continue;
    const d=Math.hypot(x-pos.x,y-pos.y)*camera.scale;
    if(d<38&&d<closestD){closest=order;closestD=d;}
  }
  return closest;
}
function renderMovingArmyPanel(){
  const panel=$('movingArmyPanel');
  const order=game?.movements?.find(o=>o.id===focusedOrderId&&o.nation===assigned);
  if(!order){focusedOrderId=null;redirectOrderId=null;redirectTarget=null;panel.hidden=true;return;}
  panel.hidden=false;
  const unitType=selectedArmyIcon(order.units||{[order.type]:order.count});
  $('movingArmyIcon').src=`/assets/units/${unitType}.svg`;
  $('movingArmySummary').textContent=`Army #${order.id} · ${unitTotal(order.units||{[order.type]:order.count})} units`;
  const ret=!!order.recalling;
  const changing=redirectOrderId===order.id;
  $('movingArmyInstruction').textContent=ret?'Returning to its starting province':changing?(redirectTarget?`New target: ${definition.get(redirectTarget)?.name||'Unknown'}`:'Tap a new destination province on the map'):`${definition.get(order.from)?.name||'Start'} → ${definition.get(order.to)?.name||'Destination'} · ${fmtSeconds((order.arrivalAt-gameNow())/1000)} remaining`;
  $('movingArmyMove').hidden=changing||ret;
  $('movingArmyRetreat').hidden=changing||ret;
  $('movingArmyConfirm').hidden=!changing||!redirectTarget;
  $('movingArmyCancel').hidden=!changing;
  if(changing&&redirectTarget){
    const rel=relationWith(game.provinces[redirectTarget-1].owner);
    $('movingArmyConfirm').disabled=!['self','ally','war'].includes(rel);
  }
}
function armyFormUnits(){
  const units={};
  for(const t of ['infantry','tank','bomber'])units[t]=Number($('army'+t[0].toUpperCase()+t.slice(1)).value);
  return units;
}
function showAttackConfirmation(command,description){
  pendingOrder=command;
  $('confirmDetails').textContent=description;
  $('confirmModal').querySelector('h1').textContent=command.event==='sailFleet'?'CONFIRM NAVAL ORDER':'CONFIRM ATTACK';
  $('confirmYes').textContent=command.event==='sailFleet'?'Sail fleet':'Launch attack';
  $('confirmModal').hidden=false;
}
function dispatch(kind){
  if(!selected||!draftTarget||!assigned)return notice('Select a destination province.');
  const desired=armyFormUnits(),available=sourceTotals();
  if(!['infantry','tank','bomber'].every(t=>Number.isSafeInteger(desired[t])&&desired[t]>=0&&desired[t]<=available[t])||!unitTotal(desired))
    return notice('Select valid troop quantities.');
  let commands;try{commands=commandsForSources(draftTarget);}catch(e){return notice(e.message,'error');}
  if(!commands.length)return notice('No army selected.');
  const rel=relationWith(game.provinces[draftTarget-1].owner);
  const data=commands.length>1?{orders:commands,arrivalMode:currentArrivalMode()}:commands[0];
  const event=commands.length>1?'moveGroup':'move';
  if(rel==='neutral'){
    showAttackConfirmation({event,data},`Confirm attack: this will declare war with ${nationNames[game.provinces[draftTarget-1].owner]}.`);
    return;
  }
  socket.emit(event,data);clearDeployment();
}

function currentOrderValidity(){
  if(!game||!selected||!actionMode)return {valid:false,message:'Select a starting province.'};
  const stack=sourceTotals();
  const units=armyFormUnits();
  if(!['infantry','tank','bomber'].every(t=>Number.isSafeInteger(units[t])&&units[t]>=0&&units[t]<=(stack?.[t]||0))||!unitTotal(units))
    return {valid:false,message:'Choose at least one available unit.'};
  if(!draftTarget)return {valid:false,message:'Click a destination province on the map.'};
  const rel=relationWith(game.provinces[draftTarget-1].owner);
  if(actionMode==='attack'&&(rel==='self'||rel==='ally'))return {valid:false,message:'Choose Move for your or allied territory.'};
  return {valid:true,message:rel==='neutral'?'This neutral attack requires an explicit war declaration confirmation.':`Ready to ${effectiveOrderKind()}. Confirm to dispatch.`};
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
  $('mapContainer').classList.toggle('planning',active);
  const confirming=active&&!!draftTarget;
  $('arrivalChoice').hidden=!(confirming&&getSourceIds().length>1);
  for(const id of ['quickMove','quickAttack','quickBuild'])$(id).hidden=confirming;
  for(const id of ['confirmOrderBtn','cancelOrderBtn'])$(id).hidden=!confirming;
  if(!active)return;
  $('plannerCaption').textContent=confirming?`${getSourceIds().length} army source${getSourceIds().length>1?'s':''} · Review and confirm`:actionMode==='attack'?'ATTACK · Adjust units, then tap a target':'MOVE · Adjust units, then tap a destination';
  $('plannerTitle').textContent=actionMode==='attack'?'Attack order':'Movement order';
  $('plannerTitle').dataset.kind=actionMode;
  $('plannerSource').textContent=getSourceIds().length>1?`${getSourceIds().length} source provinces`:definition.get(selected)?.name||'Source';
  $('plannerInstructions').textContent=confirming?'Review your troops and target, then confirm or cancel.':'Adjust unit counts, then click a destination province on the map.';
  updateArmyReadouts();
  const status=currentOrderValidity();
  $('orderHint').textContent=status.message;
  $('orderHint').classList.toggle('order-warning',!status.valid&&confirming);
  $('confirmOrderBtn').disabled=!status.valid;
  $('confirmOrderBtn').classList.toggle('is-attack',effectiveOrderKind()==='attack');
  $('confirmOrderBtn').querySelector('span').textContent=effectiveOrderKind()==='attack'?'Confirm attack':'Confirm move';
}
function armAction(kind){
  if(!selected||!game||!assigned)return notice('Select your departure province first.');
  const state=game.provinces[selected-1];
  if(state.owner!==assigned&&!(relationWith(state.owner)==='ally'&&unitTotal(state.garrison?.[assigned])>0))
    return notice('Select a province containing your troops.');
  selectingMore=false;actionMode=kind;draftTarget=null;
  setPanel(null);
  updateSidebar();queueRender();
}
function cancelDraftOrder(){
  actionMode=null;draftTarget=null;
  updateSidebar();queueRender();
}
function clearDeployment(){
  selected=null;selectedSources=[];selectingMore=false;draftTarget=null;lastCountSource=null;actionMode=null;
  if(activePanel==='army'||activePanel==='buildings')setPanel(null);
  updateSidebar();queueRender();
}
function clickWorld(cx,cy){
  if(!game||!map)return;
  const pos=worldFromClient(cx,cy),id=pixelProvince(pos.x,pos.y);
  if(navalMode){
    if(!id||!definition.get(id)?.coastal)return notice('Select a coastal destination.','error');
    if(id===navalSelection?.from)return notice('Choose a different destination.','error');
    const rel=relationWith(game.provinces[id-1].owner);
    const data={...navalSelection,to:id,autoDeclareWar:rel==='neutral'};
    const desc=rel==='neutral'?`Sail your fleet to ${definition.get(id).name}? This declares war with ${nationNames[game.provinces[id-1].owner]}.`:`Sail fleet to ${definition.get(id).name}? Naval attacks bombard coastal defenders but do not capture land.`;
    showAttackConfirmation({event:'sailFleet',data},desc);
    return;
  }
  if(deployingBalloonId){
    if(!id)return notice('Choose a province for the balloon.');
    const balloon=game.spyBalloons?.find(b=>b.id===deployingBalloonId);
    if(!balloon||balloon.province===id)return notice('Choose a different destination province.');
    showAttackConfirmation({event:'stationBalloon',data:{id:deployingBalloonId,province:id}},
      `Move reconnaissance balloon #${deployingBalloonId} to ${definition.get(id)?.name||'the selected province'}? It travels in real time and reveals each province only as it arrives.`);
    deployingBalloonId=null;
    return;
  }
  if(redirectOrderId){if(!id)return;redirectTarget=id;renderMovingArmyPanel();queueRender();return;}
  if(actionMode&&selected){
    if(!id)return notice('Choose a land province or press Cancel to abandon the order.');
    if(getSourceIds().includes(id))return notice('Choose a different destination.');
    draftTarget=id;updateSidebar();queueRender();return;
  }
  // A spy balloon is selectable on the map, just like a moving army.
  const friendlySpy=(game.spyBalloons||[]).filter(b=>b.nation===assigned).find(b=>{
    const marker=spyMapPosition(b);
    return marker&&Math.hypot(marker.x-pos.x,marker.y-pos.y)<=Math.max(12,20/camera.scale);
  });
  if(friendlySpy){
    if(friendlySpy.movement){setPanel('orders');renderOrders();}
    else{deployingBalloonId=friendlySpy.id;setPanel(null);notice('Choose a new destination for spy balloon #'+friendlySpy.id+'.');}
    return;
  }
  const moving=closestMovingArmy(pos.x,pos.y);
  if(moving){focusedOrderId=moving.id;selectingMore=false;selected=null;selectedSources=[];draftTarget=null;actionMode=null;setPanel(null);updateSidebar();queueRender();return;}
  if(selectingMore){
    if(!id||!eligibleCommandSource(id))return notice('Select another province containing your troops.');
    if(selectedSources.includes(id)&&selectedSources.length>1)selectedSources=selectedSources.filter(n=>n!==id);
    else if(!selectedSources.includes(id)){if(selectedSources.length>=9)return notice('Select up to nine sources.');selectedSources.push(id);}
    lastCountSource=null;updateSidebar();queueRender();return;
  }
  if(!id){clearDeployment();focusedOrderId=null;renderMovingArmyPanel();return;}
  selected=selected===id?null:id;selectedSources=selected?[selected]:[];draftTarget=null;lastCountSource=null;
  focusedOrderId=null;
  if(selected&&game.provinces[selected-1].owner!==assigned){
    const n=game.provinces[selected-1].owner;if($('dipTarget'))$('dipTarget').value=n;
  }
  if(!selected&&(activePanel==='army'||activePanel==='buildings'))setPanel(null);
  updateSidebar();queueRender();
}

// Touch map controls: single-finger pan/tap, two-finger pinch zoom.
const activeTouches=new Map();let pointer=null, pinch=null, suppressTap=false;
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1&&e.button!==2)return;
  canvas.setPointerCapture(e.pointerId);
  activeTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY,panX:camera.panX,panY:camera.panY,drag:false,button:e.button};
  if(activeTouches.size===2){
    const pts=[...activeTouches.values()],dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    pinch={dist:Math.max(1,dist),zoom:camera.zoom,panX:camera.panX,panY:camera.panY,
      centerX:(pts[0].x+pts[1].x)/2,centerY:(pts[0].y+pts[1].y)/2};
    suppressTap=true;
  }
});
canvas.addEventListener('pointermove',e=>{
  if(activeTouches.has(e.pointerId))activeTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&activeTouches.size>=2){
    const pts=[...activeTouches.values()].slice(0,2),dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    camera.zoom=Math.max(.75,Math.min(10,pinch.zoom*dist/pinch.dist));
    camera.panX=pinch.panX+((pts[0].x+pts[1].x)/2-pinch.centerX);
    camera.panY=pinch.panY+((pts[0].y+pts[1].y)/2-pinch.centerY);
    queueRender();return;
  }
  if(pointer&&pointer.id===e.pointerId){const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.hypot(dx,dy)>8)pointer.drag=true;
    if(pointer.drag){camera.panX=pointer.panX+dx;camera.panY=pointer.panY+dy;queueRender();}
  }
  if(e.pointerType==='touch'){$('hoverTip').hidden=true;return;}
  const p=worldFromClient(e.clientX,e.clientY),id=pixelProvince(p.x,p.y);
  if(id!==hovered){hovered=id;queueRender();}
  const tip=$('hoverTip');if(!id||!game){tip.hidden=true;return;}
  const state=game.provinces[id-1];tip.hidden=false;tip.replaceChildren();
  tip.append(elem('b',definition.get(id).name),elem('div',nationNames[state.owner]),elem('span',state.visible?`${unitTotal(state.units)} host troops${Object.entries(state.garrison||{}).map(([nation,units])=>` · ${nationNames[nation]}: ${unitTotal(units)} stationed`).join('')}`:'Unknown garrison'));
  tip.style.left=Math.min(p.screenX+18,camera.cw-220)+'px';tip.style.top=Math.min(p.screenY+17,camera.ch-95)+'px';
});
canvas.addEventListener('pointerup',e=>{
  const old=pointer;
  activeTouches.delete(e.pointerId);
  if(pinch){if(activeTouches.size<2){pinch=null;pointer=null;suppressTap=true;}return;}
  if(old?.id===e.pointerId){
    if(!old.drag&&!suppressTap&&old.button===0)clickWorld(e.clientX,e.clientY);
    pointer=null;
  }
  if(!activeTouches.size)suppressTap=false;
});
canvas.addEventListener('pointercancel',e=>{activeTouches.delete(e.pointerId);pointer=null;pinch=null;suppressTap=false;});
canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){$('hoverTip').hidden=true;hovered=null;queueRender();}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{
  e.preventDefault();const before=worldFromClient(e.clientX,e.clientY);
  camera.zoom=Math.max(.75,Math.min(10,camera.zoom*(e.deltaY<0?1.14:1/1.14)));
  updateTransform();const after=worldFromClient(e.clientX,e.clientY);
  camera.panX+=(after.x-before.x)*camera.scale;camera.panY+=(after.y-before.y)*camera.scale;queueRender();
},{passive:false});
function zoom(f){camera.zoom=Math.max(.75,Math.min(10,camera.zoom*f));queueRender();}
$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(.8);
$('zoomReset').onclick=()=>{camera.zoom=1;camera.panX=0;camera.panY=0;if(assigned)focusNationOnMobile(assigned);else queueRender();};
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
$('selectMoreBtn').onclick=()=>{
  if(!selected||!eligibleCommandSource(selected))return notice('Choose a province containing your troops.');
  selectingMore=!selectingMore;
  if(selectingMore&&!selectedSources.length)selectedSources=[selected];
  lastCountSource=null;updateSidebar();queueRender();
};
$('closeMovingArmy').onclick=()=>{focusedOrderId=null;redirectOrderId=null;redirectTarget=null;renderMovingArmyPanel();queueRender();};
$('movingArmyMove').onclick=()=>{
  if(!focusedOrderId)return;
  redirectOrderId=focusedOrderId;redirectTarget=null;
  renderMovingArmyPanel();notice('Tap a new destination on the map.');
};
$('movingArmyRetreat').onclick=()=>{
  if(!focusedOrderId)return;
  socket.emit('changeMovement',{id:focusedOrderId,action:'recall'});
  focusedOrderId=null;redirectOrderId=null;redirectTarget=null;renderMovingArmyPanel();
};
$('movingArmyConfirm').onclick=()=>{
  if(!redirectOrderId||!redirectTarget)return;
  const rel=relationWith(game.provinces[redirectTarget-1].owner);
  if(!['self','ally','war'].includes(rel))return notice('Declare war with this nation before redirecting an attack.','error');
  socket.emit('changeMovement',{id:redirectOrderId,action:'redirect',to:redirectTarget,kind:rel==='war'?'attack':'move'});
  focusedOrderId=null;redirectOrderId=null;redirectTarget=null;renderMovingArmyPanel();
};
$('movingArmyCancel').onclick=()=>{redirectOrderId=null;redirectTarget=null;renderMovingArmyPanel();};
$('quickMove').onclick=()=>{ playSound('move',{volume:0.35}); armAction('move'); };
$('quickAttack').onclick=()=>{ playSound('attack',{volume:0.32}); armAction('attack'); };
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
  playSound('build',{volume:0.28});
  setPanel('buildings');updateSidebar();
};
$('clearDestination').onclick=()=>{draftTarget=null;updateSidebar();queueRender();};
for(const input of document.querySelectorAll('input[name="arrivalMode"]'))input.onchange=()=>updateOrderUI();
$('showBattleFx').checked=battleFxEnabled;
$('showBattleFx').onchange=e=>{battleFxEnabled=e.target.checked;if(!battleFxEnabled)activeBattleFx.length=0;queueRender();};
$('labelsMode').onchange=e=>{labels=e.target.checked;queueRender();};
$('dipTarget').onchange=()=>renderDiplomacy();
$('showAlly').onchange=e=>{movementPrefs.allyMoves=e.target.checked;socket.emit('preferences',movementPrefs);};
$('showHostile').onchange=e=>{movementPrefs.hostileMoves=e.target.checked;socket.emit('preferences',movementPrefs);};
for(const btn of document.querySelectorAll('.rail-btn[data-panel]')){
  btn.onclick=()=>setPanel(activePanel===btn.dataset.panel?null:btn.dataset.panel);
}
$('panelClose').onclick=()=>setPanel(null);
$('tutorialLaunch').onclick=openTutorial;
$('tutorialNav').onclick=openTutorial;
$('tutorialClose').onclick=closeTutorial;
$('tutorialSkip').onclick=closeTutorial;
$('warStatementForm').onsubmit=e=>{
  e.preventDefault();
  const body=$('warStatementText').value.trim();
  if(body.length<5||body.length>160)return notice('Write a statement of 5–160 characters.','error');
  if(!assigned)return notice('Select a nation to publish a statement.','error');
  socket.emit('publishStatement',body);
};
socket.on('statementAccepted',()=>{$('warStatementText').value='';notice('Statement published in the War Chronicle.','success');});
$('tutorialAction').onclick=()=>{if(tutorialStep>=TUTORIAL_LESSONS.length){closeTutorial();return;}
  playSound(tutorialStep===1?'infantry':tutorialStep===3?'attack':'click',{volume:.38});
  tutorialStep++;renderTutorial();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('tutorialModal').hidden){closeTutorial();return;}if(e.key==='Escape'&&deployingBalloonId){deployingBalloonId=null;notice('Balloon placement cancelled.');return;}if(e.key==='Escape'&&actionMode){cancelDraftOrder();return;}if(e.key==='Escape'&&$('confirmModal').hidden&&$('nationModal').hidden){setPanel(null);}});
$('chatForm').onsubmit=e=>{e.preventDefault();const input=$('chatInput');if(input.value.trim()){socket.emit('chat',{to:$('chatRecipient').value,message:input.value.trim()});playSound('message',{volume:0.4});}input.value='';};
$('confirmYes').onclick=()=>{if(pendingOrder){if(pendingOrder.event==='move') playSound(orderSound(pendingOrder.data.units,pendingOrder.data.kind),{volume:0.55}); socket.emit(pendingOrder.event,pendingOrder.data);if(['move','moveGroup'].includes(pendingOrder.event))clearDeployment();
    if(pendingOrder.event==='sailFleet'){navalMode=false;navalSelection=null;$('cancelNaval').hidden=true;clearDeployment();}}pendingOrder=null;$('confirmModal').hidden=true;updateSidebar();queueRender();};
$('cancelNaval').onclick=()=>{navalMode=false;navalSelection=null;$('cancelNaval').hidden=true;notice('Fleet order cancelled.');};
$('confirmNo').onclick=()=>{pendingOrder=null;$('confirmModal').hidden=true;navalMode=false;navalSelection=null;$('cancelNaval').hidden=true;};
function savedUsername(){try{return localStorage.getItem('ww2royale-username')||'';}catch{return '';}}
function saveUsername(value){try{localStorage.setItem('ww2royale-username',value);}catch{/* Storage may be blocked in private browsing. */}}
function registerUsername(){
  const name=$('playerNameInput').value.trim();
  if(name.length<2){showJoinError('Enter a username of at least two characters.');return false;}
  saveUsername(name.slice(0,20));
  socket.emit('setUsername',name.slice(0,20));return true;
}
$('playerNameInput').value=savedUsername();
$('joinForm').onsubmit=e=>{
  e.preventDefault();const code=$('roomInput').value.trim();
  if(!/^[0-9]{6}$/.test(code))return showJoinError('Please enter exactly six digits.');
  if(!socket.connected)return showJoinError('Not connected to the server.');
  if(!registerUsername())return;
  $('joinError').hidden=true;socket.emit('joinRoom',code);
};
$('joinRandom').onclick=()=>{
  if(!socket.connected)return showJoinError('Not connected to the server.');
  if(!registerUsername())return;
  $('joinError').hidden=true;socket.emit('joinRandom');
};
$('leaveQueue').onclick=()=>{socket.emit('leaveRoom');$('publicWaiting').hidden=true;room=null;assigned=null;isPublicMatch=false;$('joinModal').hidden=false;};
$('createRoom').onclick=()=>{
  if(!socket.connected)return showJoinError('Not connected to the server.');
  if(!registerUsername())return;
  $('joinError').hidden=true;socket.emit('createRoom');
};
$('roomButton').onclick=()=>{
  if(room){if(!confirm('Leave your current war and choose another server? Your nation will be released.'))return;}
  $('joinError').hidden=true;$('returnGame').hidden=!room;$('joinModal').hidden=false;
};
$('returnGame').onclick=()=>{$('joinModal').hidden=true;};
$('copyRoom').onclick=copyRoomCode;
$('copyLobbyCode').onclick=copyRoomCode;
$('changeNation').onclick=showNationModal;
$('spectateButton').onclick=()=>{$('nationModal').hidden=true;};
$('restartButton').onclick=()=>{socket.emit('leaveRoom');$('victoryModal').hidden=true;};
function updateCampaignClock(state){
  if(!state)return;
  const day=Math.max(0,Number(state.campaignDay)||0);
  const date=new Date(Date.UTC(1939,9,6)+day*86400000);
  $('campaignDate').textContent=date.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).toUpperCase();
  const month=date.getUTCMonth();const season=month===11||month<=1?'winter':month<=4?'spring':month<=7?'summer':'autumn';
  $('seasonBadge').textContent=`${season.toUpperCase()} · ${date.getUTCFullYear()}`;
  $('seasonBadge').title=season==='winter'?'Winter logistics: infantry 17.5–20s per province, tanks 25–30s per province; naval voyages slow by up to 33%. Bombers unaffected.':'Normal travel speeds in spring, summer, and autumn.';
  setSeason(season,seasonalDepth(date));syncElapsed();
}
socket.on('connect',()=>{
  $('connectionDot').classList.add('online');$('connectionText').textContent='Server connected';
  if(room){socket.emit('setUsername',savedUsername()||'Commander');if(isPublicMatch)socket.emit('joinRandom');else socket.emit('joinRoom',room);assigned=null;selected=null;}else if(showJoinOnConnect)$('joinModal').hidden=false;
});
socket.on('disconnect',()=>{$('connectionDot').classList.remove('online');$('connectionText').textContent='Server disconnected';notice('Connection lost; reconnecting…');});
socket.on('joined',({code,public:isPublic})=>{
  lastChatSeen=null;lastNewsSeen=null;lastNewsRenderKey=null;lastBattleRenderKey=null;
  lastRequestsSeen='';lastBuildRenderKey='';$('chatBadge').hidden=true;$('newsBadge').hidden=true;$('diplomacyBadge').hidden=true;
  $('returnGame').hidden=false;paintKey='';
  room=code;isPublicMatch=!!isPublic;$('roomCode').textContent=isPublic?'PUBLIC '+code:code;$('lobbyRoomCode').textContent=code;$('joinModal').hidden=true;showJoinOnConnect=false;assigned=null;selected=null;setPanel(null);
  $('spectateButton').hidden=isPublicMatch;
  showNationModal();
  socket.emit('preferences',movementPrefs);updateSidebar();
});
socket.on('assigned',({nation})=>{assigned=nation;if(nation)$('nationModal').hidden=true;selected=null;paintKey='';focusNationOnMobile(nation);updateSidebar();updateCountryAndOwner();queueRender();});
socket.on('state',next=>{
  // When a new chat or diplomacy request arrives, flag its icon without opening a panel.
  const latestId=next.chat?.at(-1)?.id??0;
  if(lastChatSeen!==null&&latestId>lastChatSeen){ if(activePanel!=='chat')$('chatBadge').hidden=false; playSound('message',{volume:0.32}); }
  lastChatSeen=Math.max(lastChatSeen??0,latestId);
  const requestKey=[...(next.requests||[]),...(next.peaceRequests||[])].filter(r=>r.to===assigned).map(r=>r.from+':'+r.to).sort().join('|');
  if(lastRequestsSeen!==''&&requestKey!==lastRequestsSeen&&requestKey&&activePanel!=='diplomacy')$('diplomacyBadge').hidden=false;
  lastRequestsSeen=requestKey;
  // Capture a synchronized frame anchor on every authoritative update.
  if(Number.isFinite(next.serverTime)){gameClockServerAt=next.serverTime;gameClockClientAt=performance.now();}
  game=next;
  processWarEffects(next);
  renderWarNews();renderBattleReports();
  if(!$('nationModal').hidden)renderNationChoices();
  $('publicWaiting').hidden=!(next.public&&!next.started);
  if(next.public&&!next.started){$('waitingCount').textContent=`${next.playerCount} of 9 commanders connected. Match begins once 6 commanders select nations.`; $('waitingBar').style.width=(Math.min(next.playerCount,6)/6*100)+'%';$('waitingNation').textContent=assigned?`You will command ${nationNames[assigned]}.`:'Choose your nation to enter the war.';}
  const now=Date.now();if(now-lastSidebarAt>500){lastSidebarAt=now;updateSidebar();}updateCountryAndOwner();queueRender();
  $('victoryModal').hidden=!next.winner;
  if(next.winner)$('winnerName').textContent=next.winner.nations.map(n=>nationNames[n]).join(' + ')+' VICTORIOUS';
  const eliminated=!!(assigned&&next.started&&next.provinces.every(p=>p.owner!==assigned));
  if(eliminated&&!next.winner){$('victoryModal').hidden=false;$('winnerName').textContent='NATION ELIMINATED';$('victoryDescription').textContent='Your nation has lost every province. Return to the main menu to join another war.';$('restartButton').textContent='Return to main menu';}
  else {$('restartButton').textContent='Return to main menu';$('victoryDescription').textContent=next.winner?.mode==='time-limit'?'Public match finished after 60 minutes. Winner determined by territory, treasury, and military ranking.':'Victory requires 51% of territories solo, or 67% of territories with an ally.';}
  updateCampaignClock(next);
});
socket.on('errorMessage',msg=>notice(String(msg),'error'));
socket.on('buildAccepted',data=>{playSound('build',{volume:0.52});notice(`${data.kind} upgraded to level ${data.level}.`,'success');});
socket.on('purchaseAccepted',data=>{playSound(data.type==='tank'?'tank':data.type==='bomber'?'plane':data.type==='balloon'?'plane':'infantry',{volume:0.56});notice(`Purchased ${data.amount} ${data.type}${data.amount>1?'s':''} for ${cash(data.total)}.`,'success');});
socket.on('joinError',msg=>{showJoinError(String(msg));$('joinModal').hidden=false;});
socket.on('orderAccepted',o=>{playSound(o.naval?'plane':orderSound(o.units||{[o.type]:o.count},o.kind),{volume:0.48});notice(`${o.spy?'Spy balloon':o.naval?'Fleet':'Army'} dispatched · ETA ${fmtSeconds((o.arrivalAt-Date.now())/1000)}`);});
socket.on('leftRoom',()=>{lastNewsSeen=null;activeBattleFx.length=0;treasuryDisplay={value:null,at:0,nation:null};room=null;assigned=null;game=null;paintKey='';isPublicMatch=false;selected=null;selectedSources=[];selectingMore=false;focusedOrderId=null;draftTarget=null;actionMode=null;redirectOrderId=null;redirectTarget=null;deployingBalloonId=null;$('publicWaiting').hidden=true;$('joinModal').hidden=false;updateSidebar();queueRender();});
setInterval(()=>{
  for(const el of document.querySelectorAll('.order-remaining'))el.textContent=fmtSeconds((Number(el.dataset.arrival)-gameNow())/1000);
  // polling UI for money and timers: state updates from server every 100 ms or from game timer
  syncElapsed();
  if(assigned&&game&&performance.now()-treasuryDisplay.at>=TREASURY_DISPLAY_INTERVAL_MS){
    displayedTreasury();$('moneyValue').textContent=cash(treasuryDisplay.value);
    const panelMoney=$('buildOptions')?.querySelector('.balance-text strong');
    if(panelMoney)panelMoney.textContent=cash(treasuryDisplay.value);
  }
},250);
(async function init(){
  try{
    const [data,terrain,territories,borders,infantryIcon,tankIcon,bomberIcon,balloonIcon]=await Promise.all([
      fetch('/map.json').then(async r=>{if(!r.ok)throw Error('Map unavailable');return r.json();}),
      image('/assets/europe-map.png'),image('/assets/province-ids.png'),image('/assets/province-lines.png'),
      image('/assets/units/infantry.svg'),image('/assets/units/tank.svg'),image('/assets/units/bomber.svg'),image('/assets/units/balloon.svg')
    ]);
    map=data;mapImage=terrain;territoryImage=territories;borderImage=borders; unitArt={infantry:infantryIcon,tank:tankIcon,bomber:bomberIcon,balloon:balloonIcon};
    try{unitArt.battleship=await image('/assets/units/battleship.svg');}catch(e){console.warn('Missing naval icon',e);}
    // Populate nation labels before awaiting optional seasonal artwork. The lobby
    // can render during these image loads and must never display "undefined".
    for(const [id,nation] of Object.entries(map.nations)){nationColor[id]=nation.color;nationNames[id]=nation.name;}
    lastChoiceKey='';
    renderNationChoices();
    for(const season of ['spring','summer','autumn','winter']){try{seasonAssets[season]=await image('/assets/season-'+season+'.png');}catch(error){console.warn('Missing seasonal asset',season,error);}}
    currentSeasonImage=seasonAssets[currentSeason]||null;
    for(const p of map.provinces)definition.set(p.id,p);
    const scratch=document.createElement('canvas');scratch.width=map.width;scratch.height=map.height;
    const sc=scratch.getContext('2d',{willReadFrequently:true});sc.drawImage(territoryImage,0,0);
    idPixels=sc.getImageData(0,0,map.width,map.height).data;
    sc.clearRect(0,0,map.width,map.height);sc.drawImage(mapImage,0,0);originalPixels=sc.getImageData(0,0,map.width,map.height).data;
    // Shared pixel-perfect borders loaded from province-lines.png; no independent smoothing.
    updateSidebar();if(game){updateLabels();rebuildTint();}resize();if(assigned)focusNationOnMobile(assigned);new ResizeObserver(resize).observe(canvas.parentElement);
  }catch(e){console.error('Game initialization failed:',e);notice(`Map initialization error: ${e.message||e}`);}
})();

// Army selection shortcuts; one-click full army by default, manual edits remain possible.
$('armySelectAll').addEventListener('click',()=>setArmyPreset(true));
$('armySelectNone').addEventListener('click',()=>setArmyPreset(false));
