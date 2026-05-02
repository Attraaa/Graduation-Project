import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/Button';
import { MonitorUp } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if(email && password) {
      localStorage.setItem('isLoggedIn', 'true');
      navigate('/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-[#58cc02] shadow-sm">
            <MonitorUp size={48} className="text-white" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#58cc02]">바른자세</h1>
          <p className="text-center text-gray-500 font-bold">
            AI 기반 VDT 증후군 교정 프로그램
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <input
              type="text"
              placeholder="이메일 또는 아이디"
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          <div className="space-y-3 pt-4">
            <Button type="submit" variant="primary" fullWidth>
              시작하기
            </Button>
            
            <Link to="/register" className="block">
              <Button type="button" variant="outline" fullWidth>
                새 계정 만들기
              </Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
