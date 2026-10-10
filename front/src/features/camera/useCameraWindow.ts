import { useCallback, useEffect, useRef, useState } from 'react';

/** One settings window shares the existing analysis canvas and never opens a stream. */
export function useCameraWindow() {
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popup = useRef<Window | null>(null);
  const open = useCallback((ratio = 16 / 9) => {
    if (popup.current && !popup.current.closed) { popup.current.focus(); return; }
    const width = Math.min(1100, screen.availWidth - 40);
    const height = Math.min(screen.availHeight - 80, Math.max(540, (width - 300 - 48) / ratio + 48 + 88 + (window.motiWindow ? 36 : 0)));
    const child = window.open(new URL('camera-settings.html', document.baseURI).href, 'moti-camera-settings', `width=${width},height=${Math.round(height)}`);
    if (!child) { setError('카메라 설정 창을 열지 못했습니다. 팝업 허용 설정을 확인해 주세요.'); return; }
    setError(null);
    popup.current = child;
    const prepare = () => {
      if (child.closed) return;
      const root = child.document.getElementById('camera-settings-root');
      if (!root) return;
      child.document.documentElement.className = document.documentElement.className;
      child.document.body.className = 'camera-window';
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => child.document.head.appendChild(style.cloneNode(true)));
      setPortal(root);
    };
    child.addEventListener('load', prepare, { once: true });
    if (child.document.readyState === 'complete') prepare();
  }, []);
  const close = useCallback(() => { popup.current?.close(); popup.current = null; setPortal(null); }, []);
  useEffect(() => {
    if (!portal) return;
    const observer = new MutationObserver(() => {
      if (popup.current && !popup.current.closed) popup.current.document.documentElement.className = document.documentElement.className;
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const timer = window.setInterval(() => { if (popup.current?.closed) { popup.current = null; setPortal(null); } }, 200);
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [portal]);
  useEffect(() => () => popup.current?.close(), []);
  return { portal, open, close, error };
}
