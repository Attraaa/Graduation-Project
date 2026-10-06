import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';

// App routes share one shell; each page owns only the content inside Outlet.
// The data-widget dashboard needs a wider canvas; other pages keep their reading width.
const AppLayout = () => {
  const wide = useLocation().pathname === '/dashboard';
  return (
    <div className="flex h-screen w-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8 pb-24 md:pb-8">
        <div className={`mx-auto h-full ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
