import { useRef, useState } from 'react';
import { PanelsTopLeft } from 'lucide-react';

export default function OverlayButton() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!window.motiDesktop) return null;
  const open = async () => {
    if (pending.current) return;
    if (document.querySelector('dialog[open]')) { setError('열린 입력 창을 먼저 닫아 주세요.'); return; }
    pending.current = true; setBusy(true); setError('');
    try { await window.motiDesktop!.open(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '오버레이를 열지 못했습니다.'); }
    finally { pending.current = false; setBusy(false); }
  };
  // One item of the sidebar rail: icon with the name underneath.
  return <div className="w-[60px]">
    <button type="button" disabled={busy} onClick={() => { void open(); }} className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-muted transition-colors hover:bg-nav-active hover:text-heading disabled:opacity-50"><PanelsTopLeft size={20} /><span className="leading-tight">{busy ? '여는 중…' : '오버레이'}</span></button>
    {error && <p role="alert" className="mt-1 text-[10px] leading-tight text-danger">{error}</p>}
  </div>;
}
