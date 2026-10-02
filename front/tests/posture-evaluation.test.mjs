import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceEvaluation, createEvaluation, interruptEvaluation, HABIT_POLICY } from '../src/features/posture/evaluation.ts';
import { createObservation, advanceObservation } from '../src/features/posture/observation.ts';
import { turtleScorePolicy as policy } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy } from '../src/features/posture/modes/shoulder.ts';
import { MOTION_PROTECTION } from '../src/features/posture/scoreSettings.ts';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
function observed(ms, deviation = 0, velocity = 0) {
  return { ...createObservation(), observedSeconds: ms / 1000, velocityPxPerSecond: velocity,
    delta: deviation === null ? null : { headForward: deviation, torsoForward: deviation, neckSlump: deviation, shoulderTilt: deviation, shoulderShrug: deviation, yawRatio: 0 } };
}
const step = (state, ms, d=0, v=0, selected=policy) => advanceEvaluation(state, observed(ms,d,v), selected);
function run(until, d=0, v=0, interval=100, selected=policy) {
  let state=createEvaluation(selected);
  for(let at=0; at<=until; at+=interval) state=step(state,at,d,v,selected);
  return state;
}
test('no observations are unknown; grace does not manufacture missing data', () => {
  const missing=step(createEvaluation(policy),0,null);
  assert.equal(missing.currentScore,null); assert.equal(missing.averageScore,null);
  const first=step(missing,0,1);
  assert.equal(first.currentScore,100); assert.equal(first.averageScore,null); assert.equal(first.validMs,0);
});
test('five seconds of static deviation are protected and subsequent penalty is gradual', () => {
  const boundary=run(MOTION_PROTECTION.graceMs,1);
  close(boundary.currentScore,100); close(boundary.averageScore,100);
  assert.equal(boundary.protection,'grace');
  const after=step(boundary,5100,1);
  close(after.currentScore,98); assert.equal(after.protection,'none');
  const settled=run(11000,1);
  assert.equal(settled.currentScore,0); assert.ok(settled.averageScore > 0);
  const zero=step({ ...createEvaluation(policy), ...settled, validMs: 0, scoreTimeSum: 0 },11100,1);
  close(zero.averageScore,0);
});
test('a short departure returns without contaminating the average', () => {
  let state=run(1000);
  for(let at=1100; at<=5000; at+=100) state=step(state,at,1);
  state=step(state,5100,0);
  close(state.averageScore,100); close(state.currentScore,100); assert.equal(state.staticDeviationMs,0);
});
test('a ten second stretch freezes the previous score and restarts grace when motion stops', () => {
  let state=run(1000);
  for(let at=1100; at<=11100; at+=100) state=step(state,at,1,101);
  assert.equal(state.protection,'moving'); close(state.averageScore,100);
  assert.equal(state.deviationEpisodeCount,0); assert.equal(state.staticDeviationMs,0);
  state=step(state,11200,1,0);
  assert.equal(state.protection,'grace'); close(state.staticDeviationMs,0);
  for(let at=11300; at<=16200; at+=100) state=step(state,at,1);
  close(state.currentScore,100);
  state=step(state,16300,1); close(state.currentScore,98);
});
test('motion holds an already lowered score instead of replacing it with a perfect score', () => {
  const lowered=run(7000,1);
  close(lowered.currentScore,60);
  const moving=step(lowered,7100,1,200); close(moving.currentScore,60);
  const stationary=step(moving,7200,1); close(stationary.currentScore,60);
  const recovered=step(stationary,7300,0); close(recovered.currentScore,100);
});
test('velocity comparison is strictly above its threshold', () => {
  const base=run(1000);
  assert.equal(step(base,1100,1,100).protection,'grace');
  assert.equal(step(base,1100,1,100+1e-8).protection,'moving');
});
test('missing data resets grace and continuity but preserves completed totals', () => {
  const before=run(6000,1);
  const missing=step(before,6000,null);
  assert.equal(missing.currentScore,null); assert.equal(missing.staticDeviationMs,0);
  close(missing.validMs,before.validMs); close(missing.scoreTimeSum,before.scoreTimeSum);
  const resumed=step(missing,6100,1);
  close(resumed.validMs,before.validMs); assert.equal(resumed.protection,'grace');
  const interrupted=interruptEvaluation(before);
  assert.equal(interrupted.currentScore,null); assert.equal(interrupted.protection,'none');
  close(interrupted.averageScore,before.averageScore);
});
test('time weighted protected averages do not depend on frame density', () => {
  const dense=run(9000,1,0,100), sparse=run(9000,1,0,500);
  close(dense.currentScore,sparse.currentScore); close(dense.validMs,sparse.validMs); close(dense.averageScore,sparse.averageScore);
});
test('invalid intervals and policy changes cannot bridge earlier totals', () => {
  const before=run(1000);
  for(const ms of [1000,999,1501]) { const next=step(before,ms); close(next.validMs,before.validMs); assert.equal(next.continuousMs,0); }
  const changed={ ...policy, version:'experimental-new-version' };
  const next=step(before,1100,0,0,changed);
  assert.equal(next.validMs,0); assert.equal(next.averageScore,null); assert.equal(next.scorePolicyVersion,changed.version);
  const habit=step({ ...before, habitPolicyVersion:'old' },1100);
  assert.equal(habit.validMs,0); assert.equal(habit.habitPolicyVersion,HABIT_POLICY.version);
});
test('habit hysteresis uses weighted deviations and excludes moving intervals', () => {
  const almost=run(1900,0.15);
  assert.equal(almost.deviationEpisodeCount,0);
  const away=step(almost,2000,0.15); assert.equal(away.deviationEpisodeCount,1); assert.equal(away.deviationMs,0);
  const continuing=step(away,2100,0.11); close(continuing.deviationMs,100);
  const exited=step(continuing,2200,0.10); assert.equal(exited.deviationState,'near-reference'); close(exited.deviationMs,100);
  const moving=step(continuing,2200,0.2,200); assert.equal(moving.deviationState,'unknown'); close(moving.deviationMs,100);
});
test('neck and shoulder have independent grace timers', () => {
  let neck=createEvaluation(policy), shoulder=createEvaluation(shoulderScorePolicy);
  for(let at=0; at<=7000; at+=100) {
    const sample=observed(at,0);
    sample.delta.headForward=1;
    neck=advanceEvaluation(neck,sample,policy); shoulder=advanceEvaluation(shoulder,sample,shoulderScorePolicy);
  }
  close(neck.currentScore,60); assert.equal(shoulder.currentScore,100); assert.equal(shoulder.staticDeviationMs,0);
});
test('identical samples preserve caller data and replay deterministically', () => {
  const state=createEvaluation(policy), input=observed(0,0.2), before=structuredClone({state,input});
  advanceEvaluation(state,input,policy); assert.deepEqual({state,input},before);
  assert.deepEqual(run(7000,0.2),run(7000,0.2));
});
test('real capture gaps and timestamp reversals do not reuse motion or observed time', () => {
  const reference={ schemaVersion:2, sourceId:'cam', widthPx:1000, heightPx:1000, completedAtMs:0, baseEarSpanPx:200, baseShoulderSpanPx:500, baseEarHeightPx:250 };
  function frame(at,shift=0) {
    const landmarks=Array.from({length:33},()=>({x:0.5,y:0.5,visibility:1}));
    landmarks[0]={x:0.5+shift,y:0.25,visibility:1};
    landmarks[7]={x:0.6+shift,y:0.25,visibility:1}; landmarks[8]={x:0.4+shift,y:0.25,visibility:1};
    landmarks[11]={x:0.75,y:0.5,visibility:1}; landmarks[12]={x:0.25,y:0.5,visibility:1};
    return {landmarks,sourceId:'cam',widthPx:1000,heightPx:1000,timestampMs:at};
  }
  const first=advanceObservation(createObservation(),reference,frame(0));
  const moved=advanceObservation(first,reference,frame(100,0.02));
  close(moved.velocityPxPerSecond,200);
  for(const at of [100,99,601]) {
    const next=advanceObservation(moved,reference,frame(at));
    assert.equal(next.velocityPxPerSecond,null); close(next.observedSeconds,0.1);
  }
});
