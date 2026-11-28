import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Pause, Play, Square } from 'lucide-react';
import RateGauge from '../session/RateGauge';
import { modeName } from '../session/modes';
import { commandAllowed, overlayTime, visibleOverlayModes, type OverlayAction, type OverlayMode, type OverlayView } from './contract';

const ACTION_LABEL = { pause: '일시정지', resume: '재개', stop: '중지' };

function BackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="overlay-back" title="본창으로 돌아가기">
    돌아가기 <ArrowUpRight size={13} aria-hidden="true" />
  </button>;
}

/**
 * One row per mode with score rings, status, active time and measurement controls.
 * A stop that runs closes this window: the main window comes back and shows the result (MonitoringDesktopBridge).
 */
export default function OverlayPanel() {
  const [view, setView] = useState<OverlayView>({ snapshot: null, connected: false });
  const [pending, setPending] = useState<Partial<Record<OverlayMode, { id: string; action: OverlayAction }>>>({});
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
  const act = async (mode: OverlayMode, action: keyof typeof ACTION_LABEL) => {
    if (!snapshot || !window.motiOverlay) return;
    const id = crypto.randomUUID();
    setPending(current => ({ ...current, [mode]: { id, action } })); setMessage('');
    try {
      const result = await window.motiOverlay.command({ id, owner: snapshot.owner, mode, run: snapshot[mode].run, action });
      if (!result.ok) setMessage(result.message ?? '본창에서 측정 상태를 확인해 주세요.');
    } catch { setMessage('본창 연결을 확인해 주세요.'); }
    finally { setPending(current => current[mode]?.id === id ? { ...current, [mode]: undefined } : current); }
  };
  const stopPending = Object.values(pending).some(command => command?.action === 'stop');
  const notice = message || (snapshot?.savingFailed ? '기록 저장에 실패했어요. 본창에서 다시 시도해 주세요.' : !view.connected ? '본창 연결을 확인해 주세요.' : '');
  const visible = visibleOverlayModes(snapshot);
  const back = () => { void window.motiOverlay?.back().catch(() => setMessage('본창 연결을 확인해 주세요.')); };
  return (
    <main className="overlay-panel overlay-drag text-heading">
      {!visible.length && <div className="overlay-empty">
        <p>{view.connected ? '측정 중인 모드가 없어요.' : '측정 정보를 기다리고 있어요.'}</p>
        <BackButton onClick={back} />
      </div>}
      {snapshot && visible.map((mode, index) => {
        const s = snapshot[mode];
        const name = modeName(mode);
        const primary = s.paused ? 'resume' : 'pause';
        const tone = !view.connected ? 'idle' : s.error ? 'error' : s.paused ? 'pause' : 'run';
        return <section key={mode} aria-label={`${name} 오버레이`} className={`overlay-row ${mode === 'upper_body' ? 'overlay-upper' : 'overlay-keyboard'}`}>
          <header className="overlay-row-header">
            <h2 className="overlay-mode">{name}</h2>
            <span role="status" className={`overlay-chip ${tone}`}>{!view.connected ? '연결 확인' : s.status}</span>
            <span className="overlay-time" aria-label="세션 활성 시간">{overlayTime(s.seconds)}</span>
            {index === 0 && <BackButton onClick={back} />}
          </header>
          <div className="overlay-row-body">
            <div className="overlay-values" title={s.detail}>
              {s.metrics.length ? s.metrics.map(metric => {
                const value = Math.min(100, Math.max(0, Number(metric.value) || 0));
                const ringStyle = { '--overlay-score': `${value}%` } as CSSProperties;
                const label = metric.label === '목' ? '목 점수' : metric.label === '균형' ? '좌우 균형' : '훈련 점수';
                return <div key={metric.label} className={`overlay-metric${metric.low ? ' low' : ''}`}>
                  <b className={`overlay-score${metric.value === '—' ? ' none' : ''}`} style={ringStyle}>{metric.value}</b>
                  <small>{label}</small>
                </div>;
              }) : <p className={`overlay-detail${s.error ? ' text-danger' : ''}`}>{s.detail}</p>}
              {mode === 'upper_body' && <RateGauge compact label="깜빡임 빈도" value={snapshot.upper_body.blinkRate} />}
              {s.note && <p className="overlay-note">{s.note}</p>}
            </div>
            <div role="group" aria-label={`${name} 측정 제어`} className="overlay-controls">
              {([primary, 'stop'] as const).map(action => <button key={action === 'stop' ? 'stop' : 'primary'} type="button" aria-label={`${name} ${ACTION_LABEL[action]}`} title={`${name} ${ACTION_LABEL[action]}`}
                disabled={!commandAllowed(s, action) || stopPending || (action !== 'stop' && (!view.connected || !!pending[mode]))}
                onClick={() => { void act(mode, action); }} className={`overlay-control overlay-control-${action}`}>
                {action === 'resume' ? <Play size={14} /> : action === 'stop' ? <Square size={12} /> : <Pause size={14} />}
              </button>)}
            </div>
          </div>
        </section>;
      })}
      {notice && <p role="status" className="overlay-notice">{notice}</p>}
    </main>
  );
}
