import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
const port=33972;
const cwd=fileURLToPath(new URL('../',import.meta.url));
const server=spawn(process.execPath,['server/index.js'],{cwd,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let err='';server.stderr.on('data',x=>err+=x);
class P{
 constructor(){this.msg=[];this.ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);this.ws.onmessage=e=>this.msg.push(JSON.parse(e.data));}
 ready(){return new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});}
 send(type,data){this.ws.send(JSON.stringify({type,data}));}
 async pop(type,pred=()=>true){for(let j=0;j<150;j++){const i=this.msg.findIndex(x=>x.type===type&&pred(x.data));if(i>=0)return this.msg.splice(i,1)[0].data;await sleep(30);}throw Error(`Timeout waiting ${type} ${err}`);}
 close(){this.ws.close();}
}
const players=[];
try{
 let okay=false;for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/map.json`);if(r.ok){okay=true;break;}}catch{}await sleep(30);}assert(okay,'server starts');
 for(const asset of ['/','/main.js','/style.css','/map.json','/assets/europe-map.png','/assets/province-ids.png','/assets/province-lines.png','/assets/season-spring.png','/assets/season-summer.png','/assets/season-autumn.png','/assets/season-winter.png','/assets/units/infantry.svg','/assets/units/tank.svg','/assets/units/bomber.svg','/assets/units/move.svg','/assets/units/attack.svg','/assets/units/build.svg','/assets/units/destroyer.svg','/assets/units/submarine.svg','/assets/units/battleship.svg'])assert((await fetch(`http://127.0.0.1:${port}${asset}`)).ok,asset);
 for(const asset of ['/favicon.ico','/favicon-256.png','/apple-touch-icon.png','/assets/branding/logo-640.png','/assets/branding/logo-128.png']){
   const res=await fetch(`http://127.0.0.1:${port}${asset}`);
   assert(res.ok,`${asset} should be reachable`);
   assert.match(res.headers.get('content-type')||'',asset.endsWith('.ico')?/image\/x-icon/:/image\/png/);
   assert(Number(res.headers.get('content-length'))>1000,`${asset} should contain the logo`);
 }

 const audio=await fetch(`http://127.0.0.1:${port}/assets/audio/music-loop.wav`);
 assert(audio.ok,'royalty-free game soundtrack served');
 assert.match(audio.headers.get('content-type')||'',/audio\/wav/);
 assert(Number(audio.headers.get('content-length'))>50000,'soundtrack must contain playable audio');
 const map=await(await fetch(`http://127.0.0.1:${port}/map.json`)).json();assert.equal(map.provinces.length,114);
 const a=new P(),b=new P();players.push(a,b);await Promise.all(players.map(p=>p.ready()));
 a.send('setUsername','Field Marshal');b.send('setUsername','Sea Commander');
 a.send('createRoom');const x=await a.pop('joined');assert(/^[0-9]{6}$/.test(x.code));
 b.send('joinRoom',x.code);await b.pop('joined');
 a.send('chooseNation','FR');await a.pop('assigned',r=>r.nation==='FR');
 b.send('chooseNation','BE');assert.match(await b.pop('errorMessage'),/valid nation/i,'Belgium is non-playable');
 b.send('chooseRandomNation');const chosen=await b.pop('assigned',r=>r.nation);assert(map.playableNations.includes(chosen.nation));
 a.send('chat','WW2 Royale online');const state=await a.pop('state',s=>s.chat.some(m=>m.text==='WW2 Royale online'));assert.equal(state.provinces.length,114);assert.equal(state.campaignDay,0);
 a.send('publishStatement','France calls for peace in Europe.');
 const publishAck=await a.pop('statementAccepted');assert(publishAck.id>0);
 const warState=await a.pop('state',s=>s.warNews?.some(e=>e.kind==='statement'));
 assert.equal(warState.warNews[0].summary,'France calls for peace in Europe.');
 assert.equal(warState.battleReports.length,0);
 a.send('publishStatement','Second statement too soon.');
 assert.match(await a.pop('errorMessage'),/90 seconds/);
 assert.equal(state.commanders.FR,'Field Marshal');
 assert.equal(state.commanders[chosen.nation],'Sea Commander');
 assert(state.capitals.FR>0);
 const frProvince=map.provinces.find(p=>p.nation==='FR').id;
 a.send('buyUnit',{province:frProvince,type:'infantry',amount:1});
 const purchase=await a.pop('purchaseAccepted');assert.equal(purchase.amount,1);
 await sleep(200);a.send('build',{province:frProvince,kind:'bank'});
 const upgrade=await a.pop('buildAccepted');assert.equal(upgrade.level,2);
 await sleep(200);a.send('buyUnit',{province:frProvince,type:'bomber',amount:1});
 assert.match(await a.pop('errorMessage'),/airport/i);
 await sleep(200);
 const france=map.provinces.filter(p=>p.nation==='FR');
 const origin=france.find(p=>p.neighbors.filter(n=>map.provinces[n-1].nation==='FR').length>=2);
 const sources=origin.neighbors.filter(n=>map.provinces[n-1].nation==='FR').slice(0,2);
 a.send('moveGroup',{orders:sources.map(from=>({from,to:origin.id,units:{infantry:2},kind:'move'})),arrivalMode:'together'});
 const group=await a.pop('orderAccepted',x=>x.count===2);
 assert.equal(group.ids.length,2);
 const moving=await a.pop('state',x=>x.movements.length===2);
 assert.equal(moving.movements[0].arrivalAt,moving.movements[1].arrivalAt);
 await sleep(200);
 a.send('changeMovement',{id:group.ids[0],action:'recall'});
 const recalled=await a.pop('state',x=>x.movements.some(o=>o.id===group.ids[0]&&o.recalling));
 assert(recalled.movements.find(o=>o.id===group.ids[0]).arrivalAt>Date.now());
 const q=[];for(let i=0;i<6;i++){const p=new P();players.push(p);await p.ready();p.send('joinRandom');const room=await p.pop('joined');q.push({p,room});if(i)assert.equal(room.code,q[0].room.code);p.send('chooseNation',map.playableNations[i]);await p.pop('assigned',s=>s.nation===map.playableNations[i]);}
 const started=await q[0].p.pop('state',s=>s.started&&s.playerCount===6);assert.equal(started.occupied.length,6);
 const extra=new P();players.push(extra);await extra.ready();extra.send('joinRandom');const late=await extra.pop('joined');assert.equal(late.code,q[0].room.code);extra.send('chooseNation',map.playableNations[6]);await extra.pop('assigned',s=>s.nation===map.playableNations[6]);
 const extra2=new P();players.push(extra2);await extra2.ready();extra2.send('joinRandom');const late2=await extra2.pop('joined');assert.equal(late2.code,q[0].room.code);extra2.send('chooseNation',map.playableNations[7]);await extra2.pop('assigned',s=>s.nation===map.playableNations[7]);
 a.send('leaveRoom');await a.pop('leftRoom');
 console.log('PASS: asset endpoints, private create/join, nine playable nations, rejection of nonplayable, chat, coordinated movement, timed recall, and six-of-nine public matchmaking with late quick-join');
}finally{players.forEach(p=>p.close());server.kill();}
