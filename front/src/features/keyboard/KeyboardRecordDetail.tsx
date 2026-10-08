import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Keyboard, Target } from 'lucide-react';
import { keyboardSummary } from '../../../../database/keyboard';
import type { KeyboardStored } from '../../../../database/keyboard';
import ScoreRing from '../dashboard/ScoreRing';
import { durationText } from '../records/views';
import { exploreKeys, keyLabel, practiceKeys } from './keyExploration';
import { percentText, reasonText, statusText } from './labels';
import KeyboardKeyExploration from './KeyboardKeyExploration';
import './keyboardRecords.css';

export default function KeyboardRecordDetail({ detail, onBack }: { detail: KeyboardStored; onBack?: () => void }) {
  const { record, counts } = detail;
  const summary = useMemo(() => keyboardSummary(counts, record.nearbyCredit), [counts, record.nearbyCredit]);
  const keys = useMemo(() => exploreKeys(counts, record.nearbyCredit), [counts, record.nearbyCredit]);
  const [selectedKey, setSelectedKey] = useState(() => [...keys].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code))[0]?.code ?? 'KeyF');
  const practice = practiceKeys(keys);
  const local = (at: number) => new Date(at - record.offsetMinutes * 60000).toISOString();
  const start = local(record.startedAt), end = local(record.updatedAt);
  const reasons = new Map<string, number>();
  for (const row of counts) if (row.verdict === 'unknown') reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + row.count);
  const selectKey = (code: string) => {
    setSelectedKey(code);
    document.getElementById('keyboard-session-exploration')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  return <div className="keyboard-record-detail space-y-4">
    {onBack && <button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-sm font-semibold text-muted transition hover:text-heading"><ArrowLeft size={16} />학습이력으로 돌아가기</button>}
    <header className="flex items-start gap-3 pb-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mode-keyboard-soft text-mode-keyboard"><Keyboard size={24} /></span>
      <div><h1 className="text-2xl font-extrabold tracking-tight text-heading">키보드 학습 기록</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{start.slice(0, 10)} · {start.slice(11, 16)}~{start.slice(0, 10) !== end.slice(0, 10) ? end.slice(0, 10) + ' ' : ''}{end.slice(11, 16)}</span><span>· {durationText(record.updatedAt - record.startedAt)}</span>
          <span className={`rounded-md px-2 py-1 ${record.status === 'finished' ? 'bg-mode-upper-soft text-heading' : 'bg-surface-muted text-muted'}`}>{record.status === 'finished' ? '정상 종료' : statusText[record.status]}</span></div>
        {record.status === 'running' && <p className="mt-2 text-xs text-muted">아직 종료가 확인되지 않은 기록입니다. 시간과 횟수는 마지막 저장 시점까지 표시합니다.</p>}
      </div>
    </header>
    <div className="keyboard-record-summary">
      <section className="keyboard-record-card flex items-center gap-4" aria-label="세션 훈련 점수"><ScoreRing value={summary.score} strokeClass="stroke-mode-keyboard" label="훈련 점수" /><div><p className="text-2xl font-extrabold tabular-nums text-heading">{summary.score === null ? '—' : summary.score.toFixed(1)}<small className="ml-1 text-xs font-normal text-muted">점</small></p><p className="mt-1 text-xs text-muted">판정 가능한 입력의 평균</p><p className="mt-1 text-xs text-muted">권장·허용 {percentText(summary.agreement)}</p></div></section>
      <section className="keyboard-record-card"><p className="text-xs text-muted">입력 횟수</p><p className="my-2 text-3xl font-extrabold tabular-nums text-heading">{record.total.toLocaleString()}<small className="ml-1 text-xs font-normal text-muted">회</small></p><p className="text-xs text-muted">판정 가능 {summary.valid.toLocaleString()}회</p></section>
      <section className="keyboard-record-card"><p className="text-xs text-muted">판정 가능 비율</p><p className="my-2 text-3xl font-extrabold tabular-nums text-heading">{percentText(summary.coverage)}</p><p className="text-xs text-muted">보류 {summary.unknown}회 · 미지원/단축키 {summary.unsupported}회 별도</p></section>
    </div>
    <div id="keyboard-session-exploration"><KeyboardKeyExploration counts={counts} nearbyCredit={record.nearbyCredit} policyVersion={record.policyVersion} selectedKey={selectedKey} onSelect={setSelectedKey} /></div>
    <div className="keyboard-record-secondary">
      <section className="keyboard-record-card"><h2 className="mb-2 flex items-center gap-2 font-bold text-heading"><Target size={18} className="text-mode-keyboard" />다음에 연습할 키</h2><p className="mb-4 text-xs text-muted">10회 이상 판정한 키 중 인접·다른 손가락 비율이 높은 순서예요.</p>
        <div className="space-y-2">{practice.map(key => <button type="button" key={key.code} onClick={() => selectKey(key.code)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:bg-surface-muted">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mode-keyboard-soft font-extrabold text-heading">{keyLabel(key.code)}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-heading">인접·다른 손가락 {percentText(key.differenceRate * 100)}</p><p className="mt-1 text-xs text-muted">판정 {key.valid}회 · 인접 {key.nearby}회 · 다른 손가락 {key.mismatch}회</p></div><ArrowUpRight size={16} className="shrink-0 text-muted" />
        </button>)}{!practice.length && <p className="rounded-xl bg-surface-muted p-4 text-sm text-muted">{!keys.some(key => key.valid >= 10) ? '10회 이상 판정한 키가 쌓이면 연습할 키를 보여드려요.' : '충분한 표본에서 권장표와 차이가 있는 키가 없습니다.'}</p>}</div>
      </section>
      <section className="keyboard-record-card"><h2 className="mb-4 flex items-center gap-2 font-bold text-heading"><CheckCircle2 size={18} className="text-mode-keyboard" />관찰 품질</h2>
        <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-track" aria-label={`판정 가능 ${summary.valid}회, 보류 ${summary.unknown}회, 제외 ${summary.unsupported}회`}>
          {[{ count: summary.valid, color: 'bg-mode-keyboard' }, { count: summary.unknown, color: 'bg-mode-shoulder' }, { count: summary.unsupported, color: 'bg-border-strong' }].map((part, index) => <span key={index} className={part.color} style={{ width: `${record.total ? part.count * 100 / record.total : 0}%` }} />)}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted"><span>판정 가능 {summary.valid}회</span><span>보류 {summary.unknown}회</span><span>제외 {summary.unsupported}회</span></div>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4"><p className="text-sm text-heading">손가락 사용 일관성</p><strong className="text-lg text-heading">{percentText(summary.consistency)}</strong></div>
        <p className="mt-2 text-xs text-muted">같은 키·Shift 상황에서 10회 이상 관측한 그룹의 최빈 손가락 비율입니다. 점수에 가산하지 않아요.</p>
        <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">보류·제외 원인 ({summary.unknown + summary.unsupported}회)</summary><div className="mt-2 space-y-1">{[...reasons].map(([reason, count]) => <p key={reason}>{reasonText[reason] ?? reason} · {count}회</p>)}{!reasons.size && <p>보류·제외 기록이 없습니다.</p>}</div></details>
      </section>
    </div>
    <details className="keyboard-record-card text-xs text-muted"><summary className="cursor-pointer font-semibold text-heading">점수 계산과 기록 정보</summary><div className="mt-3 space-y-2 break-words"><p>권장·허용 손가락 100점 · 같은 손 인접 손가락 {record.nearbyCredit}점 · 다른 손가락 0점의 입력 수 가중 평균입니다. 보류와 미지원/단축키는 점수에서 제외합니다.</p><p>판정 가능 비율 = 판정 가능 / (판정 가능 + 보류). 미지원 키와 단축키는 이 비율에서도 제외합니다.</p><p>훈련 정책: {record.policyVersion}</p><p>인식 버전: {record.recognitionVersion}</p><p>마지막 저장: {end.slice(0, 10)} {end.slice(11, 19)}</p><p>일자·키·상황·손가락·판정별 횟수만 저장합니다. 입력 순서, 작성 내용, 영상은 보관하지 않습니다.</p></div></details>
  </div>;
}
