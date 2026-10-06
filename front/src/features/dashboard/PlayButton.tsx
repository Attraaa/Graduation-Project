import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ModeId } from '../../data/modes';

/** Icon-only start button; the label is both the tooltip and the accessible name. */
export default function PlayButton({ modeId, label, colorClass }: { modeId: ModeId; label: string; colorClass: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" aria-label={label} title={label} onClick={() => navigate(`/learn/${modeId}`)}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${colorClass}`}>
      <Play size={16} fill="currentColor" className="ml-0.5" />
    </button>
  );
}
