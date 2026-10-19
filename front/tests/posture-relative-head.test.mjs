import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceCalibration, createCalibration } from '../src/features/posture/calibration.ts';
import { advanceObservation, createObservation } from '../src/features/posture/observation.ts';
import { headDepth, relativeHeadEvidence, trunkContribution } from '../src/features/posture/relativeHead.ts';
import { scorePosture } from '../src/features/posture/scoring.ts';
import { turtleScorePolicy as neck } from '../src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy as shoulder } from '../src/features/posture/modes/shoulder.ts';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

// A pinhole scene: head is 10 cm nearer than shoulders. Unlike uniform 2D resize,
// translating the whole person produces different face/shoulder scale changes.
function projected(at, approach = 0, headOnly = 0) {
  const world = Array.from({length:33}, () => ({x:0,y:0,z:1-approach}));
  world[0]={x:0,y:-.2,z:.9-approach-headOnly};
  world[7]={x:.09,y:-.2,z:.9-approach-headOnly};world[8]={x:-.09,y:-.2,z:.9-approach-headOnly};
  world[11]={x:.23,y:0,z:1-approach};world[12]={x:-.23,y:0,z:1-approach};
  const landmarks=world.map(p=>({x:.5+p.x/p.z,y:.5+p.y/p.z,visibility:1}));
  landmarks[23]=landmarks[24]={x:.5,y:1.2,visibility:0};
  return {sourceId:'pinhole',timestampMs:at,widthPx:1000,heightPx:1000,landmarks,worldLandmarks:world};
}
function reference() {
  let state=createCalibration();
  for(let at=0;at<=3000;at+=100) state=advanceCalibration(state,projected(at));
  assert.ok(state.reference?.baseHeadDepth);return state.reference;
}
test('real perspective approach and retreat do not penalize rigid posture, even without hips',()=>{
  const ref=reference();
  for(const translation of [-.25,-.1,.05,.1,.2,.3]) {
    const sample=advanceObservation(createObservation(),ref,projected(3100,translation));
    assert.ok(sample.delta);
    for(const policy of [neck,shoulder]) close(scorePosture(sample.delta,policy).score,100);
    close(sample.delta.torsoForward,0);
  }
});
test('head-only motion affects score even when projected ears fail to change width',()=>{
  const ref=reference(), fixed=projected(3100), moved=projected(3100,0,.08);
  moved.landmarks=fixed.landmarks; // Reproduce the reported unresponsive ear-width cue.
  const sample=advanceObservation(createObservation(),ref,moved);
  assert.equal(sample.headEvidence.source,'depth');
  assert.ok(scorePosture(sample.delta,neck).score<70);
  close(scorePosture(sample.delta,shoulder).score,100);
  const inconsistent=projected(3100);inconsistent.worldLandmarks[0].z-=.08;
  close(scorePosture(advanceObservation(createObservation(),ref,inconsistent).delta,neck).score,100);
});
test('depth needs a stable calibration baseline and current finite matching head cues',()=>{
  const baseline=reference(),input=projected(3100,0,.08);
  input.landmarks=projected(3100).landmarks;
  for(const world of [undefined,input.worldLandmarks.map((p,i)=>i===7?{...p,z:NaN}:p)]) {
    const sample=advanceObservation(createObservation(),baseline,{...input,worldLandmarks:world});
    close(sample.headEvidence.depth,0);close(scorePosture(sample.delta,neck).score,100);
  }
  const missingReference=advanceObservation(createObservation(),{...baseline,baseHeadDepth:null},input);
  close(missingReference.headEvidence.depth,0);
  let state=createCalibration();
  for(let at=0;at<=3000;at+=100) {
    const f=projected(at);if(at===100) f.worldLandmarks[0].z-=.1;
    state=advanceCalibration(state,f);
  }
  assert.equal(state.reference.baseHeadDepth,null);
});
test('depth is translation and scale independent; common framing suppresses depth drift',()=>{
  const original=projected(0).worldLandmarks, expected=headDepth(original);
  headDepth(original.map(p=>({x:p.x*2+3,y:p.y*2+1,z:p.z*2+4}))).forEach((v,i)=>close(v,expected[i]));
  const signals=relativeHeadEvidence(1.28,1.25,[-.2,-.2],[-.5,-.5]);
  close(signals.depth,0);close(signals.headForward,0);
});
test('MLP is a bounded corroboration, cannot penalize alone, and never changes shoulders',()=>{
  for(const baseline of [true,false]) for(const forward of [true,false]) {
    close(trunkContribution(baseline,forward,0,0),0);
    if(!baseline||!forward) close(trunkContribution(baseline,forward,.5,.5),0);
  }
  const base={headForward:.2,neckSlump:0,torsoForward:0,shoulderTilt:0,shoulderShrug:0,yawRatio:0};
  const assisted={...base,torsoForward:trunkContribution(true,true,.2,0)};
  close(assisted.torsoForward,.08);
  close(scorePosture(base,neck).score-scorePosture(assisted,neck).score,12.5);
  close(scorePosture(assisted,shoulder).score,100);
  close(trunkContribution(true,true,100,100),.08);
});

test('actual classifier integration requires reference eligibility, confirmation and current visibility',()=>{
  const make=(at,forward=false)=>{
    const f=projected(at);
    f.landmarks[23]={x:.4,y:.9,visibility:1};f.landmarks[24]={x:.6,y:.9,visibility:1};
    f.worldLandmarks=Array.from({length:33},()=>({x:0,y:0,z:0}));
    f.worldLandmarks[11]={x:.2,y:0,z:0};f.worldLandmarks[12]={x:-.2,y:0,z:0};
    f.worldLandmarks[0]={x:0,y:-.1,z:-.32};
    f.worldLandmarks[7]={x:.1,y:-.1,z:-.2};f.worldLandmarks[8]={x:-.1,y:-.1,z:-.2};
    f.worldLandmarks[23]=f.worldLandmarks[24]={x:0,y:.48,z:forward?.16:0};
    if(forward){f.landmarks[7].x+=.01;f.landmarks[8].x-=.01;}
    return f;
  };
  let calibration=createCalibration();
  for(let at=0;at<=3000;at+=100) calibration=advanceCalibration(calibration,make(at));
  const ref=calibration.reference;assert.equal(ref.baseTrunkUpright,true);
  let state=createObservation();
  for(let at=3100;at<=4000;at+=100){state=advanceObservation(state,ref,make(at,true));close(state.delta.torsoForward,0);}
  state=advanceObservation(state,ref,make(4100,true));
  assert.equal(state.trunk.estimate.label,'forward');close(state.delta.torsoForward,.08);
  const hidden=make(4200,true);hidden.landmarks[23].visibility=0;
  const next=advanceObservation(state,ref,hidden);assert.ok(next.delta);close(next.delta.torsoForward,0);
  assert.equal(next.trunk.estimate.label,null);
  close(advanceObservation(state,ref,make(4701,true)).delta.torsoForward,0);
  close(advanceObservation(state,{...ref,baseTrunkUpright:false},make(4200,true)).delta.torsoForward,0);
});
