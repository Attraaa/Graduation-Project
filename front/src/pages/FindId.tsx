import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import Button from '../components/Button';
import { getUsers } from '../utils/authStore';

const FindId = () => {
  const users = getUsers();

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-white md:bg-[#f7f7f7]">
      <div className="w-full max-w-md p-8 md:card-duo">
        <div className="mb-8 flex flex-col items-center justify-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1cb0f6] shadow-sm">
            <Search size={40} className="text-white" />
          </div>
          <h1 className="text-center text-3xl font-black text-[#1cb0f6]">아이디 찾기</h1>
          <p className="text-center text-gray-500 font-bold">
            현재 목업 DB에 등록된 아이디를 확인합니다.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-gray-50 p-4">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 font-bold text-gray-700">
              <span>{user.nickname}</span>
              <span className="text-[#1cb0f6]">{user.id}</span>
            </div>
          ))}
        </div>

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
