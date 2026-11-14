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
  return <div className="mb-2">
    <button type="button" disabled={busy} onClick={() => { void open(); }} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-2 text-sm font-bold text-heading disabled:opacity-50"><PanelsTopLeft size={17} />{busy ? '여는 중…' : '오버레이'}</button>
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
  </div>;
}
