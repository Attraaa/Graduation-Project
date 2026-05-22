import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import Button from '../components/Button';
import { findUserById } from '../utils/authStore';

const FindPassword = () => {
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = findUserById(userId);
    setMessage(
      user
        ? '등록된 계정을 확인했습니다. 실제 서비스에서는 본인 인증 후 비밀번호 재설정 링크를 제공합니다.'
        : '입력한 아이디로 가입된 계정을 찾을 수 없습니다.',
    );
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
            아이디를 입력하면 비밀번호 재설정 절차를 안내합니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="아이디"
            className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          />
          {message && <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-600">{message}</p>}
          <Button type="submit" variant="warning" fullWidth>
            계정 확인
          </Button>
        </form>

        <Link to="/login" className="mt-6 block text-center font-bold text-gray-600 hover:text-gray-700">
          로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
};

export default FindPassword;
