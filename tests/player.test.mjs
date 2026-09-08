import test from 'node:test';
import assert from 'node:assert/strict';
import {Player} from '../src/player.ts';
test('clear stops active and queued nodes within 250ms; stale chunks and drain cannot restart playback',()=>{
  const nodes=[],drains=[];
  const context={currentTime:1,destination:{},createBuffer:(_,n,rate)=>({duration:n/rate,getChannelData:()=>new Float32Array(n)}),createBufferSource:()=>{
    const node={connect(){},disconnect(){this.disconnected=true;},start(){},stop(){this.stopped=true;}};nodes.push(node);return node;
  }};
  const player=new Player(context,()=>{},epoch=>drains.push(epoch));
  for(let epoch=0;epoch<3;epoch++) {
    player.add('AAAAAA==',epoch);player.add('AAAAAA==',epoch);player.end(epoch);
    const start=performance.now();player.clear(epoch+1);assert.ok(performance.now()-start<250);
    assert.ok(nodes.every(n=>n.stopped&&n.disconnected));assert.deepEqual(drains,[]);
    const count=nodes.length;player.add('AAAAAA==',epoch);assert.equal(nodes.length,count);
  }
  player.add('AAAAAA==',3);player.end(3);assert.deepEqual(drains,[]);nodes.at(-1).onended();assert.deepEqual(drains,[3]);
});
