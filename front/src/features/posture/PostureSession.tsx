import { useState } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import Button from '../../components/Button';
import PostureMonitor from '../../components/PostureMonitor';
import SessionFrame from '../session/SessionFrame';
import { useSessionControls } from '../session/useSessionControls';
import type { CalibrationReason } from './calibration';
import { createMonitorSnapshot } from './monitorTypes';
import { shoulderScorePolicy } from './modes/shoulder';
import { turtleScorePolicy } from './modes/turtle';
import PostureMetrics from './PostureMetrics';
import type { PostureMode } from './scoring';

const reasonText: Record<CalibrationReason, string> = {
  'invalid-frame': '카메라 화면을 준비하고 있습니다.',
  'missing-landmarks': '얼굴과 양쪽 어깨가 화면에 보이도록 앉아 주세요.',
  'low-confidence': '얼굴과 양쪽 어깨를 가리지 말고 조명을 확인해 주세요.',
  'out-of-frame': '얼굴과 양쪽 어깨를 화면 안에 맞춰 주세요.',
  'shoulders-too-close': '몸을 정면으로 향하고 상체가 보이도록 거리를 조절해 주세요.',
  moving: '움직임이 감지되어 기준 자세를 다시 수집합니다.',
  interrupted: '관측이 끊겼습니다. 화면과 카메라 연결을 확인해 주세요.',
  'camera-changed': '카메라 조건이 바뀌어 기준 자세를 다시 수집합니다.',
  'invalid-time': '관측 시각을 확인하고 있습니다.',
};

export default function PostureSession({ modeId }: { modeId: PostureMode }) {
  const controls = useSessionControls();
  const policy = modeId === 'turtle' ? turtleScorePolicy : shoulderScorePolicy;
  const [snapshot, setSnapshot] = useState(() => createMonitorSnapshot(policy));
  const { isRunning, elapsedSeconds, run, deviceId } = controls;
  const start = () => {
    setSnapshot(createMonitorSnapshot(policy));
    controls.start();
  };
  const stateLabel = !isRunning ? (elapsedSeconds ? '측정 종료' : '시작 대기') : {
    loading: '모델 준비 중', calibrating: '기준 자세 수집', observing: '기준 자세와 비교 중',
    unavailable: '관찰 일시 불가', error: '카메라·분석 오류',
  }[snapshot.phase];
  return (
    <SessionFrame modeId={modeId} controls={controls}
      subtitle={modeId === 'turtle' ? '기준 대비 코의 화면상 위치 변화를 비교합니다.' : '기준 대비 양어깨의 화면상 높이 차이를 비교합니다.'}>
      <section className="card-duo flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-live="polite">
            <p className="font-black text-heading">{stateLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {isRunning && snapshot.reason ? reasonText[snapshot.reason] : '카메라 위치가 바뀌면 기준 자세를 다시 잡아 주세요.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isRunning && <Button variant="outline" onClick={start}><RotateCcw size={16} className="mr-2 inline" />기준 다시 잡기</Button>}
            <Button variant={isRunning ? 'danger' : 'primary'} onClick={isRunning ? controls.stop : start}>
              {isRunning ? <Square size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}
              {isRunning ? '측정 중지' : '기준 자세 잡고 시작'}
            </Button>
          </div>
        </div>
        {isRunning && snapshot.phase === 'calibrating' && (
          <div className="rounded-xl bg-surface-muted p-4">
            <p className="mb-2 text-sm font-bold text-heading">정면을 보고 편안한 기준 자세를 잠시 유지해 주세요.</p>
            <progress aria-label="기준 자세 수집 진행률" value={snapshot.progress} max={1} className="h-3 w-full accent-primary" />
            <p className="mt-2 text-xs text-muted">현재 자세의 비교 기준을 수집합니다. 올바른 자세 여부를 자동으로 확정하지 않습니다.</p>
          </div>
        )}
        <div className="flex h-[min(48vh,440px)] min-h-[260px]">
          <PostureMonitor key={run} isRunning={isRunning} deviceId={deviceId} policy={policy} onUpdate={setSnapshot} />
        </div>
        <PostureMetrics snapshot={snapshot} elapsedSeconds={elapsedSeconds} isRunning={isRunning} />
      </section>
    </SessionFrame>
  );
}
