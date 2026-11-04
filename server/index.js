/* WW2 Royale 1.5 — native WebSocket server, Node 22+, zero dependencies. */
import http from 'node:http';
import {createReadStream,readFileSync,statSync} from 'node:fs';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {publishCommanderStatement} from './war-events.js';
import {createGame,relation,ally,changeDiplomacy,orderMovement,orderMultiple,changeMovement,build,buyUnit,commissionShip,sailFleet,stationBalloon,recallBalloon,sendChat,tick,viewFor,PUBLIC_MATCH_MS} from './game.js';
const map=JSON.parse(readFileSync(new URL('../shared/map.json',import.meta.url),'utf8'));
const clientPath=path.resolve(fileURLToPath(new URL('../client/',import.meta.url)));
const rooms=new Map(),connections=new Map();
const MAX_PAYLOAD=16384;
const PUBLIC_MAX_PLAYERS=9;
const PUBLIC_MIN_PLAYERS=6;
const PUBLIC_LATE_JOIN_MS=60000;
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp','.wav':'audio/wav'};
const pair=(a,b)=>[a,b].sort().join(':');
function roomCreate(code,isPublic=false){const g=createGame(map);return {code,g,public:isPublic,started:!isPublic,players:new Map(),lastAction:new Map(),prefs:new Map()};}
// Generate a genuinely random, unique 6-digit code from currently active rooms.
// The event loop processes each request synchronously, so the allocation and
// Map insertion below are atomic relative to another createRoom command.
function allocateRoomCode(){
  if(rooms.size>=900000)throw Error('All private room codes are allocated.');
  let code;
  do { code=String(randomInt(100000,1000000)); } while (rooms.has(code));
  return code;
}
function enterRoom(client,room){
  client.room=room.code;
  send(client.id,'joined',{code:room.code,created:room.players.size===0});
  send(client.id,'assigned',{nation:nationOf(room,client)});
  broadcast(room);
}

