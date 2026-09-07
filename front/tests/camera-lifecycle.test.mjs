import assert from 'node:assert/strict';
import test from 'node:test';
import { createMediaPipeController } from '../src/hooks/useMediaPipe.ts';
import { createWebcamController } from '../src/hooks/useWebcam.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function globalValue(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

function poseEnvironment(t, { initialize = Promise.resolve(), send = () => Promise.resolve() } = {}) {
  const frames = new Map(), instances = [], errors = [], loaded = [];
  let frameId = 0;
  globalValue(t, 'document', { baseURI: 'file:///F:/moti/dist/index.html' });
  globalValue(t, 'requestAnimationFrame', callback => { frames.set(++frameId, callback); return frameId; });
  globalValue(t, 'cancelAnimationFrame', id => frames.delete(id));
  class FakePose {
    constructor(config) { this.config = config; this.sends = 0; this.closes = 0; instances.push(this); }
    setOptions() {}
    onResults(callback) { this.callback = callback; }
    initialize() { return initialize; }
    send() { this.sends += 1; return send(); }
    async close() { this.closes += 1; }
  }
  const events = { onError: value => errors.push(value), onLoaded: value => loaded.push(value) };
  const controller = createMediaPipeController(events, async () => FakePose);
  const nextFrame = async () => {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback();
    await flush();
  };
  const video = { readyState: 2, paused: false, ended: false, currentTime: 0 };
  return { controller, instances, frames, errors, loaded, nextFrame, video, FakePose, events };
}

test('stopping while the script loads prevents a late Pose instance', async t => {
  const env = poseEnvironment(t);
  const loader = deferred();
  const controller = createMediaPipeController(env.events, () => loader.promise);
  const initializing = controller.initMediaPipe(() => {});
  await flush();
  await controller.stopProcessing();
  loader.resolve(env.FakePose);
  assert.equal(await initializing, null);
  assert.equal(env.instances.length, 0);
  assert.equal(env.loaded.at(-1), false);
});

test('stop waits for initialization before closing, and replacement waits for that close', async t => {
  const initializing = deferred();
  const env = poseEnvironment(t, { initialize: initializing.promise });
  const first = env.controller.initMediaPipe(() => {});
  await flush();
  const stopping = env.controller.stopProcessing();
  const second = env.controller.initMediaPipe(() => {});
  await flush();
  assert.equal(env.instances.length, 1);
  assert.equal(env.instances[0].closes, 0);
  initializing.resolve();
  assert.equal(await first, null);
  await stopping;
  await second;
  assert.equal(env.instances[0].closes, 1);
  assert.equal(env.instances.length, 2);
  await env.controller.stopProcessing();
});

test('stop drops late results, waits for send, and cannot restart the animation loop', async t => {
  const sending = deferred();
  const env = poseEnvironment(t, { send: () => sending.promise });
  const results = [];
  const pose = await env.controller.initMediaPipe((result, at) => results.push({ result, at }));
  env.controller.startProcessing(env.video);
  pose.callback({ poseLandmarks: [] });
  assert.equal(results.length, 1);
  assert.ok(Number.isFinite(results[0].at));
  const stopping = env.controller.stopProcessing();
  pose.callback({ poseLandmarks: [] });
  assert.equal(results.length, 1);
  assert.equal(pose.closes, 0);
  sending.resolve();
  await stopping;
  await flush();
  assert.equal(pose.closes, 1);
  assert.equal(env.frames.size, 0);
});

test('a new controller waits for an unmounted controller to finish its in-flight frame', async t => {
  const sending = deferred();
  const env = poseEnvironment(t, { send: () => sending.promise });
  const oldPose = await env.controller.initMediaPipe(() => {});
  env.controller.startProcessing(env.video);
  const stopping = env.controller.stopProcessing();
  const replacement = createMediaPipeController(env.events, async () => env.FakePose);
  const initializing = replacement.initMediaPipe(() => {});
  await flush();
  assert.equal(env.instances.length, 1);
  sending.resolve();
  await stopping;
  await initializing;
  assert.equal(oldPose.closes, 1);
  assert.equal(env.instances.length, 2);
  await replacement.stopProcessing();
});

test('results retain capture time even when the inference callback arrives much later', async t => {
  const sending = deferred();
  const env = poseEnvironment(t, { send: () => sending.promise });
  let now = 100;
  globalValue(t, 'performance', { now: () => now });
  const captured = [];
  const pose = await env.controller.initMediaPipe((_result, at) => captured.push(at));
  env.controller.startProcessing(env.video);
  now = 800;
  pose.callback({ poseLandmarks: [] });
  assert.deepEqual(captured, [100]);
  sending.resolve();
  await env.controller.stopProcessing();
});

