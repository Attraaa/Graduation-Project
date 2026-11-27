import { useState, useSyncExternalStore } from 'react';
import { Bell, Check, Database, Palette, Trash2, User } from 'lucide-react';
import { clearStatistics, getCurrentUser, updateCurrentUser } from '../utils/authStore';
import { useDialog } from '../components/dialog/useDialog';
import KeyboardSettings from '../features/keyboard/KeyboardSettings';
import AccountSecurity from '../features/settings/AccountSecurity';
import { BUTTON, BUTTON_DANGER, Field, INPUT, Segmented, SettingsCard, Stepper, Switch } from '../features/settings/parts';
import { NOTIFICATION_SETTING_KEYS, NOTIFICATION_SETTINGS_CHANGED, readNotificationPreferences } from '../features/notifications/preferences';
import { ALERT_SCORE, ALERT_SECONDS } from '../features/notifications/activityPolicy';
import { useSubmission } from '../hooks/useSubmission';
import { notificationDeliveryMessage, subscribeNotificationDelivery } from '../features/notifications/delivery';

type Theme = 'light' | 'dark';
// Each tile always shows its own theme, so it carries that theme's colors instead of the current tokens.
const THEMES: Record<Theme, { name: string; page: string; card: string; line: string; ink: string }> = {
  light: { name: '라이트', page: '#f3f5f8', card: '#ffffff', line: '#e3e7ee', ink: '#1d2433' },
  dark: { name: '다크', page: '#0f1218', card: '#171b23', line: '#252b36', ink: '#e6e9ef' },
};
const SOUNDS = [{ id: 'soft', name: '끄기' }, { id: 'normal', name: '켜기' }];
const MODE_DOTS = ['bg-mode-upper', 'bg-mode-keyboard'];
const keep = (key: string, value: string) => {
  localStorage.setItem(`postureAI.${key}`, value);
  if (NOTIFICATION_SETTING_KEYS.includes(key)) window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED));
};

/** One mode's alert rule as a sentence: "상체 [70점] 이하 [3초] 유지 시". Stored under `postureAI.<key>`. */
function AlertRule({ name, score, seconds, onScore, onSeconds }: {
  name: string; score: number; seconds: number; onScore: (value: number) => void; onSeconds: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
      <span className="w-12 shrink-0 font-semibold text-heading">{name}</span>
      <Stepper label={`${name} 알림 점수`} value={score} steps={ALERT_SCORE.steps} unit="점" onChange={onScore} />
      <span className="text-muted">이하</span>
      <Stepper label={`${name} 알림 시간`} value={seconds} steps={ALERT_SECONDS.steps} unit="초" onChange={onSeconds} />
      <span className="text-muted">유지 시</span>
    </div>
  );
}

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
  const deliveryStatus = useSyncExternalStore(subscribeNotificationDelivery, notificationDeliveryMessage, notificationDeliveryMessage);
  const [darkMode, setDarkMode] = useState(localStorage.getItem('postureAI.theme') === 'dark');
  const [nickname, setNickname] = useState(currentUser?.nickname ?? '');
  const [savedNickname, setSavedNickname] = useState(nickname);
  const [alertStrength, setAlertStrength] = useState(() => readNotificationPreferences().silent ? 'soft' : 'normal');
  const [scoreThreshold, setScoreThreshold] = useState(() => readNotificationPreferences().scoreThreshold);
  const [postureSeconds, setPostureSeconds] = useState(() => readNotificationPreferences().postureSeconds);
  const [keyboardThreshold, setKeyboardThreshold] = useState(() => readNotificationPreferences().keyboardThreshold);
  const [keyboardSeconds, setKeyboardSeconds] = useState(() => readNotificationPreferences().keyboardSeconds);

  const handleTheme = (theme: Theme) => {
    setDarkMode(theme === 'dark');
    keep('theme', theme);
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
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
            <p className="text-sm font-semibold text-heading">알림 켜기</p>
            <Switch label="알림 켜기" checked={notificationsEnabled}
              onChange={on => { setNotificationsEnabled(on); keep('notifications', on ? 'on' : 'off'); }} />
          </div>
          <Field label="알림 기준">
            <div className="space-y-2">
              <AlertRule name="상체" score={scoreThreshold} seconds={postureSeconds}
                onScore={value => { setScoreThreshold(value); keep('scoreThreshold', String(value)); }}
                onSeconds={value => { setPostureSeconds(value); keep('alertSeconds', String(value)); }} />
              <AlertRule name="키보드" score={keyboardThreshold} seconds={keyboardSeconds}
                onScore={value => { setKeyboardThreshold(value); keep('keyboardThreshold', String(value)); }}
                onSeconds={value => { setKeyboardSeconds(value); keep('keyboardAlertSeconds', String(value)); }} />
            </div>
          </Field>
          <Field label="알림 소리">
            <Segmented label="알림 소리" options={SOUNDS} value={alertStrength}
              onChange={value => { setAlertStrength(value); keep('alertStrength', value); }} />
          </Field>
          {window.motiNotifications && deliveryStatus && <p role="status" className="text-xs text-muted">{deliveryStatus}</p>}
        </SettingsCard>

        <SettingsCard title="데이터 관리" icon={<Database size={18} />}>
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

        <KeyboardSettings className="lg:col-span-2 xl:col-span-3" />
      </div>
    </div>
  );
};

export default Settings;