function respond(client,message){send(client.id,'errorMessage',message);}
function nationOf(room,client){return room.players.get(client.id)||null;}
function active(room){return [...connections.values()].filter(c=>c.room===room.code);}
function publicJoinWindowOpen(room,now=Date.now()){return !!(room.public&&room.started&&room.g.campaignStartAt&&now-room.g.campaignStartAt<PUBLIC_LATE_JOIN_MS);}
function publicSlotsRemaining(room){return Math.max(0,PUBLIC_MAX_PLAYERS-active(room).length);}
function sendSnapshot(client){
  const room=rooms.get(client.room);if(!room)return;
  const nation=nationOf(room,client);const state=viewFor(room.g,nation,Date.now(),room.prefs.get(client.id));
  state.code=room.code;state.playableNations=map.playableNations;state.public=room.public;state.started=room.started;state.playerCount=room.public?active(room).length:room.players.size;state.occupied=[...room.players.values()];
  state.commanders=Object.fromEntries([...room.players].map(([id,n])=>[n,connections.get(id)?.username||'Commander']));
  send(client.id,'state',state);
}
function broadcast(room){for(const client of active(room))sendSnapshot(client);}
function leave(client){
  const prev=client.room;if(!prev)return;
  const room=rooms.get(prev);client.room=null;if(!room)return;
  room.players.delete(client.id);room.prefs.delete(client.id);room.lastAction.delete(client.id);
  if(!active(room).length)rooms.delete(prev);else broadcast(room);
}
function maybeStartPublic(room){
  if(room.public&&!room.started&&room.players.size>=PUBLIC_MIN_PLAYERS&&active(room).length>=PUBLIC_MIN_PLAYERS){
    room.started=true;
    const now=Date.now();room.g.lastTick=now;room.g.campaignStartAt=now;room.g.timeLimitMs=PUBLIC_MATCH_MS;
    // Production is purchase-based; no automatic troop timers to reset.
  }
}
function chooseAvailableNation(room,client,data){
  const previous=room.players.get(client.id);
  if(previous&&previous!==data)throw Error('Your nation is locked for this campaign.');
  if(typeof data!=='string'||!map.nations[data]?.playable)throw Error('Choose a valid nation.');
  if([...room.players.entries()].some(([id,n])=>n===data&&id!==client.id))throw Error('Nation is already controlled.');
  if(room.g.winner)throw Error('Campaign is finished.');
  room.players.set(client.id,data);
  maybeStartPublic(room);
  send(client.id,'assigned',{nation:data});broadcast(room);
}
function guardRoom(client,type,data){
  if(type==='setUsername'){
    if(typeof data!=='string')return respond(client,'Enter a valid username.');
    const name=data.trim().replace(/[<>\x00-\x1f]/g,'').slice(0,20);
    if(name.length<2)return respond(client,'Username must be at least 2 characters.');
    client.username=name;const room=rooms.get(client.room);if(room)broadcast(room);return;
  }
  if(type==='leaveRoom'){leave(client);send(client.id,'leftRoom',{});return;}
  if(type==='joinRandom'){
    if(client.room)leave(client);
    // Reserve a seat for every connected commander, even before nation selection.
    const now=Date.now();
    let eligible=[...rooms.values()].filter(r=>r.public&&!r.g.winner&&publicSlotsRemaining(r)>0&&(!r.started||publicJoinWindowOpen(r,now)));
    eligible.sort((a,b)=>{
      const as=(a.started?1000:0)+active(a).length;
      const bs=(b.started?1000:0)+active(b).length;
      return bs-as;
    });
    let room=eligible[0];if(!room){const code=allocateRoomCode();room=roomCreate(code,true);rooms.set(code,room);}
    client.room=room.code;
    send(client.id,'joined',{code:room.code,created:false,public:true});
    send(client.id,'assigned',{nation:null});broadcast(room);return;
  }

  if(type==='createRoom'){
    try{
      if(client.room)leave(client);
      const code=allocateRoomCode();
      const room=roomCreate(code);
      rooms.set(code,room);
      enterRoom(client,room);
    }catch(e){send(client.id,'joinError',e.message||'Unable to create a server.');}
    return;
  }
  if(type==='joinRoom'){
    if(typeof data!=='string'|| !/^[0-9]{6}$/.test(data)){
      send(client.id,'joinError','Enter a valid six-digit server code.');return;
    }
    const room=rooms.get(data);
    if(!room){send(client.id,'joinError','No active server uses that code. Ask the host to create a room first.');return;}
    if(room.public){
      if(room.g.winner){send(client.id,'joinError','That public server has already finished.');return;}
      if(publicSlotsRemaining(room)<=0){send(client.id,'joinError','That public server is full.');return;}
      if(client.room!==data){leave(client);}
      enterRoom(client,room);
      return;
    }
    if(client.room!==data){leave(client);}
    enterRoom(client,room);
    return;
  }
  const room=client.room?rooms.get(client.room):null;if(!room)return;
  if(type==='chooseNation'||type==='chooseRandomNation'){
    try{
      const available=Object.keys(map.nations).filter(n=>map.nations[n].playable&&![...room.players.values()].includes(n));
      const current=nationOf(room,client);
      const desired=type==='chooseRandomNation'?(current||available[randomInt(available.length)]):data;
      if(!desired)throw Error('All nations are taken.');
      chooseAvailableNation(room,client,desired);
    }catch(e){respond(client,e.message);}return;
  }

  if(type==='preferences'){
    const prefs={allyMoves:data?.allyMoves!==false,hostileMoves:data?.hostileMoves!==false};
    room.prefs.set(client.id,prefs);sendSnapshot(client);return;
  }
  const nation=nationOf(room,client);if(!nation)return respond(client,'Select a nation first.');
  if(room.public&&!room.started)return respond(client,`Waiting for ${Math.max(0,PUBLIC_MIN_PLAYERS-room.players.size)} more commanders.`);
  const now=Date.now();
  if(type==='restart'){
    if(!room.g.winner)return respond(client,'Campaign is still running.');
    room.g=createGame(map);broadcast(room);return;
  }
  if(type==='publishStatement'){
    try{const item=publishCommanderStatement(room.g,nation,data,now);
      send(client.id,'statementAccepted',{id:item.id});broadcast(room);
    }catch(e){respond(client,e.message||'Statement rejected.');}
    return;
  }
  if(type==='chat'){
    if(now-(room.lastAction.get(client.id+':chat')||0)<750)return respond(client,'Slow down: one chat message per 750 ms.');
    try{sendChat(room.g,nation,data,now);room.lastAction.set(client.id+':chat',now);broadcast(room);}catch(e){respond(client,e.message);}return;
  }
  if(room.g.winner)return respond(client,'The match has already ended.');
  if(now-(room.lastAction.get(client.id)||0)<160)return respond(client,'Please wait briefly before issuing another command.');
  room.lastAction.set(client.id,now);
  try{
    if(type==='diplomacy'){
      if(!data||typeof data!=='object')throw Error('Invalid diplomacy command.');
      changeDiplomacy(room.g,nation,data.target,data.action);broadcast(room);return;
    }
    if(type==='build'){
      if(!data||typeof data!=='object'||!Number.isSafeInteger(data.province))throw Error('Invalid construction command.');
      const structure=build(room.g,nation,data.province,data.kind,now);send(client.id,'buildAccepted',{province:data.province,kind:data.kind,level:structure.buildings[data.kind]});broadcast(room);return;
    }
    if(type==='buyShip'){
      if(!data||typeof data!=='object')throw Error('Invalid ship purchase.');
      const result=commissionShip(room.g,nation,data.province,data.type,data.amount);
      send(client.id,'purchaseAccepted',result);broadcast(room);return;
    }
    if(type==='sailFleet'){
      if(!data||typeof data!=='object')throw Error('Invalid naval deployment.');
      const fleet=sailFleet(room.g,nation,data,now);
      send(client.id,'orderAccepted',{id:fleet.id,arrivalAt:fleet.arrivalAt,naval:true});broadcast(room);return;
    }
    if(type==='buyUnit'){
      if(!data||typeof data!=='object'||!Number.isSafeInteger(data.province))throw Error('Invalid troop purchase.');
      const purchase=buyUnit(room.g,nation,data.province,data.type,data.amount);send(client.id,'purchaseAccepted',purchase);broadcast(room);return;
    }
    if(type==='stationBalloon'){
      if(!data||!Number.isSafeInteger(data.id)||!Number.isSafeInteger(data.province))throw Error('Invalid spy balloon order.');
      const balloon=stationBalloon(room.g,nation,data.id,data.province,now);
      send(client.id,'orderAccepted',{id:balloon.id,arrivalAt:balloon.movement.arrivalAt,spy:true});
      broadcast(room);return;
    }
    if(type==='recallBalloon'){
      if(!data||!Number.isSafeInteger(data.id))throw Error('Invalid spy balloon recall.');
      recallBalloon(room.g,nation,data.id,now);broadcast(room);return;
    }
    if(type==='changeMovement'){
      if(!data||typeof data!=='object')throw Error('Invalid movement change.');
      changeMovement(room.g,nation,data,now);broadcast(room);return;
    }
    if(type==='moveGroup'){
      if(!data||typeof data!=='object')throw Error('Invalid coordinated movement command.');
      const orders=orderMultiple(room.g,nation,data,now);
      send(client.id,'orderAccepted',{ids:orders.map(o=>o.id),arrivalAt:Math.max(...orders.map(o=>o.arrivalAt)),count:orders.length});
      broadcast(room);return;
    }
    if(type==='move'){
      if(!data||typeof data!=='object')throw Error('Invalid movement command.');
      const order=orderMovement(room.g,nation,data,now);
      send(client.id,'orderAccepted',{id:order.id,arrivalAt:order.arrivalAt});broadcast(room);return;
    }
  }catch(e){respond(client,e.message||'Command rejected.');}
}
const GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function encode(opcode,payload){
  const data=Buffer.isBuffer(payload)?payload:Buffer.from(payload||'');
  const size=data.length,header=Buffer.alloc(size<126?2:size<65536?4:10);
  header[0]=0x80|opcode;
  if(size<126)header[1]=size;
  else if(size<65536){header[1]=126;header.writeUInt16BE(size,2);}
  else{header[1]=127;header.writeBigUInt64BE(BigInt(size),2);}
  return Buffer.concat([header,data]);
}
function send(id,type,data){const client=connections.get(id);if(client&&!client.socket.destroyed)client.socket.write(encode(1,JSON.stringify({type,data})));}
function onData(client,chunk){
  client.buffer=Buffer.concat([client.buffer,chunk]);
  if(client.buffer.length>MAX_PAYLOAD*2)return client.socket.destroy();
  while(client.buffer.length>=2){
    const b=client.buffer,opcode=b[0]&15,masked=!!(b[1]&0x80);let len=b[1]&127,offset=2;
    if(!(b[0]&0x80)||!masked)return client.socket.destroy();
    if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);offset=4;}
    else if(len===127){if(b.length<10)return;const big=b.readBigUInt64BE(2);if(big>BigInt(MAX_PAYLOAD))return client.socket.destroy();len=Number(big);offset=10;}
    if(len>MAX_PAYLOAD)return client.socket.destroy();
    if(b.length<offset+4+len)return;
    const mask=b.subarray(offset,offset+4);offset+=4;const payload=Buffer.from(b.subarray(offset,offset+len));client.buffer=b.subarray(offset+len);
    for(let i=0;i<len;i++)payload[i]^=mask[i%4];
    if(opcode===8){client.socket.end(encode(8,Buffer.alloc(0)));return;}
    if(opcode===9){client.socket.write(encode(10,payload));continue;}
    if(opcode!==1)return client.socket.destroy();
    try{const parsed=JSON.parse(payload.toString('utf8'));if(parsed&&typeof parsed.type==='string')guardRoom(client,parsed.type,parsed.data);}catch{respond(client,'Malformed request.');}
  }
}
const server=http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);}catch{res.writeHead(400).end('Bad URL');return;}
  if(pathname.includes('\\')||pathname.includes('\0')){res.writeHead(400).end();return;}
  const full=pathname==='/map.json'?fileURLToPath(new URL('../shared/map.json',import.meta.url)):path.resolve(clientPath,'.'+(pathname==='/'?'/index.html':pathname));
  if(!(full===clientPath||full.startsWith(clientPath+path.sep)||pathname==='/map.json')){res.writeHead(403).end('Forbidden');return;}
  try{const stat=statSync(full);if(!stat.isFile())throw Error('not file');res.writeHead(200,{'Content-Type':MIME[path.extname(full)]||'application/octet-stream','Cache-Control':'no-cache','Content-Length':stat.size});createReadStream(full).pipe(res);}
  catch{res.writeHead(404).end('File not found');}
});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ws'){socket.destroy();return;}
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
  const key=req.headers['sec-websocket-key'];if(typeof key!=='string'||!/^[-\w+/=]{20,32}$/.test(key)){socket.destroy();return;}
  const accept=createHash('sha1').update(key+GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const id=randomUUID(),client={id,socket,room:null,username:'Commander',buffer:Buffer.alloc(0)};connections.set(id,client);
  socket.on('data',data=>onData(client,data));socket.on('close',()=>{leave(client);connections.delete(id);});socket.on('error',()=>socket.destroy());
  if(head.length)onData(client,head);
});
setInterval(()=>{
  const now=Date.now();for(const room of rooms.values())if(room.started&&tick(room.g,now))broadcast(room);
},100);
const port=Number(process.env.PORT||3000);
server.listen(port,'0.0.0.0',()=>console.log(`WW2 Royale: http://localhost:${port}`));
