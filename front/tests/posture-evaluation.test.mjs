import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceEvaluation, createEvaluation, habitRule, interruptEvaluation, HABIT_POLICY } from '../src/features/posture/evaluation.ts';
import { createObservation, advanceObservation } from '../src/features/posture/observation.ts';
import { neckDeviation, turtleScorePolicy } from '../src/features/posture/modes/turtle.ts';
import { balanceScorePolicy } from '../src/features/posture/modes/balance.ts';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
// Since 2026-11-25 both upper-body scores (neck E19, balance) arrive already measured and filtered; the evaluation
// keeps time, the time-weighted average, whole-number scores and the habit episodes. Same deviation as the app.
const deviation = neckDeviation;
const step = (state, ms, score, policy=turtleScorePolicy, habit=HABIT_POLICY) =>
  advanceEvaluation(state, { observedSeconds: ms / 1000 }, policy, habit, { score, deviation: deviation(score) });
function run(until, score, interval=100, policy=turtleScorePolicy, habit=HABIT_POLICY) {
  let state=createEvaluation(policy, habit);
  for(let at=0; at<=until; at+=interval) state=step(state,at,score,policy,habit);
  return state;
}

test('the first score shows at once but joins the average only with the next one', () => {
  const first=step(createEvaluation(turtleScorePolicy),0,90);
  assert.equal(first.currentScore,90); assert.equal(first.averageScore,null); assert.equal(first.validMs,0);
  const second=step(first,100,80);
  assert.equal(second.currentScore,80); close(second.validMs,100); close(second.averageScore,85);
});
test('shown scores are whole numbers, and the stored score-time sum grows by those whole numbers', () => {
  let state=createEvaluation(turtleScorePolicy);
  for(let at=0, score=99.6; at<=1000; at+=10, score-=0.37) {
    const previous=state;
    state=step(state,at,score);
    assert.ok(Number.isInteger(state.currentScore), `${state.currentScore}`);
    if (previous.currentScore !== null) close(state.scoreTimeSum - previous.scoreTimeSum, (previous.currentScore + state.currentScore) / 2 * (state.validMs - previous.validMs));
  }
  assert.equal(state.currentScore, Math.round(99.6 - 0.37 * 100));
});
test('missing data breaks continuity but keeps completed totals; the next score starts a new interval', () => {
  const before=run(1000,80);
  const missing=interruptEvaluation(before);
  assert.equal(missing.currentScore,null); assert.equal(missing.continuousMs,0); assert.equal(missing.deviationState,'unknown');
  close(missing.validMs,before.validMs); close(missing.scoreTimeSum,before.scoreTimeSum); close(missing.averageScore,before.averageScore);
  const resumed=step(missing,1100,70);
  assert.equal(resumed.currentScore,70); close(resumed.validMs,before.validMs);
  const next=step(resumed,1200,70);
  close(next.validMs,before.validMs + 100);
});
test('invalid intervals and policy changes cannot bridge earlier totals', () => {
  const before=run(1000,90);
  for(const ms of [1000,999,1501]) { const next=step(before,ms,90); close(next.validMs,before.validMs); assert.equal(next.continuousMs,0); }
  const changed={ version:'experimental-new-version' };
  const next=step(before,1100,90,changed);
  assert.equal(next.validMs,0); assert.equal(next.averageScore,null); assert.equal(next.scorePolicyVersion,changed.version);
  const habit=step({ ...before, habitPolicyVersion:'old' },1100,90);
  assert.equal(habit.validMs,0); assert.equal(habit.habitPolicyVersion,HABIT_POLICY.version);
});
test('habit hysteresis at the alert default: 70 or lower for 3 s is one episode, it lasts until 80 or higher', () => {
  assert.equal(HABIT_POLICY.version, 'alert-hold-v1:70:3');
  const almost=run(2900,70);
  assert.equal(almost.deviationEpisodeCount,0); assert.equal(almost.deviationState,'pending');
  const away=step(almost,3000,70); assert.equal(away.deviationEpisodeCount,1); assert.equal(away.deviationMs,0);
  const continuing=step(away,3100,78); close(continuing.deviationMs,100); assert.equal(continuing.deviationState,'away');
  const exited=step(continuing,3200,80); assert.equal(exited.deviationState,'near-reference'); close(exited.deviationMs,100);
});
test('기준에서 벗어남 follows the upper-body alert setting "N점 이하 N초" and keeps it in the rule ID', () => {
  assert.deepEqual(habitRule(60, 10), { version: 'alert-hold-v1:60:10', enterDelta: 0.2, exitDelta: 0.15, minDurationMs: 10000 });
  assert.equal(habitRule(95, 1).exitDelta, 0);  // ends only back at 100
  const rule=habitRule(60, 1);
  const at60=run(1000,60,100,turtleScorePolicy,rule), at61=run(1000,61,100,turtleScorePolicy,rule);
  assert.equal(at60.deviationEpisodeCount,1); assert.equal(at61.deviationEpisodeCount,0);
  assert.equal(at60.habitPolicyVersion,'alert-hold-v1:60:1');
  // The count uses the whole number on screen, like the alert: 70.4 shows 70 and counts at "70점 이하".
  const shown=run(3000,70.4,100,turtleScorePolicy,HABIT_POLICY);
  assert.equal(shown.currentScore,70); assert.equal(shown.deviationEpisodeCount,1);
});
test('neck and balance keep separate states, averages and policy IDs', () => {
  let neck=createEvaluation(turtleScorePolicy), balance=createEvaluation(balanceScorePolicy);
  for(let at=0; at<=3000; at+=100) { neck=step(neck,at,60); balance=step(balance,at,95,balanceScorePolicy); }
  close(neck.averageScore,60); close(balance.averageScore,95);
  assert.equal(neck.deviationEpisodeCount,1); assert.equal(balance.deviationEpisodeCount,0);
  assert.match(balance.scorePolicyVersion, /^upper-body-balance-v1-[0-9a-z]+$/);
});
test('identical samples preserve caller data and replay deterministically', () => {
  const state=createEvaluation(turtleScorePolicy), before=structuredClone(state);
  step(state,0,80); assert.deepEqual(state,before);
  assert.deepEqual(run(7000,72),run(7000,72));
});
test('real capture gaps and timestamp reversals do not reuse motion or observed time in the pose observation', () => {
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
