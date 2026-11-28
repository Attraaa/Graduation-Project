import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/Button';
import { loginUser } from '../utils/authStore';
import motiIconUrl from '../assets/moti-icon.svg';
import { useDialog } from '../components/dialog/useDialog';
import { useSubmission } from '../hooks/useSubmission';

const Login = () => {
  const navigate = useNavigate();
  const { notify } = useDialog();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const { busy: submitting, run } = useSubmission();
  const passwordInput = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async signal => {
      setLoginError('');
      const result = await loginUser(userId, password, signal);
      if (signal.aborted) return;
      if (!result.ok) {
        setLoginError(result.message);
        await notify({ title: '로그인 실패', message: result.message, tone: 'warning' });
        if (!signal.aborted) passwordInput.current?.focus();
        return;
      }
      navigate('/dashboard');
    });
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl shadow-sm">
            <img src={motiIconUrl} alt="Moti" className="h-24 w-24 rounded-3xl" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#26c281]">Moti</h1>
          <p className="text-center text-gray-500 font-bold">
            AI 기반 VDT 증후군 교정 프로그램
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <label className="block space-y-1 text-sm font-semibold text-heading"><span>아이디</span><input
              type="text"
              autoComplete="username" aria-describedby={loginError ? 'login-error' : undefined}
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            /></label>
            <label className="block space-y-1 text-sm font-semibold text-heading"><span>비밀번호</span><input
              type="password"
              ref={passwordInput}
              autoComplete="current-password" aria-describedby={loginError ? 'login-error' : undefined}
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            /></label>
            {loginError && <p id="login-error" className="sr-only">{loginError}</p>}
          </div>

          <div className="flex justify-center gap-4 text-sm font-bold text-gray-600">
            <Link to="/find-id" className="hover:text-[#1cb0f6] transition">아이디 찾기</Link>
            <span>|</span>
            <Link to="/find-password" className="hover:text-[#1cb0f6] transition">비밀번호 재설정</Link>
          </div>

          <div className="space-y-3 pt-4">
            <Button type="submit" variant="primary" fullWidth disabled={submitting}>
              시작하기
            </Button>
            
            <Link to="/register" className="btn-duo block w-full border-b-2 border-border bg-surface px-4 py-3 text-center text-heading hover:bg-surface-muted">
              회원가입
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
