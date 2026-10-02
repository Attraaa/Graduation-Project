import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import Button from '../components/Button';

const FindId = () => {
  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1cb0f6] shadow-sm">
            <Search size={40} className="text-white" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#1cb0f6]">아이디 찾기</h1>
          <p className="text-center text-gray-500 font-bold">
            서버 계정의 아이디 찾기는 아직 지원하지 않습니다.
          </p>
        </div>

        <p className="rounded-2xl bg-gray-50 p-4 text-sm font-bold text-gray-600">
          가입한 아이디가 기억나지 않으면 관리자에게 문의해 주세요. 다른 사용자의 계정 목록은 표시하지 않습니다.
        </p>

        <Link to="/login" className="mt-6 block">
          <Button type="button" variant="primary" fullWidth>
            로그인으로 돌아가기
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default FindId;
