import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Button from '../components/Button';
import { UserPlus } from 'lucide-react';
import { isDuplicateId, registerUser, requestEmailCode } from '../utils/authStore';
import { useDialog } from '../components/dialog/useDialog';
import { useSubmission } from '../hooks/useSubmission';

const Register = () => {
  const navigate = useNavigate();
  const { notify } = useDialog();
  const { busy, run } = useSubmission();
  const [formData, setFormData] = useState({
    nickname: '',
    userId: '',
    email: '',
    code: '',
    password: '',
    confirmPassword: ''
  });
  const [idMessage, setIdMessage] = useState('');
  const latestId = useRef('');
  // The address the latest code was mailed to. Editing the email afterwards needs a new code.
  const [codeSentTo, setCodeSentTo] = useState('');
  const [emailNotice, setEmailNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const codeSent = codeSentTo !== '' && codeSentTo === formData.email.trim();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = {...formData, [e.target.name]: e.target.value};
    setFormData(next);

    if (e.target.name === 'email') setEmailNotice(null);
    if (e.target.name === 'userId') {
      const value = e.target.value.trim();
      latestId.current = value;
      setIdMessage('');
      // Only the answer for the latest typed ID may update the message.
      if (value) void isDuplicateId(value).then(taken => {
        if (latestId.current === value) setIdMessage(taken ? '이미 사용 중인 아이디입니다.' : '사용 가능한 아이디입니다.');
      }).catch(() => {});
    }
  };

  const sendCode = async () => {
    const address = formData.email.trim();
    if (!address) {
      setEmailNotice({ text: '이메일을 먼저 입력해 주세요.', ok: false });
      return;
    }
    setSending(true);
    const result = await requestEmailCode(address);
    setSending(false);
    setEmailNotice({ text: result.message, ok: result.ok });
    if (result.ok) {
      setCodeSentTo(address);
      setFormData(current => ({ ...current, code: '' }));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async signal => {
      if (!formData.nickname.trim() || !formData.userId.trim() || !formData.email.trim() || !formData.password || !formData.confirmPassword) {
        await notify({ title: '입력 확인', message: '닉네임, 아이디, 이메일, 비밀번호, 비밀번호 확인을 모두 입력해 주세요.', tone: 'warning' });
        return;
      }
      if(formData.password !== formData.confirmPassword) {
        await notify({ title: '비밀번호 확인', message: '비밀번호가 일치하지 않습니다.', tone: 'warning' });
        return;
      }
      if (!codeSent) {
        await notify({ title: '이메일 인증', message: '이메일 옆의 "인증 코드 받기"를 눌러 메일로 받은 코드를 입력해 주세요.', tone: 'warning' });
        return;
      }
      if (!/^\d{6}$/.test(formData.code.trim())) {
        await notify({ title: '인증 코드 확인', message: '메일로 받은 6자리 인증 코드를 입력해 주세요.', tone: 'warning' });
        return;
      }
      const result = await registerUser({
        username: formData.userId.trim(),
        nickname: formData.nickname.trim(),
        email: formData.email.trim(),
        code: formData.code.trim(),
        password: formData.password,
      }, signal);
      if (signal.aborted) return;
      await notify({ title: result.ok ? '가입 완료' : '가입 실패', message: result.message, tone: result.ok ? 'success' : 'warning' });
      if (result.ok && !signal.aborted) navigate('/login');
    });
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
          <div>
            <div className="flex gap-2">
              <input
                type="email"
                name="email"
                placeholder="이메일"
                autoComplete="email"
                className="min-w-0 flex-1 rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
                value={formData.email}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={sending}
                className="shrink-0 rounded-2xl border-2 border-gray-200 bg-white px-4 font-bold text-gray-600 transition hover:border-[#1cb0f6] hover:text-[#1cb0f6] disabled:opacity-50"
              >
                {sending ? '보내는 중…' : codeSent ? '다시 받기' : '인증 코드 받기'}
              </button>
            </div>
            {emailNotice && (
              <p role="status" className={`mt-2 text-sm font-bold ${emailNotice.ok ? 'text-gray-500' : 'text-[#ff4b4b]'}`}>{emailNotice.text}</p>
            )}
            {codeSent && (
              <input
                type="text"
                name="code"
                placeholder="인증 코드 6자리"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="mt-3 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-4 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white"
                value={formData.code}
                onChange={handleChange}
                required
              />
            )}
            <p className="mt-2 text-sm font-bold text-gray-500">아이디를 찾거나 비밀번호를 재설정할 때 이 이메일로 보내 드려요.</p>
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
            <Button type="submit" variant="secondary" fullWidth disabled={busy}>
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
