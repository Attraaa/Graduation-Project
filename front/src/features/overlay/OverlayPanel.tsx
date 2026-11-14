import { useEffect, useState } from 'react';
import { ArrowLeft, GripHorizontal } from 'lucide-react';
import { commandAllowed, overlayTime, OVERLAY_MODES, type OverlayAction, type OverlayMode, type OverlayView } from './contract';

export default function OverlayPanel() {
  const [view, setView] = useState<OverlayView>({ snapshot: null, connected: false });
  const [pending, setPending] = useState<Partial<Record<OverlayMode, string>>>({});
  const [message, setMessage] = useState('');
  const snapshot = view.snapshot;
  const owner = snapshot?.owner;
  useEffect(() => {
    const bridge = window.motiOverlay;
    if (!bridge) return;
    let alive = true;
    const receive = (value: OverlayView) => { if (alive) setView(value); };
    const off = bridge.onState(receive);
    void bridge.state().then(receive).catch(() => { if (alive) setMessage('본창 연결을 확인해 주세요.'); });
    return () => { alive = false; off(); };
  }, []);
  useEffect(() => {
    if (snapshot) document.documentElement.classList.toggle('dark-theme', snapshot.theme === 'dark');
  }, [snapshot]);
  useEffect(() => { if (owner) void window.motiOverlay?.ready(); }, [owner]); // Initial state is rendered before the owner minimizes.
  const act = async (mode: OverlayMode, action: OverlayAction) => {
    if (!snapshot || !window.motiOverlay) return;
    const id = crypto.randomUUID();
    setPending(current => ({ ...current, [mode]: id })); setMessage('');
    try {
      const result = await window.motiOverlay.command({ id, owner: snapshot.owner, mode, run: snapshot[mode].run, action });
      if (!result.ok) setMessage(result.message ?? '본창에서 측정 상태를 확인해 주세요.');
    } catch { setMessage('본창 연결을 확인해 주세요.'); }
    finally { setPending(current => current[mode] === id ? { ...current, [mode]: undefined } : current); }
  };
  return <main className="overlay-panel bg-background text-heading">
    <header className="overlay-drag flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 font-extrabold"><GripHorizontal size={17} aria-hidden="true" />Moti</div>
      <button type="button" onClick={() => { void window.motiOverlay?.back(); }} className="overlay-no-drag inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2 text-xs font-bold"><ArrowLeft size={14} />돌아가기</button>
    </header>
    <div className="overlay-sections">
      {OVERLAY_MODES.map(mode => {
        const s = snapshot?.[mode];
        const paused = s?.paused ?? false;
        return <section key={mode} aria-label={`${mode === 'upper_body' ? '상체' : '키보드'} 오버레이`} className="overlay-session rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-2"><h1 className="text-sm font-extrabold">{mode === 'upper_body' ? '상체' : '키보드'}</h1><span aria-label="세션 활성 시간" className="text-sm font-bold tabular-nums">{overlayTime(s?.seconds ?? 0)}</span></div>
          <p role="status" title={s?.detail} className={`h-8 overflow-hidden text-xs leading-4 ${s?.error ? 'text-danger' : 'text-muted'}`}>{!view.connected ? '본창 연결 확인 필요' : s?.status}<br />{s?.detail}</p>
          <div role="group" aria-label={`${mode === 'upper_body' ? '상체' : '키보드'} 측정 제어`} className="grid grid-cols-3 gap-2">
            {(['start', paused ? 'resume' : 'pause', 'stop'] as const).map(action => <button key={action === 'resume' ? 'pause' : action} type="button"
              disabled={!s || !commandAllowed(s, action) || (action !== 'stop' && (!view.connected || !!pending[mode]))}
              onClick={() => { void act(mode, action); }}
              className={`h-10 rounded-lg border text-xs font-bold disabled:cursor-default disabled:opacity-40 ${action === 'start' ? 'border-primary-border bg-primary text-white' : action === 'stop' ? 'border-danger-border bg-danger text-white' : 'border-warning-border bg-warning text-warning-foreground'}`}>
              {action === 'start' ? '시작' : action === 'stop' ? '중지' : action === 'resume' ? '재개' : '일시정지'}
            </button>)}
          </div>
        </section>;
      })}
    </div>
    <p role="status" title={message} className="overlay-footer h-4 truncate text-xs text-danger">{message || (snapshot?.savingFailed ? '기록 저장 실패 · 돌아가서 저장을 재시도해 주세요.' : '')}</p>
  </main>;
}
