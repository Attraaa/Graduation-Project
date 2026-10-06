import type React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart2, Settings, LogOut, CalendarDays } from 'lucide-react';
import { logoutUser } from '../utils/authStore';
import { useDialog } from './dialog/useDialog';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useDialog();

  const navItems = [
    { name: '학습', path: '/dashboard', icon: <Home size={22} /> },
    { name: '통계', path: '/statistics', icon: <BarChart2 size={22} /> },
    { name: '학습이력', path: '/history', icon: <CalendarDays size={22} /> },
    { name: '설정', path: '/settings', icon: <Settings size={22} /> },
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
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-surface px-4 py-3 md:relative md:w-52 md:flex-col md:justify-start md:border-r md:border-t-0 md:px-3 md:py-6">
      {/* Logo Area (Hidden on mobile) */}
      <div className="mb-8 hidden w-full px-3 md:block">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading">
          Moti<span className="text-brand">.</span>
        </h1>
      </div>

      {/* Nav Items */}
      <nav className="flex w-full flex-row justify-around md:flex-col md:space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center rounded-xl px-3 py-2.5 font-semibold transition-colors ${
                isActive ? 'bg-nav-active text-heading' : 'text-muted hover:bg-nav-active hover:text-heading'
              }`}
            >
              <div className="flex items-center justify-center md:mr-3">{item.icon}</div>
              <span className="hidden md:block">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Area */}
      <div className="mt-auto hidden w-full md:block">
        <Link
          to="/login"
          onClick={handleLogout}
          className="flex w-full items-center rounded-xl px-3 py-2.5 font-semibold text-[#d94b4b] transition-colors hover:bg-red-50 hover:text-[#c73737]"
        >
          <div className="flex items-center justify-center md:mr-3"><LogOut size={22} /></div>
          <span className="hidden md:block">로그아웃</span>
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;
