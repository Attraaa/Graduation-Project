import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationMessage, watchPreparation } from '../src/features/session/modelPreparation.ts';

test('slow model initialization provides elapsed feedback with no arbitrary restart deadline',()=>{
  for(const stage of ['pose','face','frame']) for(const ms of [0,30000,61000,120000]) {
    const text=preparationMessage(stage,ms);
    assert.match(text,/1분 이상/);assert.match(text,new RegExp(`${Math.floor(ms/1000)}초 경과`));
    assert.doesNotMatch(text,/다시 실행|재시작|실패/);
  }
});
test('preparation status stops publishing after ready, failure, or cancellation',(t)=>{
  t.mock.timers.enable({apis:['setInterval']});
  const messages=[];const stop=watchPreparation('pose',s=>messages.push(s));
  t.mock.timers.tick(61000);assert.equal(messages.length,62);
  stop();const count=messages.length;t.mock.timers.tick(61000);assert.equal(messages.length,count);
});
