import { useState } from 'react';
import type React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart2, Settings, LogOut, CalendarDays, Sparkles, Ellipsis } from 'lucide-react';
import { useMonitoring } from '../features/session/monitoringContext';
import { logoutAfterSaving } from '../utils/authStore';
import { useDialog } from './dialog/useDialog';
import OverlayButton from '../features/overlay/OverlayButton';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm, notify } = useDialog();
  const { upper, keyboard } = useMonitoring();
  const [leaving, setLeaving] = useState(false);
  const measuring = upper.controls.isRunning || keyboard.controls.isRunning;

  const navItems = [
    { name: '학습', path: '/dashboard', icon: <Home size={20} /> },
    { name: '통계', path: '/statistics', icon: <BarChart2 size={20} /> },
    { name: '학습이력', path: '/history', icon: <CalendarDays size={20} /> },
    { name: 'AI 총평', path: '/ai-review', icon: <Sparkles size={20} /> },
    { name: '설정', path: '/settings', icon: <Settings size={20} /> },
  ];

  const handleLogout = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (leaving) return;
    const confirmed = await confirm({
      title: '로그아웃',
      message: measuring ? '측정 중이에요. 측정을 멈추고 지금까지의 기록을 저장한 뒤 로그아웃할까요?' : '현재 계정에서 로그아웃하시겠습니까?',
      tone: 'danger',
      confirmLabel: '로그아웃',
      cancelLabel: '취소',
    });
    if (!confirmed) return;
    // The last batches are sent with the current login, so the session is cleared only after they are saved.
    setLeaving(true);
    try {
      const left = await logoutAfterSaving(() => confirm({
        title: '기록 저장 실패',
        message: '마지막 측정 기록을 서버에 저장하지 못했어요. 로그아웃하면 저장하지 못한 기록은 사라져요. 그래도 로그아웃할까요?',
        tone: 'danger',
        confirmLabel: '그래도 로그아웃',
        cancelLabel: '취소',
      }));
      if (left) navigate('/login');
    } catch {
      await notify({ title: '로그아웃 실패', message: '이 기기에서 로그인 정보를 지우지 못했어요. 저장 설정을 확인한 뒤 다시 시도해 주세요.', tone: 'warning' });
    } finally { setLeaving(false); }
  };

  const accountActions = <>
    <OverlayButton />
    <Link to="/login" onClick={handleLogout}
      className="flex min-h-12 w-[60px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-danger-text transition-colors hover:bg-nav-active md:min-h-14">
      <LogOut size={20} aria-hidden="true" />
      <span className="text-center leading-tight">{leaving ? '기록 저장 중…' : '로그아웃'}</span>
    </Link>
  </>;
  return (
    // Wide screens: a 76px rail with the name under each icon (home 시안 27), so the camera columns get the width.
    // Narrow screens keep the icon bar along the bottom. The window title bar already shows "Moti".
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-border bg-surface px-1 py-1.5 md:relative md:w-[76px] md:shrink-0 md:flex-col md:border-r md:border-t-0 md:px-2 md:py-3">
      {/* Nav Items */}
      <nav aria-label="주 메뉴" className="grid w-full grid-cols-6 items-start gap-0.5 md:flex md:flex-col md:items-center md:gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors md:min-h-14 md:w-[60px] md:py-1.5 md:text-[11px] ${
                isActive ? 'bg-nav-active text-heading' : 'text-muted hover:bg-nav-active hover:text-heading'
              }`}
            >
              <span aria-hidden="true" className="flex items-center justify-center">{item.icon}</span>
              <span className="whitespace-nowrap leading-tight">{item.name}</span>
            </Link>
          );
        })}
        <details className="relative md:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-muted hover:bg-nav-active">
            <Ellipsis size={20} aria-hidden="true" /><span>더보기</span>
          </summary>
          <div className="absolute right-1 bottom-full mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg">
            {accountActions}
          </div>
        </details>
      </nav>

      {/* User Area */}
      <div className="mt-auto hidden w-full md:flex md:flex-col md:items-center md:gap-1">
        {accountActions}
      </div>
    </div>
  );
};

export default Sidebar;
