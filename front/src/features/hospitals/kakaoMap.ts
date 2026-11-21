/*
 * Kakao Maps JavaScript SDK loader. Kakao serves the SDK only to the domains registered for the key in Kakao Developers:
 * http://localhost:5173 for development and file:// for the packaged app (checked 2026-11-14).
 * The key is VITE_KAKAO_JS_KEY in front/.env.local.
 */
const KEY = String(import.meta.env?.VITE_KAKAO_JS_KEY ?? '');

/** The part of the SDK this app uses. */
export interface LatLng { getLat(): number; getLng(): number }
export interface KakaoMap {
  setBounds(bounds: LatLngBounds): void; setCenter(position: LatLng): void; panTo(position: LatLng): void;
  /** Required after the container changes size; until then the map keeps drawing at its old size. */
  relayout(): void;
}
export interface LatLngBounds { extend(position: LatLng): void }
export interface Marker { setMap(map: KakaoMap | null): void }
export interface InfoWindow { setContent(content: HTMLElement): void; open(map: KakaoMap, marker: Marker): void; close(): void }
export interface KakaoMaps {
  load(ready: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => LatLngBounds;
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => KakaoMap;
  Marker: new (options: { map: KakaoMap; position: LatLng; title?: string }) => Marker;
  InfoWindow: new (options: { content: HTMLElement | string }) => InfoWindow;
  event: { addListener(target: Marker, type: 'click', handler: () => void): void };
}
declare global {
  interface Window { kakao?: { maps: KakaoMaps } }
}

let loading: Promise<KakaoMaps> | null = null;

/** Loads the SDK once. A failed load can be tried again by the next search. */
export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (!KEY) return Promise.reject(new Error('지도 키가 설정되지 않아 목록으로만 보여 드려요.'));
  loading ??= new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      script.remove();
      loading = null;
      reject(new Error('지도를 불러오지 못해 목록으로만 보여 드려요.'));
    };
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KEY)}&autoload=false`;
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (maps) maps.load(() => resolve(maps));
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
