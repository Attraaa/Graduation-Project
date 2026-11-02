import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import Button from '../components/Button';
import { useDialog } from '../components/dialog/useDialog';
import { usePasswordReset } from '../hooks/usePasswordReset';

const FIELD = 'w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white';

const FindPassword = () => {
  const navigate = useNavigate();
  const { notify } = useDialog();
  const reset = usePasswordReset();
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    void reset.sendCode(userId, email);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    void reset.checkCode(userId);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = await reset.savePassword(userId, newPassword, confirmPassword);
    if (!message) return;
    await notify({ title: '재설정 완료', message, tone: 'success' });
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#ffc800] shadow-sm">
            <KeyRound size={40} className="text-white" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#b38300]">비밀번호 찾기</h1>
          <p className="text-center text-gray-500 font-bold">
            아이디와 가입할 때 등록한 이메일을 입력하면 인증 코드를 보내 드립니다.
          </p>
        </div>

        {/* The ID is fixed once the code is accepted, because the new password goes to that account. */}
        <form onSubmit={handleRequest} className="space-y-4">
          <input type="text" placeholder="아이디" autoComplete="username" className={FIELD} readOnly={reset.step === 'reset'}
            value={userId} onChange={(e) => setUserId(e.target.value)} required />
          <input type="email" placeholder="이메일" autoComplete="email" className={FIELD} readOnly={reset.step === 'reset'}
            value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" variant={reset.step === 'request' ? 'warning' : 'outline'} fullWidth disabled={reset.busy !== null}>
            {reset.busy === 'request' ? '보내는 중…' : reset.step === 'request' ? '인증 코드 받기' : '인증 코드 다시 받기'}
          </Button>
        </form>

        {reset.message && <p role="status" className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-600">{reset.message}</p>}

        {reset.step === 'verify' && (
          <form onSubmit={handleVerify} className="mt-4 space-y-4">
            <input type="text" inputMode="numeric" maxLength={6} placeholder="인증 코드 6자리" autoComplete="one-time-code" className={FIELD}
              value={reset.code} onChange={(e) => reset.setCode(e.target.value)} required />
            <Button type="submit" variant="warning" fullWidth disabled={reset.busy !== null}>
              {reset.busy === 'verify' ? '확인 중…' : '인증 코드 확인'}
            </Button>
          </form>
        )}

        {reset.step === 'reset' && (
          <form onSubmit={handleReset} className="mt-4 space-y-4">
            <input type="password" placeholder="새 비밀번호 (6자 이상)" autoComplete="new-password" className={FIELD}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            <input type="password" placeholder="새 비밀번호 확인" autoComplete="new-password" className={FIELD}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            <Button type="submit" variant="warning" fullWidth disabled={reset.busy !== null}>
              {reset.busy === 'reset' ? '바꾸는 중…' : '비밀번호 재설정'}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm font-bold text-gray-500">이메일을 등록하지 않은 계정은 관리자에게 문의해 주세요.</p>

        <Link to="/login" className="mt-6 block text-center font-bold text-gray-600 hover:text-gray-700">
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
};

export default FindPassword;
