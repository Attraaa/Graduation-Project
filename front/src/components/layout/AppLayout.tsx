import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import Sidebar from '../Sidebar';
import MonitoringProvider from '../../features/session/MonitoringProvider';
import DiagnosticsReporter from '../../features/diagnostics/DiagnosticsReporter';

// App routes share one shell; each page owns only the content inside Outlet.
// Widget pages (dashboard, statistics, history, AI review, settings) need a wider canvas; other pages keep their reading width.
const WIDE_PAGES = ['/dashboard', '/statistics', '/history', '/ai-review', '/settings'];

const AppLayout = () => {
  const pathname = useLocation().pathname;
  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.scrollTo(0, 0); }, [pathname]);
  const wide = WIDE_PAGES.includes(pathname);
  // The home columns are sized to fit the default 1100×800 window, so 학습 keeps a smaller margin.
  const padding = pathname === '/dashboard' ? 'p-4 md:p-5' : pathname === '/history' ? 'p-4 sm:p-6 md:p-8' : 'p-8';
  return (
    <MonitoringProvider><DiagnosticsReporter /><div className="flex h-screen w-screen bg-background">
      <Sidebar />
      <main ref={main} className={`min-w-0 flex-1 overflow-y-auto pb-24 ${pathname === '/dashboard' ? 'md:pb-5' : 'md:pb-8'} ${padding}`}>
        <div className={`mx-auto h-full ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
          <Outlet />
        </div>
      </main>
    </div></MonitoringProvider>
  );
};

export default AppLayout;
