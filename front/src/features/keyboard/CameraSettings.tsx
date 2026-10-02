import type { KeyboardCamera } from './camera';
import { defaultKeyboardCamera, normalizeKeyboardCamera } from './camera';
import Button from '../../components/Button';

export default function CameraSettings({ value, onChange }: { value: KeyboardCamera; onChange(value: KeyboardCamera): void }) {
  const update = (field: keyof KeyboardCamera, next: number) => onChange(normalizeKeyboardCamera({ ...value, [field]: next }));
  return <details className="card-duo"><summary className="cursor-pointer font-bold text-heading">키보드 카메라 · 분석 영역 설정</summary>
    <p className="my-3 text-sm text-muted">키보드와 양손이 모두 포함되도록 조절하세요. 회전 후 빈 모서리는 확대해서 채우므로 가장자리가 잘립니다. 미리보기와 분석 영상은 동일하며, 변경하면 키보드 위치를 다시 잡습니다.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {(['left', 'top', 'width', 'height'] as const).map((field, i) => <label key={field} className="text-sm text-heading">{['영역 시작 X', '영역 시작 Y', '영역 너비', '영역 높이'][i]} · {Math.round(value[field] * 100)}%
        <input className="block w-full" type="range" min={i < 2 ? 0 : 10} max={i < 2 ? 90 : Math.round((1 - value[field === 'width' ? 'left' : 'top']) * 100)} step="1" value={value[field] * 100} onChange={event => update(field, Number(event.target.value) / 100)} /></label>)}
      <label className="text-sm text-heading">회전 · {value.angle}°<input className="block w-full" type="range" min="-180" max="180" step="1" value={value.angle} onChange={event => update('angle', Number(event.target.value))} /></label>
      {(['brightness', 'contrast'] as const).map(field => <label key={field} className="text-sm text-heading">{field === 'brightness' ? '영상 밝기' : '영상 대비'} · {value[field]}%<input className="block w-full" type="range" min="50" max="150" value={value[field]} onChange={event => update(field, Number(event.target.value))} /></label>)}
      <label className="text-sm text-heading">요청 해상도 · 다음 시작부터<select className="ml-2 rounded border border-border bg-surface p-2" value={value.resolution} onChange={event => update('resolution', Number(event.target.value))}><option value="640">640×360</option><option value="1280">1280×720</option><option value="1920">1920×1080</option></select></label>
    </div>
    <p className="my-3 text-xs text-muted">밝기·대비는 영상 필터입니다. 과노출로 사라진 정보는 복구하지 못합니다. 실제 노출과 초점은 카메라 제조사 설정에서 조절해 주세요. 장치가 요청 해상도를 지원하지 않으면 가장 가까운 해상도를 사용합니다.</p>
    <Button variant="outline" onClick={() => onChange({ ...defaultKeyboardCamera })}>기본 영상으로 되돌리기</Button>
  </details>;
}
