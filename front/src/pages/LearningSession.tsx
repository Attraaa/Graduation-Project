import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, RotateCcw, Square } from 'lucide-react';
import Button from '../components/Button';
import KeyboardMonitor from '../components/KeyboardMonitor';
import PostureMonitor from '../components/PostureMonitor';
import type { MonitorSnapshot } from '../components/PostureMonitor';
import { getLearningMode } from '../data/modes';
import { initialKeyboardSnapshot } from '../features/keyboard/monitorTypes';
import type { KeyboardMonitorSnapshot } from '../features/keyboard/monitorTypes';
import type { FingerId, FingerVerdict } from '../features/keyboard/types';
import type { CalibrationReason } from '../features/posture/calibration';

const initialSnapshot: MonitorSnapshot = {
  phase: 'loading', progress: 0, reason: null, observedSeconds: 0, delta: null,
};
const reasonText: Record<CalibrationReason, string> = {
  'invalid-frame': '카메라 화면을 준비하고 있습니다.',
  'missing-landmarks': '얼굴과 양쪽 어깨가 화면에 보이도록 앉아 주세요.',
  'low-confidence': '얼굴과 양쪽 어깨를 가리지 말고 조명을 확인해 주세요.',
  'out-of-frame': '얼굴과 양쪽 어깨를 화면 안에 맞춰 주세요.',
  'shoulders-too-close': '몸을 정면으로 향하고 상체가 보이도록 거리를 조절해 주세요.',
  moving: '움직임이 감지되어 기준 자세를 다시 수집합니다.',
  interrupted: '관측이 끊겨 기준 자세를 다시 수집합니다.',
  'camera-changed': '카메라 조건이 바뀌어 기준 자세를 다시 수집합니다.',
  'invalid-time': '관측 시각을 확인하고 다시 수집합니다.',
};
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

