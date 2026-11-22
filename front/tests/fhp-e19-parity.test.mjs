// The neck model shipped in the app (public/models/fhp-e19) must give the same outputs as training (AI_HANDOFF 8절).
// The parity fixtures contain study participants' face landmarks, so they stay out of git
// (front/tests/fixtures/fhp-e19-parity, or FHP_PARITY_DIR); without them only the package checksums run.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as ort from 'onnxruntime-web';

const pkg = new URL('../public/models/fhp-e19/', import.meta.url);
const fixtures = process.env.FHP_PARITY_DIR ? pathToFileURL(`${process.env.FHP_PARITY_DIR.replace(/[\\/]$/, '')}/`) : new URL('./fixtures/fhp-e19-parity/', import.meta.url);
const sha256 = file => createHash('sha256').update(readFileSync(new URL(file, pkg))).digest('hex');
const missing = !existsSync(new URL('inputs.json', fixtures));

test('the app ships the E19 package unchanged (manifest checksums of 20261117_ensemble_v1)', () => {
  assert.equal(sha256('model.onnx'), '5ab5d8865e5ffc93f492bc158a2bf3cd4c9546169a3b1e7d6a10b06a3883b2c0');
  assert.equal(sha256('config.json'), '7cfc171f1310cf3b41a3d8b6310e24d8a22867d057dfad5ae91862a57ff9c4eb');
});

test('E19 run by the app runtime matches the training outputs (neck Δ < 0.05°, load < 0.25 %)',
  { skip: missing && 'parity fixtures not on this PC (front/tests/fixtures/fhp-e19-parity, git-ignored)' }, async () => {
    ort.env.wasm.numThreads = 1;
    const cfg = JSON.parse(readFileSync(new URL('config.json', pkg), 'utf8'));
    const session = await ort.InferenceSession.create(readFileSync(new URL('model.onnx', pkg)), { executionProviders: ['wasm'] });
    const read = name => JSON.parse(readFileSync(new URL(name, fixtures), 'utf8'));
    const worstOf = async (inputsFile, expectedFile) => {
      const inputs = read(inputsFile), expected = read(expectedFile), worst = {};
      for (let i = 0; i < inputs.pose.length; i++) {
        const feeds = Object.fromEntries(Object.entries(cfg.io.inputs).map(([name, shape]) =>
          [name, new ort.Tensor('float32', Float32Array.from([inputs[name][i]].flat(Infinity)), shape)]));
        const out = await session.run(feeds);
        for (const name of cfg.io.outputs) {
          const want = [expected[name][i]].flat(Infinity);
          const diff = Math.max(...Array.from(out[name].data, (value, j) => Math.abs(value - want[j])));
          worst[name] = Math.max(worst[name] ?? 0, diff);
        }
      }
      return { frames: inputs.pose.length, worst };
    };
    const face = await worstOf('inputs.json', 'expected.json');
    const noFace = await worstOf('inputs_noface.json', 'expected_noface.json');
    console.log(`E19 parity: ${face.frames} frames neck Δ ${face.worst.delta_deg.toExponential(1)}° load ${face.worst.load_pct.toExponential(1)}% · no face ${noFace.frames} frames neck Δ ${noFace.worst.delta_deg.toExponential(1)}°`);
    assert.ok(face.frames >= 300 && noFace.frames > 0);
    assert.ok(face.worst.delta_deg < 0.05, `neck Δ ${face.worst.delta_deg}`);
    assert.ok(face.worst.load_pct < 0.25, `load ${face.worst.load_pct}`);
    assert.ok(noFace.worst.delta_deg < 0.05, `no-face neck Δ ${noFace.worst.delta_deg}`);
  });
