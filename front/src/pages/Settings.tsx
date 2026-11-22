import { useState, useSyncExternalStore } from 'react';
import { Activity, Bell, Check, Database, Eye, Palette, Trash2, User } from 'lucide-react';
import { clearStatistics, getCurrentUser, updateCurrentUser } from '../utils/authStore';
import { useDialog } from '../components/dialog/useDialog';
import type { EyeSensitivity } from '../features/eye/eyePolicy';
import KeyboardSettings from '../features/keyboard/KeyboardSettings';
import AccountSecurity from '../features/settings/AccountSecurity';
import { POSTURE_SENSITIVITY } from '../features/posture/evaluation';
import { BUTTON, BUTTON_DANGER, Field, INPUT, Segmented, SettingsCard, Slider, Switch } from '../features/settings/parts';
import { readBaseCva, readEyeSensitivity, readPostureSensitivity, writeBaseCva, writeEyeSensitivity, writePostureSensitivity } from '../features/settings/preferences';
import { BASE_CVA } from '../features/posture/modes/turtle';
import { NOTIFICATION_SETTING_KEYS, NOTIFICATION_SETTINGS_CHANGED, readNotificationPreferences } from '../features/notifications/preferences';
import { useSubmission } from '../hooks/useSubmission';
import { notificationDeliveryMessage, reportNotificationDelivery, subscribeNotificationDelivery } from '../features/notifications/delivery';

type Theme = 'light' | 'dark';
// Each tile always shows its own theme, so it carries that theme's colors instead of the current tokens.
const THEMES: Record<Theme, { name: string; page: string; card: string; line: string; ink: string }> = {
  light: { name: '라이트', page: '#f3f5f8', card: '#ffffff', line: '#e3e7ee', ink: '#1d2433' },
  dark: { name: '다크', page: '#0f1218', card: '#171b23', line: '#252b36', ink: '#e6e9ef' },
};
const FREQUENCIES = [{ id: '0', name: '발생 시' }, { id: '5', name: '5분' }, { id: '10', name: '10분' }, { id: '30', name: '30분' }];
const SOUNDS = [{ id: 'soft', name: '끄기' }, { id: 'normal', name: '켜기' }];
const EYE_SENSITIVITIES: { id: EyeSensitivity; name: string }[] = [{ id: 'low', name: '낮음' }, { id: 'normal', name: '보통' }, { id: 'high', name: '높음' }];
const NEXT_SESSION = '다음 측정부터 적용';
const MODE_DOTS = ['bg-mode-upper', 'bg-mode-keyboard'];
const keep = (key: string, value: string) => {
  localStorage.setItem(`postureAI.${key}`, value);
  if (NOTIFICATION_SETTING_KEYS.includes(key)) window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED));
};

