import { RotateCcw } from 'lucide-react';
import Metric from '../session/Metric';
import SessionFrame from '../session/SessionFrame';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import MonitoringPreview from '../session/MonitoringPreview';
import MonitoringNotice from '../session/MonitoringNotice';
import { useMonitoring } from '../session/monitoringContext';
import { keyboardSummary } from '../../../../database/keyboard';
import RecordingStatus from '../records/RecordingStatus';
import { fingerText, percentText, reasonText, scoreText } from './labels';
import { livePressScore } from './liveScore';

export default function KeyboardSession() {
  const { keyboard } = useMonitoring();
  const { controls, snapshot } = keyboard;
  const totals = keyboardSummary(snapshot.counts);
  return <SessionFrame modeId="keyboard" camera={keyboard.camera}
    subtitle="손가락 사용과 입력별 판정을 확인하세요."
    actions={<button type="button" disabled={!controls.isRunning || controls.isPaused} onClick={keyboard.remap} className="session-tool"><RotateCcw size={15} />위치 다시 잡기</button>}>
    <div className="session-workspace">
      <section className="session-camera" aria-label="키보드 카메라">
        <div className="session-panel-heading"><h2>키보드 카메라</h2><span>손가락 · 입력 판정</span></div>
        <MonitoringPreview modeId="keyboard" detailed />
        <div className="session-controlbar"><SessionStatus modeId="keyboard" detailed /><SessionActions modeId="keyboard" className="session-controls" /></div>
      </section>
      <aside className="session-insights" aria-label="키보드 실시간 지표">
        <div className="session-panel-heading"><h2>실시간 지표</h2><span>이번 세션</span></div>
        <div className="session-metrics">
          <Metric row label="현재 점수" value={scoreText(controls.isRunning ? livePressScore(snapshot.latest) : null)} detail={`세션 평균 ${scoreText(totals.score)}`} />
          <Metric row label="판정 가능 비율" value={percentText(totals.coverage)} detail={`보류 ${totals.unknown}회`} />
          <Metric row label="판정한 입력" value={`${totals.valid}회`} detail={`확인한 입력 ${snapshot.detectedPresses}회`} />
          <Metric row label="손가락 사용 일관성" value={percentText(totals.consistency)} detail="키·Shift 상황별" />
        </div>
        <div className="session-guidance"><h3>측정 안내</h3><MonitoringNotice modeId="keyboard" /></div>
      </aside>
    </div>
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <h2 className="p-4 font-bold text-heading">최근 입력</h2>
      {!snapshot.recent.length ? <p className="px-4 pb-4 text-sm text-muted">아직 입력이 없습니다</p> : <div className="overflow-x-auto"><table className="w-full min-w-[380px] table-fixed text-left text-sm">
        <thead className="bg-surface-muted text-xs text-muted"><tr><th className="w-1/4 px-4 py-3">입력 키</th><th className="w-1/3 px-4 py-3">감지 손가락</th><th className="px-4 py-3">판정</th></tr></thead>
        <tbody>{snapshot.recent.slice(0, 5).map(result => <tr key={result.id} className="border-t border-border text-heading"><td className="truncate px-4 py-3 font-bold">{result.pressedKey}</td><td className="truncate px-4 py-3">{result.observedFinger ? fingerText[result.observedFinger] : '—'}</td><td className="px-4 py-3"><p className={`truncate font-bold ${result.evaluation.verdict === 'unknown' ? 'text-muted' : result.evaluation.verdict === 'mismatch' ? 'text-danger' : 'text-mode-keyboard'}`}>{scoreText(livePressScore(result))}</p><p className="truncate text-xs text-muted" title={reasonText[result.evaluation.reason]}>{reasonText[result.evaluation.reason]}</p></td></tr>)}</tbody>
      </table></div>}
    </section>
    <RecordingStatus errorsOnly />
  </SessionFrame>;
}
