import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import Button from '../components/Button';
import { findId } from '../utils/authStore';

const FindId = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMessage((await findId(email)).message);
    setSending(false);
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1cb0f6] shadow-sm">
            <Search size={40} className="text-white" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#1cb0f6]">아이디 찾기</h1>
          <p className="text-center text-gray-500 font-bold">
            가입할 때 등록한 이메일로 아이디를 보내 드립니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="이메일"
            autoComplete="email"
            className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {message && <p role="status" className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-600">{message}</p>}
          <Button type="submit" variant="secondary" fullWidth disabled={sending}>
            {sending ? '보내는 중…' : '아이디 찾기'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm font-bold text-gray-500">이메일을 등록하지 않은 계정은 관리자에게 문의해 주세요.</p>

        <Link to="/login" className="mt-6 block text-center font-bold text-gray-600 hover:text-gray-700">
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
};

export default FindId;
