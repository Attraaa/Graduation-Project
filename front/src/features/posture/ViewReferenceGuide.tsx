import type { MonitorSnapshot } from './monitorTypes';

type Collecting = NonNullable<MonitorSnapshot['viewCalibration']>;

const hint = ({ reason, label }: Collecting) => reason === 'facing-front' ? `아직 정면 모니터를 보고 있습니다. ${label} 쪽으로 고개를 돌려 주세요.`
  : reason === 'body-turned' ? '몸통이 많이 돌아가 있습니다. 몸은 그대로 두고 고개만 돌려 주세요.'
    : reason === 'moving' || reason === 'interrupted' ? '자세를 잠시 그대로 유지해 주세요.'
      : reason === 'low-confidence' || reason === 'missing-landmarks' || reason === 'ears-too-close'
        ? '귀와 어깨가 잘 보이지 않습니다. 고개를 조금 덜 돌리거나 조명을 확인해 주세요.'
        : reason ? '얼굴과 양쪽 어깨가 카메라에 보이도록 자세를 유지해 주세요.' : null;

/** Side-monitor reference collection of the dual-monitor feature; presentation only. */
export default function ViewReferenceGuide({ collecting, onSkip }: { collecting: MonitorSnapshot['viewCalibration']; onSkip: () => void }) {
  if (!collecting) return null;
  const note = collecting.waiting ? null : hint(collecting);
  return <div aria-live="polite" className="rounded-xl bg-surface-muted p-3">
    <p className="mb-2 text-sm text-muted">{collecting.waiting
      ? `깜빡임 보정이 끝나면 ${collecting.label} 기준 자세를 모읍니다.`
      : `${collecting.index + 1}/${collecting.total} · ${collecting.label}를 보며 바른 자세를 잠시 유지해 주세요. 그 화면을 볼 때의 점수 기준이 됩니다.`}</p>
    {!collecting.waiting && <progress aria-label={`${collecting.label} 기준 자세 수집 진행률`} value={collecting.progress} max={1} className="h-2 w-full accent-primary" />}
    {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    <button type="button" onClick={onSkip} className="mt-2 min-h-9 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-bold text-heading">이 모니터 건너뛰기</button>
  </div>;
}
