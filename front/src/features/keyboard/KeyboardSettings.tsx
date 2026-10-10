import { useEffect, useState } from 'react';
import { AlertTriangle, AppWindow, Keyboard, Plus } from 'lucide-react';
import { BUTTON, Field, INPUT, SettingsCard } from '../settings/parts';

type Settings = { apps: { name: string; path: string }[]; stopShortcut: string };
const NOTE = 'flex gap-2 before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-border-strong';
export default function KeyboardSettings({ className = '' }: { className?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null), [error, setError] = useState<string | null>(null);
  const perform = async (operation: () => Promise<Settings>) => {
    try { setSettings(await operation()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => {
    let active = true;
    if (!window.motiKeyboard) return;
    void window.motiKeyboard.settings().then(data => { if (active) setSettings(data); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, []);
  return <SettingsCard title="키보드 · 승인 앱 관찰" icon={<Keyboard size={18} />} iconClass="bg-mode-keyboard-soft text-mode-keyboard" className={className}>
    <div className="grid gap-x-8 gap-y-4 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        <ul className="space-y-1 text-sm text-muted">
          <li className={NOTE}>학습 화면에서 ‘승인 앱도 관찰’을 선택하고 시작해야 켜집니다.</li>
          <li className={NOTE}>앱 창은 작업표시줄에 계속 남습니다.</li>
          <li className={NOTE}>목록 밖 앱, 관리자 권한 앱, 권한을 확인할 수 없는 앱은 제외합니다.</li>
        </ul>
        <p className="flex gap-2 rounded-xl bg-mode-shoulder-soft px-3 py-2 text-sm text-heading"><AlertTriangle aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-warning-border" />게임을 추가하지 마세요. 모든 게임을 자동 식별하거나 제재가 없음을 보장할 수는 없습니다.</p>
        <ul className="space-y-1 text-xs text-muted">
          <li className={NOTE}>중지 단축키·화면 잠금·절전·페이지 이동 시 관찰을 끝냅니다. 다시 시작하려면 학습 화면에서 시작 버튼을 누르세요.</li>
          <li className={NOTE}>단축키가 다른 앱에서 사용 중이면 외부 관찰을 시작하지 않습니다.</li>
          <li className={NOTE}>원문·입력 순서·영상은 저장하지 않고 날짜·키·손가락별 횟수와 판정만 서버에 저장합니다.</li>
        </ul>
      </div>
      <div className="space-y-3 lg:col-span-2">
        {error && <p role="alert" className="rounded-xl bg-mode-eye-soft px-3 py-2 text-sm text-heading">{error}</p>}
        {!window.motiKeyboard && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">승인 앱 설정은 데스크톱 앱에서 사용할 수 있습니다.</p>}
        {settings && <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">승인한 앱 {settings.apps.length}개</p>
            <button type="button" className={BUTTON} onClick={() => void perform(() => window.motiKeyboard!.chooseApp())}><Plus aria-hidden="true" size={16} />일반 앱 실행 파일 승인</button>
          </div>
          <ul className="space-y-2">{settings.apps.map(item => <li key={item.path} className="flex items-center gap-3 rounded-xl border border-border py-1.5 pl-3 pr-1.5"><AppWindow aria-hidden="true" size={18} className="shrink-0 text-mode-keyboard" /><span title={item.path} className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">{item.name}</span><button type="button" className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition hover:bg-nav-active hover:text-heading" onClick={() => void perform(() => window.motiKeyboard!.updateSettings({ removePath: item.path }))}>승인 취소</button></li>)}</ul>
          {!settings.apps.length && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">승인한 앱이 없습니다. 기본 상태에서는 외부 입력을 관찰하지 않습니다.</p>}
          <Field label="즉시 중지 단축키" htmlFor="keyboard-stop-shortcut">
            <select id="keyboard-stop-shortcut" className={INPUT} value={settings.stopShortcut} onChange={event => void perform(() => window.motiKeyboard!.updateSettings({ stopShortcut: event.target.value }))}>{Array.from({ length: 12 }, (_, i) => `Control+Alt+F${i + 1}`).map(key => <option key={key} value={key}>{key.replace('Control', 'Ctrl')}</option>)}</select>
          </Field>
        </>}
      </div>
    </div>
  </SettingsCard>;
}
