import { useEffect, useState } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import Button from '../../components/Button';
import KeyboardMonitor from '../../components/KeyboardMonitor';
import Metric from '../session/Metric';
import SessionFrame from '../session/SessionFrame';
import { useSessionControls } from '../session/useSessionControls';
import { initialKeyboardSnapshot } from './monitorTypes';
import type { KeyboardMonitorSnapshot } from './monitorTypes';
import type { FingerVerdict } from './types';
import { keyboardSummary } from '../../../../database/keyboard';
import RecordingStatus from '../records/RecordingStatus';
import { fingerText, percentText, reasonText, scoreText } from './labels';

const formatTime = (seconds: number) =>
  String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
const verdictText: Record<FingerVerdict, string> = {
  preferred: '기본표 일치 · 100점', acceptable: '허용 손가락 · 100점', nearby: '인접 손가락 · 70점', mismatch: '다른 손가락 · 0점', unknown: '판정 보류',
};
const verdictClass: Record<FingerVerdict, string> = {
  preferred: 'text-green-700', acceptable: 'text-sky-700', nearby: 'text-amber-700', mismatch: 'text-red-700', unknown: 'text-muted',
};

export default function KeyboardSession() {
  const controls = useSessionControls();
  const { isRunning, elapsedSeconds, deviceId } = controls;
  const [snapshot, setSnapshot] = useState<KeyboardMonitorSnapshot>(initialKeyboardSnapshot);
  const [remapRequest, setRemapRequest] = useState(0);
  const [external, setExternal] = useState(false);
  const stop = () => { controls.stop(); setSnapshot(value => ({ ...value, latest: null, recent: [] })); };
  useEffect(() => {
    window.addEventListener('moti-stop-measurement', stop);
    return () => window.removeEventListener('moti-stop-measurement', stop);
  });
  const totals = keyboardSummary(snapshot.counts);
  const start = () => {
    setSnapshot(initialKeyboardSnapshot);
    controls.start();
  };
  const stateLabel = !isRunning ? (elapsedSeconds ? '측정 종료' : '시작 대기') : {
    idle: '시작 대기', starting: '분석기 준비 중', mapping: '키보드 위치 인식 중',
    ready: '실시간 입력 확인 중', error: '카메라·분석 오류',
  }[snapshot.phase];
  const latestPress = snapshot.latest;

  return (
    <SessionFrame
      modeId="keyboard"
      subtitle="카메라로 손가락 사용을 관찰하고 날짜·키별 집계로 연습 변화를 확인합니다."
      controls={controls}
    >
      <section className="card-duo flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-live="polite">
            <p className="font-black text-heading">{stateLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {snapshot.message ?? '키보드 전체가 보이도록 카메라를 고정해 주세요.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isRunning && (
              <Button variant="outline" onClick={() => setRemapRequest(value => value + 1)}>
                <RotateCcw size={16} className="mr-2 inline" />키보드 위치 다시 잡기
              </Button>
            )}
            <Button variant={isRunning ? 'danger' : 'primary'} onClick={isRunning ? stop : start}>
              {isRunning ? <Square size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}
              {isRunning ? '측정 중지' : '카메라 연결하고 시작'}
            </Button>
          </div>
        </div>
        <label className="text-sm font-bold text-heading"><input type="checkbox" checked={external} disabled={isRunning} onChange={event => setExternal(event.target.checked)} className="mr-2" />승인한 일반 앱도 관찰 · 설정에서 앱을 먼저 승인하세요</label>
        {isRunning && external && <p role="status" className="text-sm text-muted">외부 관찰: {{ off: '준비 중', observing: '승인 앱 관찰 중', excluded: '대기 · 현재 앱 제외 (Moti 화면에서는 연습 가능)', error: '관찰 중지' }[snapshot.observationStatus]}</p>}

        <div className="flex h-[min(48vh,440px)] min-h-[260px]">
          <KeyboardMonitor
            isRunning={isRunning}
            deviceId={deviceId}
            remapRequest={remapRequest}
            onUpdate={setSnapshot}
            external={external}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="세션 시간" value={formatTime(elapsedSeconds)} detail="카메라 연결 시간 포함" />
          <Metric label="확인한 입력" value={String(snapshot.detectedPresses)} detail="자동 반복 입력 제외" />
          <Metric label="최근 입력" value={latestPress?.pressedKey ?? '—'} detail={latestPress?.code ?? '아직 입력 없음'} />
          <Metric
            label="감지 손가락·판정"
            value={latestPress?.observedFinger ? fingerText[latestPress.observedFinger] : '—'}
            detail={latestPress ? verdictText[latestPress.evaluation.verdict] : '아직 판정 없음'}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="훈련 점수" value={scoreText(totals.score)} detail={`판정 가능한 ${totals.valid}회 기준 · 100/70/0`} />
          <Metric label="기본표 일치율" value={percentText(totals.agreement)} detail="허용 대안 포함 · 점수와 별도" />
          <Metric label="판정 가능 비율" value={percentText(totals.coverage)} detail={`보류 ${totals.unknown}회 · 미지원/단축키 ${totals.unsupported}회 별도`} />
          <Metric label="손가락 사용 일관성" value={percentText(totals.consistency)} detail="키·Shift 상황별 10회 이상 · 가산점 없음" />
        </div>
        <RecordingStatus />
        <KeyboardPressList snapshot={snapshot} />
        <p className="text-xs leading-relaxed text-muted">
          판정은 임시 ANSI QWERTY 권장 손가락표와 보수적인 신뢰도 기준을 사용합니다. 불확실하거나 서로 가까운 후보는 오답 대신 판정 보류로 표시합니다.
          70점은 검증 전의 훈련 가중치이며, 반대 손과 엄지는 인접 손가락으로 처리하지 않습니다.
          원문·입력 순서·영상은 저장하지 않고 키·손가락·판정 횟수만 서버에 저장합니다.
        </p>
      </section>
    </SessionFrame>
  );
}

function KeyboardPressList({ snapshot }: { snapshot: KeyboardMonitorSnapshot }) {
  if (!snapshot.recent.length) {
    return <div className="rounded-xl border border-border bg-surface-muted p-4 text-sm text-muted">키보드 위치 인식이 끝나면 이 화면에서 키를 눌러 실시간 결과를 확인할 수 있습니다.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="bg-surface-muted text-xs text-muted">
          <tr><th className="p-3">입력 키</th><th className="p-3">감지 손가락</th><th className="p-3">판정</th><th className="p-3">권장 손가락</th><th className="p-3">프레임 차이</th></tr>
        </thead>
        <tbody>
          {snapshot.recent.map(result => (
            <tr key={result.id} className="border-t border-border text-heading">
              <td className="p-3 font-black">{result.pressedKey} <span className="font-normal text-muted">({result.code})</span></td>
              <td className="p-3">{result.observedFinger ? fingerText[result.observedFinger] : '감지 불확실'}</td>
              <td className={`p-3 font-bold ${verdictClass[result.evaluation.verdict]}`}>{verdictText[result.evaluation.verdict]}<span className="block text-xs font-normal">{reasonText[result.evaluation.reason]}</span></td>
              <td className="p-3">{result.evaluation.preferred.map(id => fingerText[id]).join(' 또는 ') || '정책 없음'}</td>
              <td className="p-3">{result.frameDeltaMs === null ? '—' : `${Math.abs(result.frameDeltaMs).toFixed(0)}ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
