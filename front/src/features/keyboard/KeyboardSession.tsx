import { useState } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import Button from '../../components/Button';
import KeyboardMonitor from '../../components/KeyboardMonitor';
import Metric from '../session/Metric';
import SessionFrame from '../session/SessionFrame';
import { useSessionControls } from '../session/useSessionControls';
import { initialKeyboardSnapshot } from './monitorTypes';
import type { KeyboardMonitorSnapshot } from './monitorTypes';
import type { FingerId, FingerVerdict } from './types';

const formatTime = (seconds: number) =>
  String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
const fingerText: Record<FingerId, string> = {
  'left:thumb': '왼손 엄지', 'left:index': '왼손 검지', 'left:middle': '왼손 중지',
  'left:ring': '왼손 약지', 'left:pinky': '왼손 새끼',
  'right:thumb': '오른손 엄지', 'right:index': '오른손 검지', 'right:middle': '오른손 중지',
  'right:ring': '오른손 약지', 'right:pinky': '오른손 새끼',
};
const verdictText: Record<FingerVerdict, string> = {
  preferred: '권장 손가락', acceptable: '허용 손가락', mismatch: '다른 손가락', unknown: '판정 보류',
};
const verdictClass: Record<FingerVerdict, string> = {
  preferred: 'text-green-700', acceptable: 'text-sky-700', mismatch: 'text-red-700', unknown: 'text-muted',
};

export default function KeyboardSession() {
  const controls = useSessionControls();
  const { isRunning, elapsedSeconds, deviceId } = controls;
  const [snapshot, setSnapshot] = useState<KeyboardMonitorSnapshot>(initialKeyboardSnapshot);
  const [remapRequest, setRemapRequest] = useState(0);
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
      subtitle="카메라로 키보드와 손가락을 보고, 이 화면에서 누른 키의 권장 손가락 여부를 확인합니다."
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
            <Button variant={isRunning ? 'danger' : 'primary'} onClick={isRunning ? controls.stop : start}>
              {isRunning ? <Square size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}
              {isRunning ? '측정 중지' : '카메라 연결하고 시작'}
            </Button>
          </div>
        </div>

        <div className="flex h-[min(48vh,440px)] min-h-[260px]">
          <KeyboardMonitor
            isRunning={isRunning}
            deviceId={deviceId}
            remapRequest={remapRequest}
            onUpdate={setSnapshot}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="세션 시간" value={formatTime(elapsedSeconds)} detail="카메라 연결 시간 포함" />
          <Metric label="확인한 입력" value={String(snapshot.detectedPresses)} detail="현재 화면에서 감지한 keydown" />
          <Metric label="최근 입력" value={latestPress?.pressedKey ?? '—'} detail={latestPress?.code ?? '아직 입력 없음'} />
          <Metric
            label="감지 손가락·판정"
            value={latestPress?.observedFinger ? fingerText[latestPress.observedFinger] : '—'}
            detail={latestPress ? verdictText[latestPress.evaluation.verdict] : '아직 판정 없음'}
          />
        </div>
        <KeyboardPressList snapshot={snapshot} />
        <p className="text-xs leading-relaxed text-muted">
          판정은 임시 ANSI QWERTY 권장 손가락표와 보수적인 신뢰도 기준을 사용합니다. 불확실하거나 서로 가까운 후보는 오답 대신 판정 보류로 표시합니다.
          현재 결과는 이 화면에서만 확인하며 저장하거나 외부 서버로 전송하지 않습니다.
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
              <td className={`p-3 font-bold ${verdictClass[result.evaluation.verdict]}`}>{verdictText[result.evaluation.verdict]}</td>
              <td className="p-3">{result.evaluation.preferred.map(id => fingerText[id]).join(' 또는 ') || '정책 없음'}</td>
              <td className="p-3">{result.frameDeltaMs === null ? '—' : `${Math.abs(result.frameDeltaMs).toFixed(0)}ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
