import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Keyboard, Pause, Play, Square } from 'lucide-react';
import motiIcon from '../../assets/moti-icon.svg';
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
  return <main className="overlay-panel text-heading">
    <header className="overlay-drag overlay-header">
      <div className="overlay-brand"><img src={motiIcon} alt="" />Moti<span>모니터링</span></div>
      <span className="overlay-connection"><i className={view.connected ? 'connected' : ''} />{view.connected ? '연결됨' : '연결 확인'}</span>
    </header>
    <div className="overlay-sections">
      {OVERLAY_MODES.map(mode => {
        const s = snapshot?.[mode];
        const paused = s?.paused ?? false;
        const name = mode === 'upper_body' ? '상체' : '키보드';
        return <section key={mode} aria-label={`${name} 오버레이`} className={`overlay-session ${mode === 'upper_body' ? 'overlay-upper' : 'overlay-keyboard'}`}>
          <div className="overlay-session-top">
            <div className="overlay-mode"><span className="overlay-mode-icon">{mode === 'upper_body' ? <Activity size={17} /> : <Keyboard size={17} />}</span><div><h1>{name}</h1><p role="status" title={!view.connected ? '본창 연결 확인 필요' : s?.status} className={s?.error ? 'text-danger' : ''}>{!view.connected ? '본창 연결 확인 필요' : s?.status}</p></div></div>
            <div role="group" aria-label={`${name} 측정 제어`} className="overlay-controls">
            {(['start', paused ? 'resume' : 'pause', 'stop'] as const).map(action => {
              const label = action === 'start' ? '시작' : action === 'stop' ? '중지' : action === 'resume' ? '재개' : '일시정지';
              return <button key={action === 'resume' ? 'pause' : action} type="button" aria-label={`${name} ${label}`} title={`${name} ${label}`}
              disabled={!s || !commandAllowed(s, action) || (action !== 'stop' && (!view.connected || !!pending[mode]))}
              onClick={() => { void act(mode, action); }}
              className={`overlay-control overlay-control-${action}`}>
              {action === 'start' || action === 'resume' ? <Play size={14} /> : action === 'stop' ? <Square size={13} /> : <Pause size={14} />}
            </button>; })}
            </div>
          </div>
          <div className="overlay-session-bottom"><p title={s?.detail}>{s?.detail || '측정을 시작해 주세요'}</p><span aria-label="세션 활성 시간">{overlayTime(s?.seconds ?? 0)}</span></div>
        </section>;
      })}
    </div>
    <footer className="overlay-footer">
      <p role="status" title={message || (snapshot?.savingFailed ? '기록 저장 실패 · 돌아가서 저장을 재시도해 주세요.' : '')}>{message || (snapshot?.savingFailed ? '기록 저장 실패 · 돌아가서 재시도해 주세요.' : '')}</p>
      <button type="button" onClick={() => { void window.motiOverlay?.back(); }} className="overlay-back"><span>돌아가기</span><ArrowUpRight size={15} /></button>
    </footer>
  </main>;
}
