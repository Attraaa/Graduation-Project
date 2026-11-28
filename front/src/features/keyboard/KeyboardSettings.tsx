import { useEffect, useState } from 'react';
import Button from '../../components/Button';

type Settings = { apps: { name: string; path: string }[] };
type OpenApp = { name: string; path: string; title: string; icon: string | null };
const message = (e: unknown) => e instanceof Error ? e.message : String(e);

export default function KeyboardSettings({ className = '' }: { className?: string }) {
  const [settings, setSettings] = useState<Settings | null>(null), [error, setError] = useState<string | null>(null);
  // null: closed; 'loading': being read; a list: shown.
  const [openApps, setOpenApps] = useState<OpenApp[] | 'loading' | null>(null);
  const perform = async (operation: () => Promise<Settings>) => {
    try { setSettings(await operation()); setError(null); } catch (e) { setError(message(e)); }
  };
  const showOpenApps = async () => {
    setOpenApps('loading');
    try { setOpenApps(await window.motiKeyboard!.openApps()); setError(null); } catch (e) { setOpenApps(null); setError(message(e)); }
  };
  useEffect(() => {
    let active = true;
    if (!window.motiKeyboard) return;
    void window.motiKeyboard.settings().then(data => { if (active) setSettings(data); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, []);
  const approved = new Set(settings?.apps.map(item => item.path.toLowerCase()));
  return <section aria-label="키보드 · 승인 앱 관찰" className={`card-duo space-y-4 ${className}`}>
    <h2 className="text-xl font-black text-heading">키보드 · 승인 앱 관찰</h2>
    <p className="text-sm text-muted">여기에 승인한 앱은 키보드 측정 중에 함께 관찰합니다. 목록을 바꾸면 측정 중에도 바로 적용돼요. 목록 밖 앱, 관리자 권한 앱, 권한을 확인할 수 없는 앱은 제외합니다. 게임을 추가하지 마세요.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!window.motiKeyboard && <p className="text-muted">승인 앱 설정은 데스크톱 앱에서 사용할 수 있습니다.</p>}
    {settings && <>
      <ul className="space-y-2">{settings.apps.map(item => <li key={item.path} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"><span title={item.path}>{item.name}</span><Button variant="outline" onClick={() => void perform(() => window.motiKeyboard!.updateSettings({ removePath: item.path }))}>승인 취소</Button></li>)}</ul>
      {!settings.apps.length && <p className="text-sm text-muted">승인한 앱이 없습니다. 기본 상태에서는 외부 입력을 관찰하지 않습니다.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={openApps === 'loading'} onClick={() => void showOpenApps()}>열려 있는 앱에서 고르기</Button>
        <Button variant="outline" onClick={() => void perform(() => window.motiKeyboard!.chooseApp())}>실행 파일·바로가기 직접 선택</Button>
      </div>
      {openApps === 'loading' && <p className="text-sm text-muted">열려 있는 앱을 찾고 있어요…</p>}
      {Array.isArray(openApps) && <div aria-label="열려 있는 앱" className="space-y-2">
        <p className="text-sm text-muted">관찰할 앱을 먼저 실행해 두면 이 목록에 나와요.</p>
        {openApps.length
          ? <ul className="space-y-2">{openApps.map(app => <li key={app.path} className="flex items-center justify-between gap-2 rounded border border-border p-3">
              <span className="flex min-w-0 items-center gap-3" title={app.path}>
                {app.icon ? <img src={app.icon} alt="" className="h-6 w-6 shrink-0" /> : <span className="h-6 w-6 shrink-0" />}
                <span className="truncate">{app.title} <span className="text-sm text-muted">{app.name}</span></span>
              </span>
              {approved.has(app.path.toLowerCase())
                ? <span className="shrink-0 text-sm text-muted">승인됨</span>
                : <Button variant="outline" onClick={() => void perform(() => window.motiKeyboard!.approveOpenApp(app.path))}>승인</Button>}
            </li>)}</ul>
          : <p className="text-sm text-muted">승인할 수 있는 열린 앱이 없어요. 앱을 실행한 뒤 다시 눌러 주세요.</p>}
        <Button variant="outline" onClick={() => setOpenApps(null)}>닫기</Button>
      </div>}
    </>}
  </section>;
}