/** A small picture of the dashboard in one theme; the whole tile is the button. */
function ThemeTile({ theme, selected, onSelect }: { theme: Theme; selected: boolean; onSelect: (theme: Theme) => void }) {
  const look = THEMES[theme];
  return (
    <button type="button" aria-pressed={selected} aria-label={`${look.name} 테마`} onClick={() => onSelect(theme)}
      className={`flex flex-col gap-2 rounded-xl border p-2 text-left transition ${selected ? 'border-transparent ring-2 ring-heading' : 'border-border hover:bg-nav-active'}`}>
      <span aria-hidden="true" className="flex min-h-24 w-full flex-1 gap-1.5 rounded-lg p-1.5" style={{ background: look.page, boxShadow: `inset 0 0 0 1px ${look.line}` }}>
        <span className="flex w-1/5 flex-col gap-1 rounded p-1" style={{ background: look.card }}>
          <span className="h-1 w-3/4 rounded-full" style={{ background: look.ink }} />
          <span className="mt-1 h-1 rounded-full" style={{ background: look.line }} />
          <span className="h-1 rounded-full" style={{ background: look.line }} />
          <span className="h-1 rounded-full" style={{ background: look.line }} />
        </span>
        <span className="flex flex-1 flex-col gap-1.5">
          <span className="flex gap-1.5">
            {MODE_DOTS.map(dot => (
              <span key={dot} className="flex h-6 flex-1 items-center gap-1 rounded px-1" style={{ background: look.card }}>
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                <span className="h-1 flex-1 rounded-full" style={{ background: look.line }} />
              </span>
            ))}
          </span>
          <span className="flex flex-1 rounded p-1" style={{ background: look.card }}>
            <svg viewBox="0 0 60 20" preserveAspectRatio="none" className="h-full w-full" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,7 14,8 26,6 38,5 50,6 58,4" stroke="var(--color-mode-shoulder)" vectorEffect="non-scaling-stroke" />
              <polyline points="2,15 14,13 26,16 38,11 50,12 58,9" stroke="var(--color-mode-upper)" vectorEffect="non-scaling-stroke" />
            </svg>
          </span>
        </span>
      </span>
      <span className="flex items-center justify-between px-1 text-sm font-semibold text-heading">
        {look.name}
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${selected ? 'bg-heading text-surface' : 'border border-border-strong'}`}>
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}

const Settings = () => {
  const { notify, confirm } = useDialog();
  const { busy: savingAccount, run: saveAccount } = useSubmission();
  const [clearing, setClearing] = useState(false);
  const currentUser = getCurrentUser();
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => readNotificationPreferences().enabled);
  const [testingNotification, setTestingNotification] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState('');
  const deliveryStatus = useSyncExternalStore(subscribeNotificationDelivery, notificationDeliveryMessage, notificationDeliveryMessage);
  const [darkMode, setDarkMode] = useState(localStorage.getItem('postureAI.theme') === 'dark');
  const [nickname, setNickname] = useState(currentUser?.nickname ?? '');
  const [savedNickname, setSavedNickname] = useState(nickname);
  const [alertFrequency, setAlertFrequency] = useState(() => String(readNotificationPreferences().intervalMinutes));
  const [alertStrength, setAlertStrength] = useState(() => readNotificationPreferences().silent ? 'soft' : 'normal');
  const [scoreThreshold, setScoreThreshold] = useState(() => readNotificationPreferences().scoreThreshold);
  const [postureSensitivity, setPostureSensitivity] = useState(() => readPostureSensitivity());
  const [baseCva, setBaseCva] = useState(() => readBaseCva());
  const [eyeSensitivity, setEyeSensitivity] = useState(() => readEyeSensitivity());

  const handleTheme = (theme: Theme) => {
    setDarkMode(theme === 'dark');
    keep('theme', theme);
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
  };

  const handleNotificationTest = async () => {
    if (!window.motiNotifications || testingNotification) return;
    setTestingNotification(true);
    setNotificationStatus('');
    try {
      const result = await window.motiNotifications.show({ kind: 'test', silent: readNotificationPreferences().silent });
      reportNotificationDelivery(result.ok);
      setNotificationStatus(result.ok ? 'Windows에 알림을 보냈어요. 배너가 안 보이면 Windows 알림 설정·방해 금지를 확인해 주세요.' : result.message);
    } catch { setNotificationStatus('알림 요청에 실패했어요. 앱을 다시 실행한 뒤 시도해 주세요.'); }
    finally { setTestingNotification(false); }
  };

  const handleAccountSave = async () => {
    await saveAccount(async signal => {
      const result = await updateCurrentUser(nickname, signal);
      if (signal.aborted) return;
      if (result.ok) setSavedNickname(nickname.trim());
      await notify({ title: result.ok ? '변경 완료' : '변경 실패', message: result.message, tone: result.ok ? 'success' : 'warning' });
    });
  };

  const handleClearStatistics = async () => {
    if (clearing) return;
    const confirmed = await confirm({
      title: '데이터 삭제',
      message: '현재 계정으로 서버에 저장된 통계와 학습이력을 삭제하시겠습니까?\n삭제한 데이터는 되돌릴 수 없습니다.',
      tone: 'danger',
      confirmLabel: '삭제하기',
      cancelLabel: '유지하기',
    });
    if (!confirmed) return;
    setClearing(true);
    try {
      await clearStatistics();
      await notify({ title: '삭제 완료', message: '현재 계정의 통계와 학습이력을 삭제했습니다.', tone: 'success' });
    } catch (error) {
      await notify({ title: '삭제 실패', message: error instanceof Error ? error.message : '기록 삭제에 실패했습니다.', tone: 'warning' });
    } finally { setClearing(false); }
  };

  return (
    <div className="space-y-4 pb-4">
      <header>
        <h1 className="text-2xl font-extrabold text-heading">설정</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SettingsCard title="계정" icon={<User size={18} />}>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-extrabold text-white">
              {(savedNickname || currentUser?.username || '?').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold leading-tight text-heading">{savedNickname || '닉네임 없음'}</p>
              <p className="truncate text-sm text-muted">{`아이디 ${currentUser?.username ?? '—'}`}</p>
            </div>
          </div>
          <Field label="닉네임" htmlFor="settings-nickname">
            <input id="settings-nickname" type="text" value={nickname} onChange={event => setNickname(event.target.value)} className={INPUT} />
          </Field>
          <button type="button" disabled={savingAccount} onClick={handleAccountSave} className={`${BUTTON} mt-auto w-full`}>닉네임 변경</button>
        </SettingsCard>

        <AccountSecurity />

        <SettingsCard title="화면 테마" icon={<Palette size={18} />}>
          <div role="group" aria-label="테마" className="grid flex-1 grid-cols-2 gap-3">
            <ThemeTile theme="light" selected={!darkMode} onSelect={handleTheme} />
            <ThemeTile theme="dark" selected={darkMode} onSelect={handleTheme} />
          </div>
        </SettingsCard>

        <SettingsCard title="알림" icon={<Bell size={18} />} iconClass="bg-mode-shoulder-soft text-mode-shoulder">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-heading">Windows 알림</p>
            <Switch label="Windows 알림" checked={notificationsEnabled}
              onChange={on => { setNotificationsEnabled(on); keep('notifications', on ? 'on' : 'off'); }} />
          </div>
          <Field label="반복 알림 간격">
            <Segmented label="반복 알림 간격" options={FREQUENCIES} value={alertFrequency}
              onChange={value => { setAlertFrequency(value); keep('alertFrequency', value); }} />
          </Field>
          <Field label="알림 소리">
            <Segmented label="알림 소리" options={SOUNDS} value={alertStrength}
              onChange={value => { setAlertStrength(value); keep('alertStrength', value); }} />
          </Field>
          <p className="text-xs text-muted">다른 앱 사용 중 또는 오버레이 모드에서 알림을 받아요.</p>
          <button type="button" disabled={!window.motiNotifications || !notificationsEnabled || testingNotification}
            onClick={handleNotificationTest} className={`${BUTTON} w-full`}>{testingNotification ? '알림 보내는 중…' : '알림 테스트'}</button>
          <p role="status" className="text-xs text-muted">{!window.motiNotifications ? 'Windows 데스크톱 앱에서 사용할 수 있어요.' : deliveryStatus || notificationStatus}</p>
        </SettingsCard>

        <SettingsCard title="상체 · 자세 기준" icon={<Activity size={18} />} iconClass="bg-mode-upper-soft text-mode-upper">
          <Slider id="settings-posture-sensitivity" label="자세 무너짐 민감도" valueText={`${postureSensitivity}%`}
            min={POSTURE_SENSITIVITY.min} max={POSTURE_SENSITIVITY.max} step={POSTURE_SENSITIVITY.step} minLabel="둔감" maxLabel="민감"
            value={postureSensitivity} onChange={value => { setPostureSensitivity(value); writePostureSensitivity(value); }} />
          <Slider id="settings-score-threshold" label="경고 점수 기준" valueText={`${scoreThreshold}점 이하`}
            min={40} max={95} minLabel="40점" maxLabel="95점" value={scoreThreshold}
            onChange={value => { setScoreThreshold(value); keep('scoreThreshold', String(value)); }} />
          <Slider id="settings-base-cva" label="기준 CVA" valueText={`${baseCva}°`}
            min={BASE_CVA.min} max={BASE_CVA.max} minLabel={`${BASE_CVA.min}°`} maxLabel={`${BASE_CVA.max}°`} value={baseCva}
            onChange={value => { setBaseCva(value); writeBaseCva(value); }} />
          <p className="mt-auto text-xs text-muted">{`민감도는 ${NEXT_SESSION}`}</p>
        </SettingsCard>

        <SettingsCard title="안구 · 깜빡임 기준" icon={<Eye size={18} />} iconClass="bg-mode-eye-soft text-mode-eye">
          <Field label="깜빡임 민감도">
            <Segmented label="깜빡임 민감도" options={EYE_SENSITIVITIES} value={eyeSensitivity}
              onChange={value => { setEyeSensitivity(value); writeEyeSensitivity(value); }} />
          </Field>
          <p className="mt-auto text-xs text-muted">{NEXT_SESSION}</p>
        </SettingsCard>

        <KeyboardSettings className="lg:col-span-2" />

        <SettingsCard title="데이터 관리" icon={<Database size={18} />} className="lg:col-span-2 xl:col-span-1">
          <dl className="space-y-2 text-sm">
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 font-semibold text-heading">지워져요</dt>
              <dd className="text-muted">현재 계정으로 서버에 저장된 상체·키보드·안구 통계와 학습이력</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 font-semibold text-heading">남아요</dt>
              <dd className="text-muted">계정과 이 기기의 설정</dd>
            </div>
          </dl>
          <button type="button" disabled={clearing} onClick={handleClearStatistics} className={`${BUTTON_DANGER} mt-auto self-end`}>
            <Trash2 aria-hidden="true" size={16} />통계 삭제
          </button>
        </SettingsCard>
      </div>
    </div>
  );
};

export default Settings;
