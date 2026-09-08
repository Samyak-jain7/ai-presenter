import test from 'node:test';
import assert from 'node:assert/strict';
import deck from '../shared/deck.json' with {type:'json'};
import {createState,interrupt,navigate,control,drain} from '../shared/state.mjs';
test('six complete slides, cross-topic questions preserve resume, boundaries and stale drain',()=>{
  assert.equal(deck.length,6);assert.equal(new Set(deck.map(s=>s.id)).size,6);
  for(const s of deck) {assert.ok(s.title&&s.notes&&s.summary);assert.equal(s.points.length,3);}
  const state=createState(2);
  for(let i=0;i<3;i++) {
    const old=state.epoch;interrupt(state);assert.equal(navigate(state,5,'question'),true);
    assert.equal(state.resume,2);assert.equal(drain(state,old),false);
    assert.equal(navigate(state,99),false);assert.equal(navigate(state,'3'),false);
    assert.equal(control(state,'resume'),true);assert.equal(state.slide,2);
  }
  navigate(state,1);control(state,'previous');assert.equal(state.slide,1);control(state,'resume');
  for(let i=1;i<6;i++){assert.equal(state.slide,i);assert.equal(drain(state,state.epoch),true);}
  assert.equal(drain(state,state.epoch),false);assert.equal(state.slide,6);
  control(state,'next');assert.equal(state.slide,6);assert.equal(control(state,'delete'),false);
});
test('navigation is silent, explanation is one slide, and resume is explicit',()=>{
  const state=createState(2);
  navigate(state,6);assert.equal(state.mode,'paused');assert.equal(drain(state,state.epoch),false);
  control(state,'previous');assert.equal(state.slide,5);assert.equal(state.mode,'paused');
  control(state,'explain');assert.equal(state.mode,'explanation');assert.equal(drain(state,state.epoch),false);
  control(state,'resume');assert.equal(state.mode,'presentation');assert.equal(state.slide,5);
});
