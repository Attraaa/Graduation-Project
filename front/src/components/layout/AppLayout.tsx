import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';

// App routes share one shell; each page owns only the content inside Outlet.
// Data-widget pages (dashboard, statistics, history) need a wider canvas; other pages keep their reading width.
const WIDE_PAGES = ['/dashboard', '/statistics', '/history'];

const AppLayout = () => {
  const pathname = useLocation().pathname;
  const wide = WIDE_PAGES.includes(pathname);
  return (
    <div className="flex h-screen w-screen bg-background">
      <Sidebar />
      <main className={`min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8 ${pathname === '/history' ? 'p-4 sm:p-6 md:p-8' : 'p-8'}`}>
        <div className={`mx-auto h-full ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
