import type React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart2, Settings, LogOut, CalendarDays } from 'lucide-react';
import { logoutUser } from '../utils/authStore';
import { useDialog } from './AppDialog';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useDialog();

  const navItems = [
    { name: '학습', path: '/dashboard', icon: <Home size={28} /> },
    { name: '통계', path: '/statistics', icon: <BarChart2 size={28} /> },
    { name: '학습이력', path: '/history', icon: <CalendarDays size={28} /> },
    { name: '설정', path: '/settings', icon: <Settings size={28} /> },
  ];

  const handleLogout = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const confirmed = await confirm({
      title: '로그아웃',
      message: '현재 계정에서 로그아웃하시겠습니까?',
      tone: 'danger',
      confirmLabel: '로그아웃',
      cancelLabel: '취소',
    });
    if (!confirmed) return;
    logoutUser();
    navigate('/login');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t-2 border-gray-200 bg-white px-4 py-3 md:relative md:w-64 md:flex-col md:justify-start md:border-r-2 md:border-t-0 md:px-4 md:py-8">
      {/* Logo Area (Hidden on mobile) */}
      <div className="mb-10 hidden w-full px-4 md:block">
        <h1 className="text-3xl font-black text-[#26c281] tracking-tight">Moti</h1>
      </div>

      {/* Nav Items */}
      <nav className="flex w-full flex-row justify-around md:flex-col md:space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center rounded-2xl px-4 py-3 font-bold transition-colors ${
                isActive
                  ? 'bg-blue-50 text-[#1cb0f6] border-2 border-blue-200'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-center md:mr-4">{item.icon}</div>
              <span className="hidden uppercase md:block">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Area */}
      <div className="mt-auto hidden w-full space-y-2 md:block">
        <Link
          to="/login"
          onClick={handleLogout}
          className="flex w-full items-center rounded-2xl px-4 py-3 font-bold text-[#d94b4b] transition-colors hover:bg-red-50 hover:text-[#c73737]"
        >
          <div className="flex items-center justify-center md:mr-4"><LogOut size={28} /></div>
          <span className="hidden uppercase md:block">로그아웃</span>
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;
