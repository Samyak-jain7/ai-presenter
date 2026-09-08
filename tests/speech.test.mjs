import test from 'node:test';
import assert from 'node:assert/strict';
import {SpeechDetector} from '../src/speech.ts';
test('local speech starts within 200ms, keeps prefix, ends after silence, and resets repeatedly',()=>{
  const detector=new SpeechDetector();
  const silence=()=>new Int16Array(2048).buffer;
  const voice=()=>new Int16Array(2048).fill(2000).buffer;
  for(let cycle=0;cycle<3;cycle++){
    assert.equal(detector.push(silence(),24000).started,false);
    assert.equal(detector.push(voice(),24000).started,false);
    const result=detector.push(voice(),24000);
    assert.equal(result.started,true);assert.equal(result.chunks.length,3);
    assert.ok(2*2048/24000*1000<200);
    for(let i=0;i<7;i++)assert.equal(detector.push(silence(),24000).ended,false);
    assert.equal(detector.push(silence(),24000).ended,true);assert.equal(detector.active,false);
  }
  detector.push(voice(),24000);detector.reset();assert.equal(detector.push(voice(),24000).started,false);
});