function SessionContent({ modeId }: { modeId: string }) {
  const navigate = useNavigate();
  const mode = getLearningMode(modeId);
  const keyboardMode = mode.id === 'keyboard';
  const postureMode = mode.id === 'turtle' || mode.id === 'shoulder';
  const supported = postureMode || keyboardMode;
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [keyboardSnapshot, setKeyboardSnapshot] = useState<KeyboardMonitorSnapshot>(initialKeyboardSnapshot);
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [run, setRun] = useState(0);
  const [keyboardRemapRequest, setKeyboardRemapRequest] = useState(0);

  useEffect(() => {
    let active = true;
    const media = navigator.mediaDevices;
    if (!media) return;
    const refresh = () => void media.enumerateDevices()
      .then(list => { if (active) setDevices(list.filter(device => device.kind === 'videoinput')); })
      .catch(() => { /* Starting the camera presents the actionable permission/device error. */ });
    refresh();
    media.addEventListener('devicechange', refresh);
    return () => { active = false; media.removeEventListener('devicechange', refresh); };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning, run]);

  const start = () => {
    setElapsed(0);
    setSnapshot(initialSnapshot);
    setKeyboardSnapshot(initialKeyboardSnapshot);
    setRun(value => value + 1);
    setIsRunning(true);
  };
  const stateLabel = !isRunning ? (elapsed ? '측정 종료' : '시작 대기') : keyboardMode ? {
    idle: '시작 대기', starting: '분석기 준비 중', mapping: '키보드 위치 인식 중',
    ready: '실시간 입력 확인 중', error: '카메라·분석 오류',
  }[keyboardSnapshot.phase] : {
    loading: '모델 준비 중', calibrating: '기준 자세 수집', observing: '기준 자세와 비교 중',
    unavailable: '관찰 일시 불가', error: '카메라·분석 오류',
  }[snapshot.phase];
  const delta = snapshot.delta;
  const largestChange = delta ? Math.max(...Object.values(delta).map(Math.abs)) * 100 : null;
  const latestPress = keyboardSnapshot.latest;

  return (
    <div className="flex min-h-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/dashboard')} className="mb-3 flex items-center gap-1 text-sm font-bold text-muted">
            <ArrowLeft size={17} /> 대시보드
          </button>
          <h1 className="text-2xl font-black text-heading">{mode.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {keyboardMode
              ? '카메라로 키보드와 손가락을 보고, 이 화면에서 누른 키의 권장 손가락 여부를 확인합니다.'
              : '매번 기준 자세를 새로 잡고, 변화와 관찰 시간을 확인합니다.'}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">
          사용할 카메라
          <select value={deviceId} disabled={isRunning} onChange={event => setDeviceId(event.target.value)}
            className="max-w-64 rounded-xl border-2 border-border bg-surface p-2 text-heading disabled:opacity-60">
            <option value="">기본 카메라</option>
            {devices.filter(device => device.deviceId).map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || '카메라 ' + (index + 1)}</option>
            ))}
          </select>
        </label>
      </header>

      {!supported && (
        <div className="rounded-2xl border-2 border-border bg-surface p-5 text-muted">
          안구 전용 분석은 아직 연결되지 않았습니다.
        </div>
      )}

      <section className="card-duo flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-live="polite">
            <p className="font-black text-heading">{stateLabel}</p>
            <p className="mt-1 text-sm text-muted">
              {keyboardMode
                ? (keyboardSnapshot.message ?? '키보드 전체가 보이도록 카메라를 고정해 주세요.')
                : (isRunning && snapshot.reason ? reasonText[snapshot.reason] : '카메라 위치가 바뀌면 중지한 뒤 기준 자세를 다시 잡아 주세요.')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isRunning && (
              <Button variant="outline" onClick={keyboardMode
                ? () => setKeyboardRemapRequest(value => value + 1)
                : start}>
                <RotateCcw size={16} className="mr-2 inline" />{keyboardMode ? '키보드 위치 다시 잡기' : '기준 다시 잡기'}
              </Button>
            )}
            <Button disabled={!supported} variant={isRunning ? 'danger' : 'primary'} onClick={isRunning ? () => setIsRunning(false) : start}>
              {isRunning ? <Square size={16} className="mr-2 inline" /> : <Play size={16} className="mr-2 inline" />}
              {isRunning ? '측정 중지' : (keyboardMode ? '카메라 연결하고 시작' : '기준 자세 잡고 시작')}
            </Button>
          </div>
        </div>

        {postureMode && isRunning && snapshot.phase === 'calibrating' && (
          <div className="rounded-xl bg-surface-muted p-4">
            <p className="mb-2 text-sm font-bold text-heading">정면을 보고 편안한 기준 자세를 잠시 유지해 주세요.</p>
            <progress aria-label="기준 자세 수집 진행률" value={snapshot.progress} max={1} className="h-3 w-full accent-primary" />
            <p className="mt-2 text-xs text-muted">현재 자세의 비교 기준을 수집합니다. 올바른 자세 여부를 자동으로 확정하지 않습니다.</p>
          </div>
        )}

        <div className="flex h-[min(48vh,440px)] min-h-[260px]">
          {keyboardMode ? (
            <KeyboardMonitor
              isRunning={isRunning}
              deviceId={deviceId}
              remapRequest={keyboardRemapRequest}
              onUpdate={setKeyboardSnapshot}
            />
          ) : (
            <PostureMonitor key={run} isRunning={isRunning && postureMode} deviceId={deviceId} onUpdate={setSnapshot} />
          )}
        </div>

        {keyboardMode ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="세션 시간" value={formatTime(elapsed)} detail="카메라 연결 시간 포함" />
              <Metric label="확인한 입력" value={String(keyboardSnapshot.detectedPresses)} detail="현재 화면에서 감지한 keydown" />
              <Metric label="최근 입력" value={latestPress?.pressedKey ?? '—'} detail={latestPress?.code ?? '아직 입력 없음'} />
              <Metric
                label="감지 손가락·판정"
                value={latestPress?.observedFinger ? fingerText[latestPress.observedFinger] : '—'}
                detail={latestPress ? verdictText[latestPress.evaluation.verdict] : '아직 판정 없음'}
              />
            </div>
            <KeyboardPressList snapshot={keyboardSnapshot} />
            <p className="text-xs leading-relaxed text-muted">
              판정은 임시 ANSI QWERTY 권장 손가락표와 보수적인 신뢰도 기준을 사용합니다. 불확실하거나 서로 가까운 후보는 오답 대신 판정 보류로 표시합니다.
              현재 결과는 이 화면에서만 확인하며 저장하거나 외부 서버로 전송하지 않습니다.
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="세션 시간" value={formatTime(elapsed)} detail="기준 자세 수집 시간 포함" />
              <Metric label="유효 관찰 시간" value={formatTime(snapshot.observedSeconds)} detail="기준 확보 후 판별 가능한 시간" />
              <Metric label="기준 대비 변화" value={largestChange === null ? '—' : largestChange.toFixed(1) + '%'} detail="어깨 너비 대비 화면상 변화" />
              <Metric label="자세 점수" value="—" detail="점수 산정 기준 검증 후 제공" />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              기준 대비 변화는 얼굴 위치·어깨 높이의 화면상 변화량이며 목의 실제 전방 각도가 아닙니다.
              현재 세션의 관찰값은 화면에서 확인하며 서버 저장 연결은 준비 중입니다.
            </p>
          </>
        )}
      </section>
    </div>
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

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-heading">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

export default function LearningSession() {
  const { modeId } = useParams();
  // Changing mode discards the old camera session and its reference posture.
  const mode = getLearningMode(modeId);
  return <SessionContent key={mode.id} modeId={mode.id} />;
}
