import { RotateCcw } from 'lucide-react';
import Metric from '../session/Metric';
import SessionFrame from '../session/SessionFrame';
import SessionActions from '../session/SessionActions';
import SessionStatus from '../session/SessionStatus';
import MonitoringPreview from '../session/MonitoringPreview';
import LiveScoreChart from '../session/LiveScoreChart';
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
    actions={<>{controls.isRunning && <button type="button" disabled={controls.isPaused} onClick={keyboard.remap} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-heading disabled:opacity-50"><RotateCcw size={16} />위치 다시 잡기</button>}<SessionActions modeId="keyboard" /></>}>
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-heading">키보드 카메라</h2><SessionStatus modeId="keyboard" /></div>
      <div className="mx-auto w-full max-w-2xl"><MonitoringPreview modeId="keyboard" /></div>
      {controls.isRunning && !controls.isPaused && snapshot.message && snapshot.phase !== 'ready' && <p role={snapshot.phase === 'error' ? 'alert' : 'status'} className={`text-sm ${snapshot.phase === 'error' ? 'text-danger' : 'text-muted'}`}>{snapshot.message}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric compact label="현재 점수" value={scoreText(controls.isRunning ? livePressScore(snapshot.latest) : null)} detail={`세션 평균 ${scoreText(totals.score)}`} />
        <Metric compact label="판정 가능 비율" value={percentText(totals.coverage)} detail={`보류 ${totals.unknown}회`} />
        <Metric compact label="판정한 입력" value={`${totals.valid}회`} detail={`확인한 입력 ${snapshot.detectedPresses}회`} />
        <Metric compact label="손가락 사용 일관성" value={percentText(totals.consistency)} detail="키·Shift 상황별" />
      </div>
    </section>
    <LiveScoreChart points={keyboard.trend} keyboard />
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
