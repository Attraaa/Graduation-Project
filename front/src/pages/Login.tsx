import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/Button';
import { api, setToken } from '../utils/api';
import motiIconUrl from '../assets/moti-icon.svg';
import { useDialog } from '../components/AppDialog';

const Login = () => {
  const navigate = useNavigate();
  const { notify } = useDialog();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const data = await api.post<{ token: string; user: { id: number; username: string; nickname: string } }>(
        '/api/auth/login',
        { username: userId, password },
      );
      setToken(data.token);
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('postureAI.currentUser', JSON.stringify({ id: data.user.username, nickname: data.user.nickname }));
      navigate('/dashboard');
    } catch (err) {
      void notify({ title: '로그인 실패', message: (err as Error).message, tone: 'warning' });
    }
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
            <input
              type="text"
              placeholder="아이디"
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="비밀번호"
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-center gap-4 text-sm font-bold text-gray-600">
            <Link to="/find-id" className="hover:text-[#1cb0f6] transition">아이디 찾기</Link>
            <span>|</span>
            <Link to="/find-password" className="hover:text-[#1cb0f6] transition">비밀번호 찾기</Link>
          </div>

          {/* 로그인 api 연동해야함 */}
          <Link to="/login" className="block">
            <Button type="button" variant="outline" fullWidth>
              로그인
            </Button>
          </Link>
          <div className="space-y-3 pt-4">
            <Button type="submit" variant="primary" fullWidth>
              시작하기
            </Button>
            
            <Link to="/register" className="block">
              <Button type="button" variant="outline" fullWidth>
                회원가입
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
