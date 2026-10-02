import { useEffect, useState } from 'react';
import Button from '../../components/Button';

type Settings = { apps: { name: string; path: string }[]; stopShortcut: string };
export default function KeyboardSettings() {
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
  return <section className="card-duo space-y-4">
    <h2 className="text-xl font-black text-heading">키보드 · 승인 앱 관찰</h2>
    <p className="text-sm text-muted">학습 화면에서 ‘승인 앱도 관찰’을 선택하고 시작해야 켜집니다. 앱 창은 작업표시줄에 계속 남습니다. 목록 밖 앱, 관리자 권한 앱, 권한을 확인할 수 없는 앱은 제외합니다. 게임을 추가하지 마세요. 모든 게임을 자동 식별하거나 제재가 없음을 보장할 수는 없습니다.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!window.motiKeyboard && <p className="text-muted">승인 앱 설정은 데스크톱 앱에서 사용할 수 있습니다.</p>}
    {settings && <>
      <ul className="space-y-2">{settings.apps.map(item => <li key={item.path} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"><span title={item.path}>{item.name}</span><Button variant="outline" onClick={() => void perform(() => window.motiKeyboard!.updateSettings({ removePath: item.path }))}>승인 취소</Button></li>)}</ul>
      {!settings.apps.length && <p className="text-sm text-muted">승인한 앱이 없습니다. 기본 상태에서는 외부 입력을 관찰하지 않습니다.</p>}
      <Button variant="outline" onClick={() => void perform(() => window.motiKeyboard!.chooseApp())}>일반 앱 실행 파일 승인</Button>
      <label className="block text-sm font-bold text-heading">즉시 중지 단축키<select className="ml-2 rounded border border-border bg-surface p-2" value={settings.stopShortcut} onChange={event => void perform(() => window.motiKeyboard!.updateSettings({ stopShortcut: event.target.value }))}>{Array.from({ length: 12 }, (_, i) => `Control+Alt+F${i + 1}`).map(key => <option key={key} value={key}>{key.replace('Control', 'Ctrl')}</option>)}</select></label>
    </>}
    <p className="text-xs text-muted">중지 단축키·화면 잠금·절전·페이지 이동 시 관찰을 끝냅니다. 다시 시작하려면 학습 화면에서 시작 버튼을 누르세요. 단축키가 다른 앱에서 사용 중이면 외부 관찰을 시작하지 않습니다. 원문·입력 순서·영상은 저장하지 않고 날짜·키·손가락별 횟수와 판정만 서버에 저장합니다.</p>
  </section>;
}
