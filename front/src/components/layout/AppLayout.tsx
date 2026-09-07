import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar';

// App routes share one shell; each page owns only the content inside Outlet.
const AppLayout = () => (
  <div className="flex h-screen w-screen bg-background">
    <Sidebar />
    <main className="flex-1 overflow-y-auto p-8 pb-24 md:pb-8">
      <div className="mx-auto max-w-4xl h-full">
        <Outlet />
      </div>
    </main>
  </div>
);

export default AppLayout;
