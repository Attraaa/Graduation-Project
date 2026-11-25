import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceEvaluation, createEvaluation, interruptEvaluation, HABIT_POLICY, habitPolicy, isCurrentHabitPolicy, normalizePostureSensitivity } from '../src/features/posture/evaluation.ts';
import { createObservation, advanceObservation } from '../src/features/posture/observation.ts';
import { turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy } from '../src/features/posture/modes/shoulder.ts';
import { MOTION_PROTECTION } from '../src/features/posture/scoreSettings.ts';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
// The ratio scorer's time rules with a one-metric policy (deviation = d, 100 points at 0.04, 0 at 0.20).
// The neck score itself comes from E19 since 2026-11-23 and is tested below with measured scores.
const policy = Object.freeze({ version: 'test-ratio-policy', mode: 'turtle', weights: { shoulderTilt: 1 }, fullCreditDelta: 0.04, zeroCreditDelta: 0.20 });
function observed(ms, deviation = 0, velocity = 0) {
  return { ...createObservation(), observedSeconds: ms / 1000, velocityPxPerSecond: velocity,
    delta: deviation === null ? null : { shoulderTilt: deviation, shoulderShrug: deviation, yawRatio: 0 } };
}
const step = (state, ms, d=0, v=0, selected=policy) => advanceEvaluation(state, observed(ms,d,v), selected);
function run(until, d=0, v=0, interval=100, selected=policy) {
  let state=createEvaluation(selected);
  for(let at=0; at<=until; at+=interval) state=step(state,at,d,v,selected);
  return state;
}
function depart(until, d=1, interval=100, selected=policy) {
  let state=step(createEvaluation(selected),0,0,0,selected);
  state=step(state,100,d,0,selected);
  for(let at=100+interval; at<=100+until; at+=interval) state=step(state,at,d,0,selected);
  return state;
}
test('no observations are unknown; grace does not manufacture missing data', () => {
  const missing=step(createEvaluation(policy),0,null);
  assert.equal(missing.currentScore,null); assert.equal(missing.averageScore,null);
  const first=step(missing,0,1);
  assert.equal(first.currentScore,0); assert.equal(first.averageScore,null); assert.equal(first.validMs,0);
  const moving=step(createEvaluation(policy),0,1,MOTION_PROTECTION.velocityPxPerSecond+1);
  assert.equal(moving.currentScore,null); assert.equal(moving.lastScore,null); assert.equal(moving.averageScore,null);
});
test('grace period of static deviation is protected and subsequent penalty is gradual', () => {
  const boundary=depart(MOTION_PROTECTION.graceMs);
  close(boundary.currentScore,100); close(boundary.averageScore,100);
  assert.equal(boundary.protection,'grace');
  const after=step(boundary,MOTION_PROTECTION.graceMs + 200,1);
  close(after.lastScore, 100 - MOTION_PROTECTION.penaltyPointsPerSecond * 0.1); assert.equal(after.protection,'none');
  assert.equal(after.currentScore, Math.round(after.lastScore));
  const settled=depart(MOTION_PROTECTION.graceMs + 6000);
  close(settled.currentScore,0); assert.ok(settled.averageScore > 0);
  const zero=step({ ...createEvaluation(policy), ...settled, validMs: 0, scoreTimeSum: 0 },MOTION_PROTECTION.graceMs + 6200,1);
  close(zero.averageScore,0);
});
test('a short departure returns without contaminating the average', () => {
  let state=run(1000);
  for(let at=1100; at<=1000 + MOTION_PROTECTION.graceMs; at+=100) state=step(state,at,1);
  state=step(state,1000 + MOTION_PROTECTION.graceMs + 100,0);
  close(state.averageScore,100); close(state.currentScore,100); assert.equal(state.staticDeviationMs,0);
});
test('a ten second stretch freezes the previous score and restarts grace when motion stops', () => {
  let state=run(1000);
  for(let at=1100; at<=11100; at+=100) state=step(state,at,1,MOTION_PROTECTION.velocityPxPerSecond + 1);
  assert.equal(state.protection,'moving'); close(state.averageScore,100);
  assert.equal(state.deviationEpisodeCount,0); assert.equal(state.staticDeviationMs,0);
  state=step(state,11200,1,0);
  assert.equal(state.protection,'grace'); close(state.staticDeviationMs,0);
  for(let at=11300; at<=11200 + MOTION_PROTECTION.graceMs; at+=100) state=step(state,at,1);
  close(state.currentScore,100);
  state=step(state,11200 + MOTION_PROTECTION.graceMs + 100,1);
  close(state.lastScore, 100 - MOTION_PROTECTION.penaltyPointsPerSecond * 0.1);
  assert.equal(state.currentScore, Math.round(state.lastScore));
});
test('shown scores are whole numbers, and a gradual penalty below half a point per frame still goes down', () => {
  // 10 ms frames lose 0.35 points each; rounding the held score every frame would stop it at 100.
  let state=depart(MOTION_PROTECTION.graceMs, 1, 10);
  for(let at=100 + MOTION_PROTECTION.graceMs + 10; at<=100 + MOTION_PROTECTION.graceMs + 1000; at+=10) {
    const previous=state;
    state=step(state,at,1);
    assert.ok(Number.isInteger(state.currentScore), `${state.currentScore}`);
    // The score-time sum (stored per minute) grows by the shown whole numbers, not by the held fractions.
    close(state.scoreTimeSum - previous.scoreTimeSum, (previous.currentScore + state.currentScore) / 2 * (state.validMs - previous.validMs));
  }
  assert.equal(state.currentScore, 100 - MOTION_PROTECTION.penaltyPointsPerSecond);
});
test('motion holds an already lowered score instead of replacing it with a perfect score', () => {
  const lowered=depart(MOTION_PROTECTION.graceMs + 1000);
  close(lowered.currentScore, 100 - MOTION_PROTECTION.penaltyPointsPerSecond * 1);
  const moving=step(lowered,MOTION_PROTECTION.graceMs + 1200,1,MOTION_PROTECTION.velocityPxPerSecond + 50);
  close(moving.currentScore, 100 - MOTION_PROTECTION.penaltyPointsPerSecond * 1);
  const stationary=step(moving,MOTION_PROTECTION.graceMs + 1300,1);
  close(stationary.currentScore, 100 - MOTION_PROTECTION.penaltyPointsPerSecond * 1);
  const returnedAt=MOTION_PROTECTION.graceMs + 1400;
  let recovered=step(stationary,returnedAt,0);
  close(recovered.currentScore,lowered.currentScore); assert.equal(recovered.protection,'recovering');
  for(let elapsed=100; elapsed<MOTION_PROTECTION.recoveryMs; elapsed+=100) {
    recovered=step(recovered,returnedAt+elapsed,0);
    close(recovered.currentScore,lowered.currentScore);
  }
  recovered=step(recovered,returnedAt+MOTION_PROTECTION.recoveryMs,0);
  close(recovered.currentScore,100); assert.equal(recovered.protection,'none');
});
test('velocity comparison is strictly above its threshold', () => {
  const base=run(1000);
  assert.equal(step(base,1100,1,MOTION_PROTECTION.velocityPxPerSecond).protection,'grace');
  assert.equal(step(base,1100,1,MOTION_PROTECTION.velocityPxPerSecond+1e-8).protection,'moving');
});
test('missing data resets grace and continuity but preserves completed totals', () => {
  const before=depart(5900);
  const missing=step(before,6000,null);
  assert.equal(missing.currentScore,null); assert.equal(missing.staticDeviationMs,0);
  close(missing.validMs,before.validMs); close(missing.scoreTimeSum,before.scoreTimeSum);
  const resumed=step(missing,6100,1);
  close(resumed.validMs,before.validMs); assert.equal(resumed.protection,'grace');
  close(resumed.currentScore,before.currentScore); close(resumed.lastScore,before.lastScore);
  const interrupted=interruptEvaluation(before);
  assert.equal(interrupted.currentScore,null); assert.equal(interrupted.protection,'none');
  close(interrupted.averageScore,before.averageScore);
});
test('time weighted protected averages do not depend on frame density beyond whole-number scores', () => {
  const dense=depart(3000,1,100), sparse=depart(3000,1,500);
  assert.ok(dense.currentScore>0 && dense.currentScore<100);
  close(dense.currentScore,sparse.currentScore); close(dense.validMs,sparse.validMs);
  assert.ok(Math.abs(dense.averageScore - sparse.averageScore) < 0.5, `${dense.averageScore} != ${sparse.averageScore}`);
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
  const moving=step(continuing,2200,0.2,MOTION_PROTECTION.velocityPxPerSecond + 50); assert.equal(moving.deviationState,'unknown'); close(moving.deviationMs,100);
});
test('a measured neck score (E19) is used as given while the shoulder keeps its own grace timer', () => {
  let neck=createEvaluation(turtleScorePolicy), shoulder=step(createEvaluation(shoulderScorePolicy),0,0,0,shoulderScorePolicy);
  for(let at=0; at<=MOTION_PROTECTION.graceMs + 1100; at+=100) {
    const sample=observed(at,0);
    neck=advanceEvaluation(neck,sample,turtleScorePolicy,HABIT_POLICY,{ score: 60, deviation: 0.2 });
    if (at) shoulder=advanceEvaluation(shoulder,sample,shoulderScorePolicy);
  }
  assert.equal(neck.currentScore,60); assert.equal(neck.protection,'none'); close(neck.averageScore,60);
  assert.equal(shoulder.currentScore,100); assert.equal(shoulder.staticDeviationMs,0);
});
test('measured neck scores ignore motion protection but keep time, average and habit rules', () => {
  const measured=(state,at,score,velocity=0) => advanceEvaluation(state,observed(at,0,velocity),turtleScorePolicy,HABIT_POLICY,{ score, deviation: score === null ? null : (100 - score) / 200 });
  let state=createEvaluation(turtleScorePolicy);
  state=measured(state,0,90); state=measured(state,100,80,MOTION_PROTECTION.velocityPxPerSecond * 4);
  assert.equal(state.currentScore,80); assert.equal(state.protection,'none'); close(state.validMs,100); close(state.averageScore,85);
  for(let at=200; at<=2200; at+=100) state=measured(state,at,70);
  assert.equal(state.deviationEpisodeCount,1); assert.equal(state.deviationState,'away');
  const missing=measured(state,2300,null);
  assert.equal(missing.currentScore,null); close(missing.validMs,state.validMs);
  const back=measured(missing,2400,95);
  close(back.validMs,state.validMs); assert.equal(back.deviationState,'unknown');
});
test('a measured neck score needs only its own observed time, not the shoulder observation', () => {
  const measured=(state,seconds,score) => advanceEvaluation(state,{ observedSeconds: seconds },turtleScorePolicy,HABIT_POLICY,{ score, deviation: (100 - score) / 200 });
  let state=measured(createEvaluation(turtleScorePolicy),0,90);
  state=measured(state,0.1,80);
  assert.equal(state.currentScore,80); close(state.validMs,100); close(state.averageScore,85);
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
test('posture sensitivity keeps the default rule at 50% and scales only the deviation thresholds', () => {
  assert.equal(habitPolicy(), HABIT_POLICY); assert.equal(habitPolicy(50), HABIT_POLICY);
  assert.deepEqual(habitPolicy(70), { version: 'weighted-reference-deviation-v3:s70', enterDelta: 0.12, exitDelta: 0.08, minDurationMs: 2000 });
  assert.deepEqual([habitPolicy(100).enterDelta, habitPolicy(100).exitDelta], [0.075, 0.05]);
  assert.deepEqual([habitPolicy(10).enterDelta, habitPolicy(10).exitDelta], [0.21, 0.14]);
  for (const [input, value] of [[73, 70], ['30', 30], [5, 10], [400, 100], [NaN, 50], ['', 50], [null, 50], ['abc', 50]]) assert.equal(normalizePostureSensitivity(input), value);
  for (const version of [HABIT_POLICY.version, 'weighted-reference-deviation-v3:s10', 'weighted-reference-deviation-v3:s70', 'weighted-reference-deviation-v3:s100']) assert.equal(isCurrentHabitPolicy(version), true);
  for (const version of ['weighted-reference-deviation-v2', 'weighted-reference-deviation-v3:s50', 'weighted-reference-deviation-v3:s75', 'weighted-reference-deviation-v3:s']) assert.equal(isCurrentHabitPolicy(version), false);
});
test('a higher posture sensitivity counts a smaller sustained deviation while scores stay the same', () => {
  const stream = habit => { let state=createEvaluation(policy, habit); for(let at=0; at<=2100; at+=100) state=advanceEvaluation(state, observed(at,0.13), policy, habit); return state; };
  const normal=stream(HABIT_POLICY), high=stream(habitPolicy(70)), low=stream(habitPolicy(30));
  assert.equal(normal.deviationEpisodeCount,0); assert.equal(high.deviationEpisodeCount,1); assert.equal(low.deviationEpisodeCount,0);
  assert.equal(high.deviationState,'away'); assert.equal(high.habitPolicyVersion,'weighted-reference-deviation-v3:s70');
  close(high.averageScore, normal.averageScore); assert.equal(high.currentScore, normal.currentScore); close(high.validMs, normal.validMs);
  const switched=advanceEvaluation(normal, observed(2200,0.13), policy, habitPolicy(70));
  assert.equal(switched.validMs,0); assert.equal(switched.deviationEpisodeCount,0); assert.equal(switched.habitPolicyVersion,'weighted-reference-deviation-v3:s70');
});
