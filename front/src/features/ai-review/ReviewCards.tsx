import type { ReactNode } from 'react';
import { CircleAlert, Sparkles, Target, ThumbsUp } from 'lucide-react';
import { CARD } from '../statistics/parts';
import type { AiReview, AiReviewSection } from './input';

const AREA_DOT: Record<AiReviewSection['key'], string> = { overall: 'bg-border-strong', upper: 'bg-mode-upper', keyboard: 'bg-mode-keyboard', eye: 'bg-mode-eye' };

function CardHeading({ icon, iconClass, children }: { icon: ReactNode; iconClass: string; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-bold text-heading">
      <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span>
      {children}
    </h3>
  );
}

function ListCard({ title, icon, iconClass, items }: { title: string; icon: ReactNode; iconClass: string; items: string[] }) {
  return (
    <section aria-label={title} className={`${CARD} space-y-3`}>
      <CardHeading icon={icon} iconClass={iconClass}>{title}</CardHeading>
      {items.length ? (
        <ul className="space-y-2 text-sm leading-relaxed text-heading">
          {items.map(item => (
            <li key={item} className="flex gap-2 before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-border-strong">{item}</li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">이번 총평에는 따로 꼽은 내용이 없어요.</p>}
    </section>
  );
}

/** One review: the headline and the overall paragraph, a paragraph per measured area, then strengths, weaknesses and goals. */
export default function ReviewCards({ review }: { review: AiReview }) {
  const [overall, ...areas] = review.sections;
  return (
    <div className="space-y-4">
      <section aria-label="총평" className={`${CARD} space-y-3`}>
        <CardHeading icon={<Sparkles size={16} />} iconClass="bg-track text-heading">{overall?.title ?? '총평'}</CardHeading>
        {review.headline && <p className="text-lg font-bold leading-snug text-heading">{review.headline}</p>}
        {overall && <p className="leading-relaxed text-heading">{overall.text}</p>}
        {review.adviceSource === 'record' && <p className="text-xs text-muted">측정 기록에 맞춘 기본 습관 제안을 표시했어요.</p>}
      </section>
      {areas.length > 0 && (
        <div className={`grid gap-4 ${areas.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {areas.map(area => (
            <section key={area.key} aria-label={area.title} className={`${CARD} space-y-2`}>
              <h3 className="flex items-center gap-2 font-bold text-heading">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${AREA_DOT[area.key]}`} />{area.title}
              </h3>
              <p className="text-sm leading-relaxed text-heading">{area.text}</p>
            </section>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <ListCard title="잘한 점" icon={<ThumbsUp size={16} />} iconClass="bg-mode-upper-soft text-mode-upper" items={review.strengths} />
        <ListCard title="아쉬운 점" icon={<CircleAlert size={16} />} iconClass="bg-track text-heading" items={review.weaknesses} />
        <ListCard title="다음 목표" icon={<Target size={16} />} iconClass="bg-mode-keyboard-soft text-mode-keyboard" items={review.goals} />
      </div>
      <div className="space-y-1 text-xs text-muted">
        {review.caution && <p>{review.caution}</p>}
        <p>숫자와 판단은 기록으로 앱이 계산했고, 의학적 진단이 아니에요.</p>
      </div>
    </div>
  );
}
