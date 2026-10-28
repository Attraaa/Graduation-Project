import { useState } from 'react';
import { requestPasswordReset, resetPassword, verifyResetCode } from '../utils/authStore';

export type ResetStep = 'request' | 'verify' | 'reset';

/**
 * The steps shared by "비밀번호 찾기" and the settings reset window: mail a code, check it, then set the
 * new password. The new-password step opens only after the server accepts the code.
 */
export function usePasswordReset() {
  const [step, setStep] = useState<ResetStep>('request');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<ResetStep | null>(null);

  const run = async <T>(kind: ResetStep, task: () => Promise<T>) => {
    setBusy(kind);
    try { return await task(); } finally { setBusy(null); }
  };

  const sendCode = (username: string, email: string) => run('request', async () => {
    const result = await requestPasswordReset(username, email);
    setMessage(result.message);
    if (result.ok) {
      setCode('');
      setStep('verify');
    }
  });

  const checkCode = (username: string) => run('verify', async () => {
    const result = await verifyResetCode(username, code);
    setMessage(result.message);
    if (result.ok) setStep('reset');
  });

  /** Resolves to the server's message once the password is changed, or null while something still needs fixing. */
  const savePassword = async (username: string, newPassword: string, confirmPassword: string) => {
    if (newPassword.length < 6) {
      setMessage('새 비밀번호는 6자 이상 입력해 주세요.');
      return null;
    }
    if (newPassword !== confirmPassword) {
      setMessage('새 비밀번호가 일치하지 않습니다.');
      return null;
    }
    return run('reset', async () => {
      const result = await resetPassword(username, code, newPassword);
      if (result.ok) return result.message;
      setMessage(result.message);
      return null;
    });
  };

  return { step, code, setCode, message, busy, sendCode, checkCode, savePassword };
}
