import { readFile, writeFile } from 'node:fs/promises';
import { advanceCalibration, createCalibration } from '../../front/src/features/posture/calibration.ts';
import { advanceObservation, createObservation } from '../../front/src/features/posture/observation.ts';
import { scorePosture } from '../../front/src/features/posture/scoring.ts';
import { turtleScorePolicy } from '../../front/src/features/posture/modes/turtle.ts';
import { shoulderScorePolicy } from '../../front/src/features/posture/modes/shoulder.ts';
const input = JSON.parse(await readFile(process.argv[2] ?? 'reports/posture-augmentation/image-landmarks.json', 'utf8'));
const scores = (baseline, frame) => {
  const observed = advanceObservation(createObservation(), baseline, frame);
  if (!observed.delta) return null;
  const m = observed.measurement;
  // Frozen v3 raw equations from 7753e71. Compare score CHANGE for an unchanged
  // photograph, not which algorithm labels this person's posture as "healthy".
  const height = (baseline.baseEarHeightPx - m.earHeightPx) / baseline.baseShoulderSpanPx;
  const legacy = [0.35 * Math.max(0, m.earSpanPx / baseline.baseEarSpanPx - 1)
    + 0.25 * Math.max(0, m.shoulderSpanPx / baseline.baseShoulderSpanPx - 1) + 0.4 * Math.max(0, height),
  0.7 * Math.abs(m.shoulderHeightDifferenceShoulderWidths) + 0.375 * Math.abs(height)];
  const linear = (d, a, b) => d <= a ? 100 : d >= b ? 0 : 100 * (b - d) / (b - a);
  return { old: [linear(legacy[0], .04, .20), linear(legacy[1], .03, .18)],
    current: [turtleScorePolicy, shoulderScorePolicy].map(policy => scorePosture(observed.delta, policy).score) };
};
const rows = [], rejected = {};
for (const id of new Set(input.samples.map(sample => sample.sample))) {
  const samples = input.samples.filter(sample => sample.sample === id);
  const original = samples.find(sample => sample.scale === 1);
  let calibration = createCalibration();
  for (let at = 0; at <= 3000; at += 100) calibration = advanceCalibration(calibration, { ...original, sourceId: 'static', timestampMs: at });
  if (!calibration.reference) { const reason = calibration.reason ?? 'not-ready'; rejected[reason] = (rejected[reason] ?? 0) + 1; continue; }
  const baseline = calibration.reference;
  const originalScores = scores(baseline, { ...original, sourceId: 'static', timestampMs: 3100 });
  for (const sample of samples.filter(sample => sample.scale !== 1)) {
    const changed = scores(baseline, { ...sample, sourceId: 'static', timestampMs: 3200 });
    if (!changed) { rejected.variant = (rejected.variant ?? 0) + 1; continue; }
    rows.push({ sample: id, scale: sample.scale,
      oldChange: changed.old.map((value, i) => Math.abs(value - originalScores.old[i])),
      currentChange: changed.current.map((value, i) => Math.abs(value - originalScores.current[i])) });
  }
}
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const result = { method: input.method, baselineCommit: '7753e71', sourceImages: new Set(input.samples.map(s => s.sample)).size,
  scorePolicies: [turtleScorePolicy.version, shoulderScorePolicy.version],
  acceptedPairs: rows.length, rejected, note: 'Same accepted pairs for v3/v6; static repeated reference, no temporal smoothing. Quality gates and coverage are not an accuracy benchmark.',
  meanAbsoluteScoreChange: { v3: [0, 1].map(i => mean(rows.map(r => r.oldChange[i]))),
    v6: [0, 1].map(i => mean(rows.map(r => r.currentChange[i]))) }, rows };
await writeFile('reports/posture-augmentation/robustness-results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
