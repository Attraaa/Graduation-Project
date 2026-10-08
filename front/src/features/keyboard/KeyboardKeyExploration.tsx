import { useMemo, useState } from 'react';
import { Hand, Keyboard } from 'lucide-react';
import type { KeyboardCount } from '../../../../database/keyboard';
import { contextText, fingerText, percentText, reasonText, scoreText } from './labels';
import { exploreKeys, keyboardRows, keyLabel, keyRuleFor } from './keyExploration';
import type { ExploredKey } from './keyExploration';
import './keyboardRecords.css';

export default function KeyboardKeyExploration({ counts, nearbyCredit, policyVersion, selectedKey, onSelect }: {
  counts: KeyboardCount[]; nearbyCredit: number; policyVersion: string; selectedKey: string; onSelect: (code: string) => void;
}) {
  const [metric, setMetric] = useState<'score' | 'count'>('score');
  const keys = useMemo(() => exploreKeys(counts, nearbyCredit), [counts, nearbyCredit]);
  const byKey = new Map(keys.map(key => [key.code, key]));
  const extraKeys = keys.filter(key => !keyboardRows.flat().includes(key.code));
  const maximum = Math.max(1, ...keys.map(key => key.total));
  const keyButton = (code: string) => {
    const key = byKey.get(code);
    const score = key?.score ?? null, count = key?.total ?? 0;
    const band = metric === 'count' ? count ? 'frequency' : 'empty' : score === null ? 'empty' : score === 100 ? 'high' : score >= 70 ? 'middle' : 'low';
    return <button key={code} type="button" aria-label={`${keyLabel(code)} 키, ${scoreText(score)}, 입력 ${count}회`}
      aria-pressed={selectedKey === code} onClick={() => onSelect(code)} className="keyboard-record-key" data-band={band}
      style={band === 'frequency' ? { backgroundColor: `color-mix(in srgb, var(--color-mode-keyboard) ${Math.round(12 + 46 * count / maximum)}%, var(--color-surface))` } : undefined}>
      <strong>{keyLabel(code)}</strong><span>{metric === 'score' ? score === null ? '—' : score.toFixed(0) : count}<small>{metric === 'score' ? score === null ? '' : '점' : '회'}</small></span>
    </button>;
  };
  return <div className="keyboard-record-exploration">
    <section className="keyboard-record-card min-w-0" aria-label="키별 히트맵">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-heading"><Keyboard size={18} className="text-mode-keyboard" />키별 히트맵</h2>
        <div className="flex rounded-lg bg-surface-muted p-1" aria-label="히트맵 표시 기준">
          {([{ id: 'score', label: '훈련 점수' }, { id: 'count', label: '입력 횟수' }] as const).map(option => <button type="button" key={option.id}
            aria-pressed={metric === option.id} onClick={() => setMetric(option.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${metric === option.id ? 'bg-surface text-heading shadow-sm' : 'text-muted hover:text-heading'}`}>{option.label}</button>)}
        </div>
      </div>
      <div className="keyboard-record-keys">{keyboardRows.map((row, index) => <div key={index} className="keyboard-record-key-row">{row.map(keyButton)}</div>)}</div>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        {metric === 'score' ? <><span><i className="keyboard-record-dot bg-mode-upper" />100점</span><span><i className="keyboard-record-dot bg-mode-shoulder" />70~100점 미만</span><span><i className="keyboard-record-dot bg-mode-eye" />70점 미만</span><span><i className="keyboard-record-dot bg-track" />판정 자료 없음</span></> : <span>파란색이 진할수록 입력이 많은 키입니다. 보류·제외 입력도 포함합니다.</span>}
      </div>
      <p className="mt-3 text-xs text-muted">키를 선택하면 관측된 손가락과 판정별 횟수를 볼 수 있어요.</p>
      {extraKeys.length > 0 && <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-xs text-muted">그 외 입력한 키 ({extraKeys.length}개)</summary><div className="mt-3 flex flex-wrap gap-2">{extraKeys.map(key => keyButton(key.code))}</div></details>}
    </section>
    <SelectedKey keyData={byKey.get(selectedKey)} code={selectedKey} policyVersion={policyVersion} />
  </div>;
}

function SelectedKey({ keyData: key, code, policyVersion }: { keyData?: ExploredKey; code: string; policyVersion: string }) {
  const rule = keyRuleFor(policyVersion, code);
  const contextCounts = Object.entries(contextText).map(([context, label]) => ({ label, count: key?.rows.filter(row => row.context === context).reduce((n, row) => n + row.count, 0) ?? 0 })).filter(row => row.count);
  const reasons = new Map<string, number>();
  for (const row of key?.rows ?? []) if (row.verdict === 'unknown') reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + row.count);
  return <section className="keyboard-record-card" aria-label="선택한 키 상세" aria-live="polite">
    <div className="mb-4 flex items-center justify-between gap-3"><div><p className="mb-1 text-xs text-muted">선택한 키</p><h2 className="text-xl font-extrabold text-heading">{keyLabel(code)} <span className="text-sm font-semibold text-mode-keyboard">{scoreText(key?.score ?? null)}</span></h2></div><Hand size={22} className="text-mode-keyboard" /></div>
    <div className="mb-5 rounded-xl bg-mode-keyboard-soft p-3 text-sm text-heading">
      <p className="mb-1 text-xs text-muted">권장 손가락</p><p className="font-semibold">{rule ? rule.preferred.map(finger => fingerText[finger]).join(' · ') : '이 기록 정책의 권장표 없음'}</p>
      {!!rule?.acceptable.length && <p className="mt-1 text-xs text-muted">허용: {rule.acceptable.map(finger => fingerText[finger]).join(' · ')}</p>}
    </div>
    {!key ? <p className="text-sm text-muted">이 세션에서 이 키의 입력 기록이 없습니다.</p> : <>
      <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>전체 {key.total}회</span><span>판정 가능 {key.valid}회</span><span>보류 {key.unknown}회</span><span>제외 {key.unsupported}회</span></div>
      <h3 className="mb-3 text-sm font-bold text-heading">실제 관측된 손가락</h3>
      <div className="space-y-3">{key.fingers.map(row => <div key={row.finger}>
        <div className="mb-1 flex justify-between gap-2 text-xs text-muted"><span>{fingerText[row.finger]}</span><span>{row.count}회 · {percentText(row.count * 100 / key.valid)}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-track"><div className="h-full rounded-full bg-mode-keyboard" style={{ width: `${row.count * 100 / key.valid}%` }} /></div>
      </div>)}{!key.fingers.length && <p className="text-xs text-muted">판정 가능한 손가락 관측이 없습니다.</p>}</div>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center text-xs text-muted">
        <div><strong className="block text-base text-heading">{key.preferred + key.acceptable}</strong>권장·허용</div><div><strong className="block text-base text-heading">{key.nearby}</strong>인접 손가락</div><div><strong className="block text-base text-heading">{key.mismatch}</strong>다른 손가락</div>
      </div>
      <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">입력 상황과 보류·제외 원인</summary><div className="mt-2 space-y-1">{contextCounts.map(row => <p key={row.label}>{row.label} · {row.count}회</p>)}{[...reasons].map(([reason, count]) => <p key={reason}>{reasonText[reason] ?? reason} · {count}회</p>)}</div></details>
    </>}
  </section>;
}
