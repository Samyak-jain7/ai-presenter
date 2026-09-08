// Optional live check, not part of offline tests. Sends only a supplied synthetic PCM WAV question.
import {readFileSync} from 'node:fs';
import WebSocket from 'ws';
const path=process.argv[2];
if(!path){console.error('Usage: node scripts/probe-app.mjs /path/to/synthetic-question.wav');process.exit(1);}
const wave=readFileSync(path);let audio;
for(let offset=12;offset+8<=wave.length;){const size=wave.readUInt32LE(offset+4);if(wave.toString('ascii',offset,offset+4)==='data'){audio=wave.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}
if(!audio?.length){console.error('Missing PCM WAV data');process.exit(1);}
const socket=new WebSocket('ws://127.0.0.1:3001/session',{origin:'http://127.0.0.1:5173'});
const start=Date.now();let sentQuestion=false,cleared=false,slide5=false,answerBytes=0,done=false,timer;
const send=m=>socket.send(JSON.stringify(m));
const limit=setTimeout(()=>finish(false,'timeout'),45000);
function finish(ok,error){if(done)return;done=true;clearTimeout(limit);clearInterval(timer);if(socket.readyState===1){send({type:'end'});socket.close();}console.log(JSON.stringify({ok,cleared,slide5,answerBytes,elapsedMs:Date.now()-start,error}));process.exitCode=ok?0:1;}
socket.on('open',()=>send({type:'start',slide:2}));
socket.on('error',()=>finish(false,'connection'));
socket.on('close',()=>{if(!done)finish(false,'closed');});
socket.on('message',raw=>{
  const m=JSON.parse(raw.toString());
  if(m.type==='error')return finish(false,m.message);
  if(m.type==='audio'&&!sentQuestion){
    sentQuestion=true;let offset=0;
    send({type:'speech-start'});
    timer=setInterval(()=>{
      if(offset>=audio.length){clearInterval(timer);send({type:'speech-end'});return;}
      const chunk=audio.subarray(offset,offset+4096);offset+=chunk.length;
      send({type:'audio',data:chunk.toString('base64'),rate:24000});
    },85);
  }
  if(m.type==='clear'&&sentQuestion)cleared=true;
  if(m.type==='state'&&m.slide===5)slide5=true;
  if(m.type==='audio'&&slide5)answerBytes+=Buffer.from(m.data,'base64').length;
  if(m.type==='turn-end'&&slide5&&answerBytes>0)finish(cleared);
});
