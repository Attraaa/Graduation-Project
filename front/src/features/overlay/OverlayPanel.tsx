import { useEffect, useState } from 'react';
import { ArrowUpRight, Pause, Play, Square } from 'lucide-react';
import motiIcon from '../../assets/moti-icon.svg';
import { commandAllowed, overlayTime, OVERLAY_MODES, type OverlayAction, type OverlayMode, type OverlaySession, type OverlayView } from './contract';

const ACTION_LABEL: Record<OverlayAction, string> = { start: '시작', pause: '일시정지', resume: '재개', stop: '중지' };
/** The state chip's color: observing, paused, failed, or not measuring (including a lost connection). */
const tone = (s: OverlaySession | undefined, connected: boolean) =>
  !connected || !s ? 'idle' : s.error ? 'error' : s.paused ? 'pause' : s.running ? 'run' : 'idle';

/** Mini bar: one row per mode with large numbers, a state chip, the active time, one start/pause button and stop. */
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
  const notice = message || (snapshot?.savingFailed ? '기록 저장 실패 · 돌아가서 재시도해 주세요.' : !view.connected ? '본창 연결 확인 필요' : '');
  // The whole bar moves the window; only the buttons are excluded (overlay.css).
  return <main className="overlay-panel overlay-drag text-heading">
    <header className="overlay-header">
      <div className="overlay-brand"><img src={motiIcon} alt="" />Moti</div>
      <p role="status" className="overlay-notice" title={notice}>{notice}</p>
      <span className={`overlay-connection ${view.connected ? 'connected' : ''}`} title={view.connected ? '본창과 연결됨' : '본창 연결 확인 필요'} />
      <button type="button" aria-label="돌아가기" title="돌아가기" onClick={() => { void window.motiOverlay?.back(); }} className="overlay-back"><ArrowUpRight size={14} /></button>
    </header>
    {OVERLAY_MODES.map(mode => {
      const s = snapshot?.[mode];
      const name = mode === 'upper_body' ? '상체' : '키보드';
      const primary: OverlayAction = !s?.running ? 'start' : s.paused ? 'resume' : 'pause';
      return <section key={mode} aria-label={`${name} 오버레이`} className={`overlay-row ${mode === 'upper_body' ? 'overlay-upper' : 'overlay-keyboard'}`}>
        <span aria-hidden="true" className="overlay-bar" />
        <div className="overlay-values" title={s?.detail}>
          {s?.metrics.length ? <>
            {s.metrics.map(metric => <span key={metric.label} className="overlay-metric"><small>{metric.label}</small><b className={metric.low ? 'low' : metric.value === '—' ? 'none' : ''}>{metric.value}</b></span>)}
            {s.note && <span className="overlay-note">{s.note}</span>}
          </> : <p className={s?.error ? 'overlay-detail text-danger' : 'overlay-detail'}>{s?.detail || '측정을 시작해 주세요'}</p>}
        </div>
        <div className="overlay-meta">
          <span role="status" className={`overlay-chip ${tone(s, view.connected)}`} title={!view.connected ? '본창 연결 확인 필요' : s?.status}><i />{!view.connected ? '연결 확인' : s?.status ?? '준비 중'}</span>
          <span className="overlay-time" aria-label="세션 활성 시간">{overlayTime(s?.seconds ?? 0)}</span>
        </div>
        <div role="group" aria-label={`${name} 측정 제어`} className="overlay-controls">
          {([primary, 'stop'] as const).map(action => <button key={action === 'stop' ? 'stop' : 'primary'} type="button" aria-label={`${name} ${ACTION_LABEL[action]}`} title={`${name} ${ACTION_LABEL[action]}`}
            disabled={!s || !commandAllowed(s, action) || (action !== 'stop' && (!view.connected || !!pending[mode]))}
            onClick={() => { void act(mode, action); }}
            className={`overlay-control overlay-control-${action}`}>
            {action === 'start' || action === 'resume' ? <Play size={14} /> : action === 'stop' ? <Square size={12} /> : <Pause size={14} />}
          </button>)}
        </div>
      </section>;
    })}
  </main>;
}
