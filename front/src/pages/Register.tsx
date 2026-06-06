import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/Button';
import { UserPlus } from 'lucide-react';
import { api } from '../utils/api';
import { useDialog } from '../components/AppDialog';

const Register = () => {
  const navigate = useNavigate();
  const { notify } = useDialog();
  const [formData, setFormData] = useState({
    nickname: '',
    userId: '',
    password: '',
    confirmPassword: ''
  });
  const [idMessage, setIdMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = {...formData, [e.target.name]: e.target.value};
    setFormData(next);

    if (e.target.name === 'userId') {
      const val = e.target.value.trim();
      if (!val) {
        setIdMessage('');
      } else {
        api.get<{ exists: boolean }>(`/api/auth/check/${val}`, false)
          .then(({ exists }) => setIdMessage(exists ? '이미 사용 중인 아이디입니다.' : '사용 가능한 아이디입니다.'))
          .catch(() => setIdMessage(''));
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nickname.trim() || !formData.userId.trim() || !formData.password || !formData.confirmPassword) {
      void notify({ title: '입력 확인', message: '닉네임, 아이디, 비밀번호, 비밀번호 확인을 모두 입력해 주세요.', tone: 'warning' });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      void notify({ title: '비밀번호 확인', message: '비밀번호가 일치하지 않습니다.', tone: 'warning' });
      return;
    }
    try {
      await api.post('/api/auth/register', {
        username: formData.userId,
        nickname: formData.nickname,
        password: formData.password,
      });
      await notify({ title: '가입 완료', message: '회원가입이 완료되었습니다. 로그인해 주세요.', tone: 'success' });
      navigate('/login');
    } catch (err) {
      void notify({ title: '가입 실패', message: (err as Error).message, tone: 'warning' });
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1cb0f6] shadow-sm">
            <UserPlus size={40} className="text-white" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#1cb0f6]">회원가입</h1>
          <p className="text-center text-gray-500 font-bold">
            Moti와 함께 건강한 습관을 만들어보세요!
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            name="nickname"
            placeholder="닉네임"
            className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
            value={formData.nickname}
            onChange={handleChange}
            required
          />
          <div>
            <input
              type="text"
              name="userId"
              placeholder="아이디"
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
              value={formData.userId}
              onChange={handleChange}
              required
            />
            {idMessage && (
              <p className={`mt-2 text-sm font-bold ${idMessage.includes('가능') ? 'text-[#58cc02]' : 'text-[#ff4b4b]'}`}>
                {idMessage}
              </p>
            )}
          </div>
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="비밀번호 확인"
            className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />

          <div className="space-y-3 pt-6">
            <Button type="submit" variant="secondary" fullWidth>
              가입하기
            </Button>
            
            <Link to="/login" className="block text-center mt-4">
              <span className="text-gray-600 font-bold hover:text-gray-700 transition">
                이미 계정이 있으신가요? 로그인
              </span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
