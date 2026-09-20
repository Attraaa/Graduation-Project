import { useEffect, useRef, useState } from 'react';
import { Coffee, Play, RotateCcw, Square } from 'lucide-react';
import Button from '../../components/Button';
import Metric from '../session/Metric';
import SessionFrame from '../session/SessionFrame';
import { useSessionControls } from '../session/useSessionControls';
import EyeMonitor from './EyeMonitor';
import type { EyeUpdate } from './EyeMonitor';
import { emptyEyeSnapshot } from './measurement';
import { createBreakTimer } from './breakTimer';

const clock = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;
const initialUpdate = (): EyeUpdate => ({ measurement: emptyEyeSnapshot(), phase: 'loading', message: '카메라를 화면 위에 고정하고 얼굴 정면이 보이도록 앉아 주세요.' });

export default function EyeSession() {
  const controls = useSessionControls();
  const [update, setUpdate] = useState(initialUpdate);
  const [reference, setReference] = useState(0);
  const timer = useRef(createBreakTimer());
  const [rest, setRest] = useState(() => createBreakTimer().snapshot());
  const { isRunning, run, deviceId, elapsedSeconds } = controls;
  const { measurement: m } = update;
  const failed = update.phase === 'error';
  useEffect(() => {
    if (!isRunning || failed) return;
    const handle = window.setInterval(() => setRest(timer.current.tick(performance.now())), 250);
    return () => window.clearInterval(handle);
  }, [isRunning, run, failed]);
  const start = () => {
    timer.current = createBreakTimer();
    setRest(timer.current.tick(performance.now()));
    setUpdate(initialUpdate());
    controls.start();
  };
  const active = isRunning && !rest.resting && !failed;
  const observed = active && update.phase === 'observing';
  const status = !isRunning ? (elapsedSeconds ? '측정 종료' : '시작 대기') : failed ? '분석 오류 · 다시 시작해 주세요'
    : rest.resting ? '눈 쉬는 시간' : ({ loading: '모델 준비 중', calibrating: '거리 기준 수집', observing: '관찰 중', unavailable: '관찰 일시 불가', error: '분석 오류' }[update.phase]);
  return (
    <SessionFrame modeId="eye" controls={controls} subtitle="웹캠 한 대로 깜빡임을 관찰하고, 가까워짐과 눈 휴식을 안내합니다.">
      <section className="card-duo flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-live="polite"><p className="font-black text-heading">{status}</p>
            <p className="mt-1 text-sm text-muted">{!isRunning && elapsedSeconds ? '카메라를 해제했습니다. 아래 수치는 마지막 세션의 결과입니다.' : rest.resting && isRunning ? '화면에서 눈을 떼고 약 6m 이상 먼 곳을 편안하게 바라보세요.' : update.message}</p></div>
          <div className="flex flex-wrap gap-2">
            {isRunning && !failed && <Button variant="outline" disabled={!active || update.phase === 'loading'} onClick={() => setReference(value => value + 1)}>
              <RotateCcw size={16} className="mr-2 inline" />거리 기준만 다시 잡기
            </Button>}
            {isRunning && failed && <Button variant="outline" onClick={start}>분석 다시 시작</Button>}
            <Button variant={isRunning ? 'danger' : 'primary'} onClick={isRunning ? controls.stop : start}>
              {isRunning ? <Square size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}{isRunning ? '측정 중지' : '안구 모드 시작'}
            </Button>
          </div>
        </div>
        {active && !m.calibrated && <div className="rounded-xl bg-surface-muted p-3">
          <p className="mb-2 text-sm text-muted">편안한 거리에서 3초간 정면을 유지하세요. 자연스럽게 깜빡여도 됩니다. 움직임이 크면 수집을 다시 시작합니다.</p>
          <progress className="w-full accent-primary" aria-label="안구 거리 기준 수집" value={m.progress} max={1} />
        </div>}
        <EyeMonitor key={run} active={active} deviceId={deviceId} reference={reference} onUpdate={setUpdate} />
        {observed && (m.openReminder || m.nearReminder) && <div role="status" className="rounded-xl border-2 border-warning bg-surface-muted p-3 text-heading">
          {m.openReminder && <p>눈이 열린 상태가 15초간 이어졌습니다. 편안하게 눈을 깜빡여 보세요.</p>}
          {m.nearReminder && <p>기준보다 얼굴이 크게 보이는 상태가 이어집니다. 처음의 편안한 거리로 돌아가 보세요.</p>}
        </div>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric label="관찰한 깜빡임" value={m.calibrated || m.validMs > 0 ? `${m.blinks}회` : '—'} detail="양쪽 눈을 감았다 뜬 동작 · 기준 재수집 시 유지" />
          <Metric label="최근 깜빡임 빈도" value={m.recentBlinksPerMinute === null ? '—' : `${m.recentBlinksPerMinute.toFixed(1)}회/분`}
            detail={m.recentBlinksPerMinute === null ? `기준 수집 후 유효 관찰 ${Math.ceil(Math.max(0, 30000 - m.recentValidMs) / 1000)}초 더 필요` : `최근 유효 관찰 ${Math.round(m.recentValidMs / 1000)}초 기준 · 휴식·유실 제외`} />
          <Metric label="세션 전체 깜빡임 빈도" value={m.blinksPerMinute === null ? '—' : `${m.blinksPerMinute.toFixed(1)}회/분`} detail="누적 유효 관찰 시간 기준 · 건강 판정 아님" />
          <Metric label="기준 대비 얼굴 크기" value={observed && m.faceScale !== null ? `${Math.round(m.faceScale * 100)}%` : '—'} detail="100%가 시작 구도 · 실제 cm 거리 아님" />
          <Metric label="유효 관찰 시간" value={clock(m.validMs)} detail="얼굴 유실·휴식·기준 수집·긴 프레임 간격 제외" />
        </div>
        <div className="rounded-xl border border-border bg-surface-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-black text-heading">20–20–20 눈 휴식</p>
              <p className="mt-1 text-sm text-muted">20분마다 약 6m 이상 먼 곳을 20초 바라보기 · 완료 기록 {rest.completed}회</p>
              <p className="mt-2 font-bold text-heading" role="status">{!isRunning ? '시작하면 휴식 타이머가 켜집니다.' : failed ? '오류로 타이머를 중지했습니다.' : rest.resting ? rest.remainingMs > 0 ? `휴식 ${Math.ceil(rest.remainingMs / 1000)}초 남음` : '20초가 지났습니다. 복귀 버튼을 눌러 휴식을 완료해 주세요.' : rest.due ? '눈을 쉬어 줄 시간입니다.' : `다음 휴식까지 ${clock(rest.untilBreakMs)}`}</p>
            </div>
            <Button variant={rest.due || rest.resting ? 'primary' : 'outline'} disabled={!isRunning || failed}
              onClick={() => setRest(rest.resting ? timer.current.finish(performance.now()) : timer.current.start(performance.now()))}>
              <Coffee size={16} className="mr-2 inline" />{rest.resting ? rest.remainingMs > 0 ? '휴식 취소하고 복귀' : '휴식 완료하고 복귀' : '지금 20초 쉬기'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">휴식 중에는 카메라를 끕니다. 20초 이후 복귀 버튼을 누르면 본인 확인 기록으로 남습니다. 실제로 먼 곳을 봤는지는 판별하지 않습니다. 지금 쉬기 버튼으로 바로 시연할 수 있습니다.</p>
        </div>
        <p className="text-xs leading-relaxed text-muted">영상은 이 기기에서 처리하며 녹화·서버 전송하지 않습니다. 이번 세션 수치만 표시하며 종료 후 다른 화면으로 이동하면 보존되지 않습니다. 안경 반사·조명·카메라 성능에 따라 깜빡임을 놓칠 수 있습니다. 이 모드는 생활 습관 안내용이며 시력·안구건조증·질환 위험 점수를 측정하지 않습니다. 카메라 위치·줌이 바뀌면 거리 기준만 다시 잡으세요. 기존 횟수·유효 시간·휴식 기록은 유지되고 최근 빈도는 새로 수집합니다. 다른 사람이 측정할 때는 중지 후 새 세션을 시작하세요.</p>
      </section>
    </SessionFrame>
  );
}
