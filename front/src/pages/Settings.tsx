import { useState } from 'react';
import { Activity, Bell, Check, Database, KeyRound, Palette, Trash2, User } from 'lucide-react';
import { changePassword, clearStatistics, getCurrentUser, updateCurrentUser } from '../utils/authStore';
import { useDialog } from '../components/dialog/useDialog';
import KeyboardSettings from '../features/keyboard/KeyboardSettings';
import { BUTTON, BUTTON_DANGER, BUTTON_STRONG, Field, INPUT, Segmented, SettingsCard, Slider, Switch } from '../features/settings/parts';

type Theme = 'light' | 'dark';
// Each tile always shows its own theme, so it carries that theme's colors instead of the current tokens.
const THEMES: Record<Theme, { name: string; page: string; card: string; line: string; ink: string }> = {
  light: { name: '라이트', page: '#f3f5f8', card: '#ffffff', line: '#e3e7ee', ink: '#1d2433' },
  dark: { name: '다크', page: '#0f1218', card: '#171b23', line: '#252b36', ink: '#e6e9ef' },
};
const FREQUENCIES = [{ id: '0', name: '즉시' }, { id: '5', name: '5분' }, { id: '10', name: '10분' }, { id: '30', name: '30분' }];
const STRENGTHS = [{ id: 'soft', name: '약함' }, { id: 'normal', name: '보통' }, { id: 'strong', name: '강함' }];
const MODE_DOTS = ['bg-mode-upper', 'bg-mode-keyboard', 'bg-mode-eye'];
const keep = (key: string, value: string) => localStorage.setItem(`postureAI.${key}`, value);

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
  const [clearing, setClearing] = useState(false);
  const currentUser = getCurrentUser();
  const [notificationsEnabled, setNotificationsEnabled] = useState(localStorage.getItem('postureAI.notifications') !== 'off');
  const [darkMode, setDarkMode] = useState(localStorage.getItem('postureAI.theme') === 'dark');
  const [nickname, setNickname] = useState(currentUser?.nickname ?? '');
  const [savedNickname, setSavedNickname] = useState(nickname);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [alertFrequency, setAlertFrequency] = useState(localStorage.getItem('postureAI.alertFrequency') ?? '10');
  const [alertStrength, setAlertStrength] = useState(localStorage.getItem('postureAI.alertStrength') ?? 'normal');
  const [scoreThreshold, setScoreThreshold] = useState(Number(localStorage.getItem('postureAI.scoreThreshold') ?? 70));
  const [collapseSensitivity, setCollapseSensitivity] = useState(Number(localStorage.getItem('postureAI.collapseSensitivity') ?? 50));

  const handleTheme = (theme: Theme) => {
    setDarkMode(theme === 'dark');
    keep('theme', theme);
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
  };

  const handleAccountSave = async () => {
    const result = await updateCurrentUser(nickname);
    if (result.ok) setSavedNickname(nickname.trim());
    await notify({ title: result.ok ? '변경 완료' : '변경 실패', message: result.message, tone: result.ok ? 'success' : 'warning' });
  };

  const handlePasswordChange = async () => {
    if (!nextPassword || nextPassword.length < 6) {
      await notify({ title: '비밀번호 확인', message: '새 비밀번호는 6자 이상 입력해 주세요.', tone: 'warning' });
      return;
    }
    const result = await changePassword(currentPassword, nextPassword);
    await notify({ title: result.ok ? '변경 완료' : '변경 실패', message: result.message, tone: result.ok ? 'success' : 'warning' });
    if (result.ok) {
      setCurrentPassword('');
      setNextPassword('');
    }
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
        <p className="mt-1 text-sm text-muted">계정과 앱 환경을 관리해요 · 화면·알림·자세 기준은 바꾸면 이 기기에 바로 저장돼요</p>
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
          <button type="button" onClick={handleAccountSave} className={`${BUTTON} mt-auto w-full`}>닉네임 변경</button>
        </SettingsCard>

        <SettingsCard title="비밀번호" icon={<KeyRound size={18} />}>
          <Field label="현재 비밀번호" htmlFor="settings-current-password">
            <input id="settings-current-password" type="password" value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)} className={INPUT} />
          </Field>
          <Field label="새 비밀번호 (6자 이상)" htmlFor="settings-next-password">
            <input id="settings-next-password" type="password" value={nextPassword}
              onChange={event => setNextPassword(event.target.value)} className={INPUT} />
          </Field>
          <button type="button" onClick={handlePasswordChange} className={`${BUTTON_STRONG} mt-auto w-full`}>비밀번호 변경</button>
        </SettingsCard>

        <SettingsCard title="화면 테마" note="누르면 바로 바뀌어요" icon={<Palette size={18} />}>
          <div role="group" aria-label="테마" className="grid flex-1 grid-cols-2 gap-3">
            <ThemeTile theme="light" selected={!darkMode} onSelect={handleTheme} />
            <ThemeTile theme="dark" selected={darkMode} onSelect={handleTheme} />
          </div>
        </SettingsCard>

        <SettingsCard title="알림" icon={<Bell size={18} />} iconClass="bg-mode-shoulder-soft text-mode-shoulder">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-heading">자세 경고 알림 (시스템 트레이)</p>
            <Switch label="자세 경고 알림 (시스템 트레이)" checked={notificationsEnabled}
              onChange={on => { setNotificationsEnabled(on); keep('notifications', on ? 'on' : 'off'); }} />
          </div>
          <Field label="알림 빈도">
            <Segmented label="알림 빈도" options={FREQUENCIES} value={alertFrequency}
              onChange={value => { setAlertFrequency(value); keep('alertFrequency', value); }} />
          </Field>
          <Field label="알림 세기">
            <Segmented label="알림 세기" options={STRENGTHS} value={alertStrength}
              onChange={value => { setAlertStrength(value); keep('alertStrength', value); }} />
          </Field>
        </SettingsCard>

        <SettingsCard title="자세 교정 기준" icon={<Activity size={18} />} iconClass="bg-mode-upper-soft text-mode-upper">
          <Slider id="settings-score-threshold" label="경고 점수 기준" valueText={`${scoreThreshold}점 이하`}
            min={40} max={95} minLabel="40점" maxLabel="95점" value={scoreThreshold}
            onChange={value => { setScoreThreshold(value); keep('scoreThreshold', String(value)); }} />
          <Slider id="settings-collapse-sensitivity" label="자세 무너짐 민감도" valueText={`${collapseSensitivity}%`}
            min={10} max={100} minLabel="10%" maxLabel="100%" value={collapseSensitivity}
            onChange={value => { setCollapseSensitivity(value); keep('collapseSensitivity', String(value)); }} />
        </SettingsCard>

        <SettingsCard title="데이터 관리" icon={<Database size={18} />} iconClass="bg-mode-eye-soft text-mode-eye">
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
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">삭제한 데이터는 되돌릴 수 없어요.</p>
            <button type="button" disabled={clearing} onClick={handleClearStatistics} className={BUTTON_DANGER}>
              <Trash2 aria-hidden="true" size={16} />통계 삭제
            </button>
          </div>
        </SettingsCard>

        <KeyboardSettings className="lg:col-span-2 xl:col-span-3" />
      </div>
    </div>
  );
};

export default Settings;
