import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {connectSession} from '../server/session.mjs';
class Browser extends EventEmitter {
  readyState=1;sent=[];
  send(data){this.sent.push(JSON.parse(data));}
  close(){this.readyState=3;this.emit('close');}
  input(data){this.emit('message',Buffer.from(JSON.stringify(data)));}
}
class Provider extends EventTarget {
  readyState=1;sent=[];closed=false;
  send(data){this.sent.push(JSON.parse(data));}
  close(){this.closed=true;this.readyState=3;}
  output(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
}
test('provider calls synchronize display; playback drains gate progression; repeated interruption and cleanup',()=>{
  for(let run=0;run<2;run++) {
    const b=new Browser(),p=new Provider();const stop=connectSession(b,()=>p,{model:'test'});
    try {
      b.input({type:'start',slide:2});p.dispatchEvent(new Event('open'));
      assert.match(p.sent[0].setup.systemInstruction.parts[0].text,/speech recognition/i);
      p.output({setupComplete:{}});
      for(let i=0;i<3;i++) {
        p.output({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAAAAA=='}}]}}});
        b.input({type:'speech-start'});p.output({serverContent:{interrupted:true}});b.input({type:'speech-end'});
        const epoch=b.sent.findLast(m=>m.type==='clear').epoch;
        p.output({toolCall:{functionCalls:[{id:`invalid-${i}`,name:'go_to_slide',args:{slideId:100}}]}});
        assert.ok(p.sent.at(-1).toolResponse.functionResponses[0].response.error);
        p.output({toolCall:{functionCalls:[{id:`valid-${i}`,name:'go_to_slide',args:{slideId:5,intent:'answer'}}]}});
        assert.equal(b.sent.findLast(m=>m.type==='state').slide,5);
        assert.equal(b.sent.findLast(m=>m.type==='state').resume,2);
        p.output({serverContent:{turnComplete:true}});b.input({type:'drained',epoch:epoch-1});
        b.input({type:'control',action:'resume'});
        assert.equal(b.sent.findLast(m=>m.type==='state').slide,2);
        assert.match(p.sent.at(-1).realtimeInput.text,/displayed slide 2/);
      }
      p.output({serverContent:{turnComplete:true}});
      const epoch=b.sent.findLast(m=>m.type==='state').epoch;
      assert.equal(b.sent.findLast(m=>m.type==='state').slide,2);
      b.input({type:'drained',epoch});assert.equal(b.sent.findLast(m=>m.type==='state').slide,3);
      b.input({type:'drained',epoch});assert.equal(b.sent.findLast(m=>m.type==='state').slide,3);
      b.input({type:'speech-start'});b.input({type:'mute'});assert.ok(p.sent.at(-1).realtimeInput.activityEnd);
      b.input({type:'end'});assert.ok(p.closed);assert.equal(b.readyState,3);
    } finally {stop();}
  }
});
test('manual navigation suppresses unfinished old generation; malformed browser input closes session',()=>{
  const b=new Browser(),p=new Provider();const stop=connectSession(b,()=>p,{model:'test'});
  try {
    b.input({type:'start',slide:1});p.output({setupComplete:{}});
    b.input({type:'navigate',slide:4});const before=b.sent.length;
    p.output({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm',data:'AAAA'}}]}}});
    assert.equal(b.sent.length,before);
    p.output({serverContent:{turnComplete:true}});assert.match(p.sent.at(-1).realtimeInput.text,/displayed slide 4/);assert.match(p.sent.at(-1).realtimeInput.text,/Remain silent/);assert.equal(p.sent.at(-1).clientContent,undefined);
    b.input({type:'audio',data:'not base64!',rate:24000});assert.equal(b.sent.at(-1).type,'error');assert.ok(p.closed);
  }finally{stop();}
});
test('switch-only suppresses provider narration; switch-and-explain permits only requested explanation',()=>{
  const b=new Browser(),p=new Provider();const stop=connectSession(b,()=>p,{model:'test'});
  const audio={serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm',data:'AAAAAA=='}}]}}};
  try{
    b.input({type:'start',slide:2});p.output({setupComplete:{}});
    b.input({type:'speech-start'});p.output({serverContent:{interrupted:true}});b.input({type:'speech-end'});
    p.output({toolCall:{functionCalls:[{id:'silent',name:'go_to_slide',args:{slideId:6,intent:'switch'}}]}});
    const before=b.sent.filter(m=>m.type==='audio').length;p.output(audio);
    assert.equal(b.sent.filter(m=>m.type==='audio').length,before);
    assert.equal(b.sent.findLast(m=>m.type==='state').mode,'paused');
    p.output({serverContent:{turnComplete:true}});
    p.output({toolCall:{functionCalls:[{id:'explain',name:'go_to_slide',args:{slideId:3,intent:'explain'}}]}});p.output(audio);
    assert.equal(b.sent.filter(m=>m.type==='audio').length,before+1);
    const state=b.sent.findLast(m=>m.type==='state');assert.equal(state.mode,'explanation');
    p.output({serverContent:{turnComplete:true}});b.input({type:'drained',epoch:state.epoch});
    assert.equal(b.sent.findLast(m=>m.type==='state').slide,3);
  }finally{stop();}
});
test('same-slide follow-up can answer without a tool after interruption or silent navigation',()=>{
  const b=new Browser(),p=new Provider();const stop=connectSession(b,()=>p,{model:'test'});
  const audio={serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm',data:'AAAAAA=='}}]}}};
  try{
    b.input({type:'start',slide:2});p.output({setupComplete:{}});
    for(const silentSwitch of [false,true]){
      if(silentSwitch){p.output({serverContent:{turnComplete:true}});b.input({type:'navigate',slide:2});}
      b.input({type:'speech-start'});p.output({serverContent:{interrupted:true}});
      const before=b.sent.filter(m=>m.type==='audio').length;
      p.output(audio);assert.equal(b.sent.filter(m=>m.type==='audio').length,before);
      b.input({type:'speech-end'});
      p.output({serverContent:{inputTranscription:{text:'Explain this slide like I am ten.'}}});
      p.output(audio);
      p.output({serverContent:{outputTranscription:{text:'Imagine your microphone is an ear.'},turnComplete:true}});
      assert.equal(b.sent.filter(m=>m.type==='audio').length,before+1);
      const current=b.sent.findLast(m=>m.type==='state');assert.equal(current.slide,2);
      b.input({type:'drained',epoch:current.epoch});
      assert.equal(b.sent.findLast(m=>m.type==='state').slide,2);
    }
  }finally{stop();}
});
