import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { useDialog } from '../../components/dialog/useDialog';
import { usePasswordReset, type ResetStep } from '../../hooks/usePasswordReset';
import { changeEmail, getCurrentUser, readAccountEmail } from '../../utils/authStore';
import { BUTTON, BUTTON_STRONG, Field, INPUT, Modal, SettingsCard } from './parts';

const RESET_BUTTON: Record<ResetStep, [idle: string, busy: string]> = {
  request: ['인증 코드 받기', '보내는 중…'],
  verify: ['인증 코드 확인', '확인 중…'],
  reset: ['비밀번호 재설정', '바꾸는 중…'],
};

/** New email plus the current password, because the recovery address can reset the password. */
function EmailWindow({ current, onClose, onSaved }: {
  current: string | null; onClose: () => void; onSaved: (email: string, message: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(current ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await changeEmail(email, currentPassword);
    setBusy(false);
    if (result.ok) await onSaved(email.trim().toLowerCase(), result.message);
    else setMessage(result.message);
  };

  return (
    <Modal title={current ? '이메일 변경' : '이메일 등록'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="새 이메일" htmlFor="account-email">
          <input id="account-email" type="email" autoComplete="email" autoFocus required value={email}
            onChange={event => setEmail(event.target.value)} className={INPUT} />
        </Field>
        <Field label="현재 비밀번호" htmlFor="account-current-password">
          <input id="account-current-password" type="password" autoComplete="current-password" required value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)} className={INPUT} />
        </Field>
        {message && <p role="status" className="text-sm font-semibold text-danger">{message}</p>}
        <button type="submit" disabled={busy} className={`${BUTTON_STRONG} w-full`}>{busy ? '저장 중…' : '저장'}</button>
      </form>
    </Modal>
  );
}

/** Mails a code to the registered address; the new-password fields appear only after the code is accepted. */
function PasswordWindow({ username, email, onClose, onDone }: {
  username: string; email: string; onClose: () => void; onDone: () => Promise<void>;
}) {
  const reset = usePasswordReset();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reset.step === 'request') await reset.sendCode(username, email);
    else if (reset.step === 'verify') await reset.checkCode(username);
    else if (await reset.savePassword(username, newPassword, confirmPassword)) await onDone();
  };

  return (
    <Modal title="비밀번호 재설정" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {reset.step === 'request' && (
          <p className="text-sm text-muted">등록된 이메일 <span className="font-semibold text-heading">{email}</span>(으)로 인증 코드를 보낼게요.</p>
        )}
        {reset.message && <p role="status" className="text-sm text-muted">{reset.message}</p>}
        {reset.step === 'verify' && (
          <Field label="인증 코드 6자리" htmlFor="reset-code">
            <input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required value={reset.code}
              onChange={event => reset.setCode(event.target.value)} className={INPUT} />
          </Field>
        )}
        {reset.step === 'reset' && (
          <>
            <Field label="새 비밀번호 (6자 이상)" htmlFor="reset-new-password">
              <input id="reset-new-password" type="password" autoComplete="new-password" autoFocus required value={newPassword}
                onChange={event => setNewPassword(event.target.value)} className={INPUT} />
            </Field>
            <Field label="새 비밀번호 확인" htmlFor="reset-confirm-password">
              <input id="reset-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)} className={INPUT} />
            </Field>
          </>
        )}
        <button type="submit" disabled={reset.busy !== null} className={`${BUTTON_STRONG} w-full`}>
          {RESET_BUTTON[reset.step][reset.busy === reset.step ? 1 : 0]}
        </button>
        {reset.step === 'verify' && (
          <button type="button" disabled={reset.busy !== null} onClick={() => void reset.sendCode(username, email)} className={`${BUTTON} w-full`}>
            {reset.busy === 'request' ? '보내는 중…' : '인증 코드 다시 받기'}
          </button>
        )}
      </form>
    </Modal>
  );
}

/** The recovery email and the password. Neither is edited on the page; each opens a window that checks who is asking. */
export default function AccountSecurity() {
  const { notify } = useDialog();
  const username = getCurrentUser()?.username ?? '';
  // undefined until the server answers, null when the account has no recovery address.
  const [savedEmail, setSavedEmail] = useState<string | null>();
  const [open, setOpen] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    let active = true;
    readAccountEmail().then(value => { if (active) setSavedEmail(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const openPassword = () => {
    if (savedEmail) setOpen('password');
    else void notify({ title: '이메일 등록 필요', message: '비밀번호를 재설정하려면 먼저 이메일을 등록해 주세요. 인증 코드를 그 이메일로 보내요.', tone: 'warning' });
  };

  return (
    <SettingsCard title="비밀번호 · 이메일" icon={<KeyRound size={18} />}>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted">이메일 (아이디·비밀번호 찾기용)</p>
        <p className="truncate text-sm font-semibold text-heading">
          {savedEmail ?? (savedEmail === null ? '등록된 이메일 없음' : '불러오는 중…')}
        </p>
      </div>
      {savedEmail === null && <p className="text-xs font-semibold text-danger">등록된 이메일이 없어요. 등록해야 아이디·비밀번호를 찾을 수 있어요.</p>}
      <p className="text-xs text-muted">비밀번호는 등록된 이메일로 받은 인증 코드를 확인한 뒤 새로 정해요.</p>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen('email')} className={BUTTON}>{savedEmail === null ? '이메일 등록' : '이메일 변경'}</button>
        <button type="button" onClick={openPassword} className={BUTTON_STRONG}>비밀번호 재설정</button>
      </div>
      {open === 'email' && (
        <EmailWindow current={savedEmail ?? null} onClose={() => setOpen(null)} onSaved={async (email, message) => {
          setSavedEmail(email);
          setOpen(null);
          await notify({ title: '변경 완료', message, tone: 'success' });
        }} />
      )}
      {open === 'password' && savedEmail && (
        <PasswordWindow username={username} email={savedEmail} onClose={() => setOpen(null)} onDone={async () => {
          setOpen(null);
          await notify({ title: '재설정 완료', message: '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.', tone: 'success' });
        }} />
      )}
    </SettingsCard>
  );
}
