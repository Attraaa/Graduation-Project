import { useCallback, useEffect, useRef, useState } from 'react';
import type { HospitalResult } from './api';
import frameUrl from './mapFrame.html?url&no-inline';

const KEY = String(import.meta.env?.VITE_KAKAO_JS_KEY ?? '');

export default function HospitalMap({ result, selected, onSelect }: {
  result: HospitalResult; selected: string | null; onSelect: (id: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const initialize = useCallback(() => {
    const { lat, lng } = result.center;
    const places = result.hospitals.map(({ id, name, lat, lng }) => ({ id, name, lat, lng }));
    frame.current?.contentWindow?.postMessage({ type: 'moti-map:init', key: KEY, center: { lat, lng }, places, id: selected }, '*');
  }, [result, selected]);
  useEffect(() => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    const send = (event: MessageEvent) => {
      if (event.source !== view || event.origin !== 'null') return;
      if (event.data?.type === 'moti-map:ready') initialize();
      else if (event.data?.type === 'moti-map:failed') setFailed(true);
      else if (event.data?.type === 'moti-map:selected' && result.hospitals.some(place => place.id === event.data.id)) onSelect(event.data.id);
    };
    window.addEventListener('message', send);
    view.postMessage({ type: 'moti-map:select', id: selected }, '*');
    return () => window.removeEventListener('message', send);
  }, [result, selected, onSelect, initialize]);
  if (!KEY || failed) return <p className="text-xs text-muted">
    {KEY ? '지도를 불러오지 못해 목록으로 보여 드려요.' : '지도 키가 설정되지 않아 목록으로 보여 드려요.'}
  </p>;
  return <iframe ref={frame} src={frameUrl} sandbox="allow-scripts" title="병원 위치 지도" onLoad={initialize}
    className="h-72 w-full overflow-hidden rounded-xl border border-border bg-surface-muted" />;
}
