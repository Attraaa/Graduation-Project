import { createNeckModel, type NeckModelConfig } from './model.ts';

/**
 * 앱 안의 E19 패키지(public/models/fhp-e19)와 ONNX Runtime Web wasm(public/ort)을 읽습니다. 외부 CDN을 쓰지 않습니다.
 * 한 번에 한 프레임만 추론하므로 스레드 1개(SharedArrayBuffer 불필요)로 돌립니다.
 */
export async function loadNeckModel() {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: new URL('ort/ort-wasm-simd-threaded.wasm', document.baseURI).href };
  const base = new URL('models/fhp-e19/', document.baseURI);
  const response = await fetch(new URL('config.json', base));
  if (!response.ok) throw new Error('목 모델 설정을 불러오지 못했습니다. 설치 파일을 확인해 주세요.');
  const config = await response.json() as NeckModelConfig;
  const session = await ort.InferenceSession.create(new URL('model.onnx', base).href, { executionProviders: ['wasm'] });
  return createNeckModel(ort, session, config);
}