test('one send at a time and one sample per distinct video frame', async t => {
  const sending = deferred();
  const env = poseEnvironment(t, { send: () => sending.promise });
  const pose = await env.controller.initMediaPipe(() => {});
  env.controller.startProcessing(env.video);
  env.controller.startProcessing(env.video);
  assert.equal(pose.sends, 1);
  assert.equal(env.frames.size, 0);
  sending.resolve();
  await flush();
  await env.nextFrame();
  assert.equal(pose.sends, 1);
  env.video.currentTime = 0.1;
  await env.nextFrame();
  assert.equal(pose.sends, 2);
  await env.controller.stopProcessing();
});

test('aborting during initialization suppresses readiness and closes after initialization', async t => {
  const initializing = deferred();
  const env = poseEnvironment(t, { initialize: initializing.promise });
  const abort = new AbortController();
  const pending = env.controller.initMediaPipe(() => {}, abort.signal);
  await flush();
  abort.abort();
  initializing.resolve();
  assert.equal(await pending, null);
  await env.controller.stopProcessing();
  assert.equal(env.loaded.includes(true), false);
  assert.equal(env.instances[0].closes, 1);
});

test('a failed inference reports an error and disposes without unhandled rejection', async t => {
  const env = poseEnvironment(t, { send: () => Promise.reject(new Error('inference failed')) });
  const pose = await env.controller.initMediaPipe(() => {});
  env.controller.startProcessing(env.video);
  await flush();
  assert.equal(env.errors.at(-1), 'inference failed');
  assert.equal(env.loaded.at(-1), false);
  assert.equal(env.frames.size, 0);
  assert.equal(pose.closes, 1);
});

test('local script loading is shared and every model URL stays alongside bundled pose.js', async t => {
  const env = poseEnvironment(t);
  const scripts = [];
  globalValue(t, 'document', {
    baseURI: 'file:///F:/moti/dist/index.html',
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => scripts.push(script) },
  });
  globalValue(t, 'window', { Pose: env.FakePose });
  const first = createMediaPipeController(env.events), second = createMediaPipeController(env.events);
  const pending = [first.initMediaPipe(() => {}), second.initMediaPipe(() => {})];
  await flush();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'file:///F:/moti/dist/mediapipe/pose/pose.js');
  scripts[0].onload();
  const [pose] = await Promise.all(pending);
  assert.equal(pose.config.locateFile('pose_solution_wasm_bin.wasm'), 'file:///F:/moti/dist/mediapipe/pose/pose_solution_wasm_bin.wasm');
  await first.stopProcessing();
  await second.stopProcessing();
});

function cameraEnvironment(t) {
  const requests = [], errors = [];
  const video = { srcObject: null };
  globalValue(t, 'navigator', { mediaDevices: { getUserMedia: constraints => {
    const request = deferred(); requests.push({ ...request, constraints }); return request.promise;
  } } });
  const controller = createWebcamController(() => video, value => errors.push(value));
  const stream = () => {
    const track = { stops: 0, stop() { this.stops += 1; } };
    return { getTracks: () => [track], track };
  };
  return { controller, requests, errors, video, stream };
}

test('a late camera permission grant after stop immediately releases the returned stream', async t => {
  const env = cameraEnvironment(t);
  const pending = env.controller.startWebcam();
  env.controller.stopWebcam();
  const stream = env.stream();
  env.requests[0].resolve(stream);
  assert.equal(await pending, null);
  assert.equal(stream.track.stops, 1);
  assert.equal(env.video.srcObject, null);
});

test('stopping before attachment or after the video ref clears remains safe and releases the attached element', async t => {
  const env = cameraEnvironment(t);
  let video = null;
  const controller = createWebcamController(() => video, () => {});
  assert.doesNotThrow(() => controller.stopWebcam());
  video = env.video;
  const pending = controller.startWebcam();
  const stream = env.stream();
  env.requests[0].resolve(stream);
  await pending;
  video = null;
  assert.doesNotThrow(() => controller.stopWebcam());
  assert.equal(stream.track.stops, 1);
  assert.equal(env.video.srcObject, null);
  assert.doesNotThrow(() => controller.stopWebcam());
});

test('a stale camera request cannot replace the newer chosen device', async t => {
  const env = cameraEnvironment(t);
  const first = env.controller.startWebcam('old'), second = env.controller.startWebcam('chosen');
  const stale = env.stream(), current = env.stream();
  env.requests[1].resolve(current);
  assert.equal(await second, current);
  env.requests[0].resolve(stale);
  assert.equal(await first, null);
  assert.equal(env.video.srcObject, current);
  assert.equal(stale.track.stops, 1);
  assert.deepEqual(env.requests[1].constraints, {
    audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, deviceId: { exact: 'chosen' } },
  });
  env.controller.stopWebcam();
  assert.equal(current.track.stops, 1);
  assert.equal(env.video.srcObject, null);
});

test('stale permission errors do not overwrite the current camera state', async t => {
  const env = cameraEnvironment(t);
  const old = env.controller.startWebcam();
  const current = env.controller.startWebcam();
  env.requests[0].reject(new Error('old request denied'));
  assert.equal(await old, null);
  env.requests[1].resolve(env.stream());
  await current;
  assert.equal(env.errors.at(-1), null);
  env.controller.stopWebcam();
});
