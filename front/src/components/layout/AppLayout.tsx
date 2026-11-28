import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import Sidebar from '../Sidebar';
import MonitoringProvider from '../../features/session/MonitoringProvider';
import DiagnosticsReporter from '../../features/diagnostics/DiagnosticsReporter';
import RecordingStatus from '../../features/records/RecordingStatus';
import { discardUnsavedRecordings } from '../../features/records/recording';
import { currentSessionIdentity, isCurrentSession, readSession, subscribeSession } from '../../utils/apiClient';

// App routes share one shell; each page owns only the content inside Outlet.
// Widget pages (dashboard, statistics, history, AI review, settings) need a wider canvas; other pages keep their reading width.
const WIDE_PAGES = ['/dashboard', '/statistics', '/history', '/ai-review', '/settings'];

const AppLayout = () => {
  const pathname = useLocation().pathname;
  const main = useRef<HTMLElement>(null);
  const session = useSyncExternalStore(subscribeSession, currentSessionIdentity, currentSessionIdentity);
  useEffect(() => { main.current?.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    let previous = readSession();
    return subscribeSession(() => {
      if (previous && !isCurrentSession(previous)) {
        discardUnsavedRecordings(previous.user.id);
        window.dispatchEvent(new Event('moti-stop-measurement'));
      }
      previous = readSession();
    });
  }, []);
  const wide = WIDE_PAGES.includes(pathname);
  // The home columns are sized to fit the default 1100×800 window, so 학습 keeps a smaller margin.
  const padding = pathname === '/dashboard' ? 'p-3 pb-[4.5rem] md:p-5' : 'p-4 pb-24 sm:p-6 md:p-8 md:pb-8';
  if (!session) return <Navigate to="/login" replace />;
  return (
    <MonitoringProvider key={session}><DiagnosticsReporter /><div className="flex h-screen w-screen bg-background">
      <Sidebar />
      <main ref={main} className={`min-w-0 flex-1 overflow-y-auto ${padding}`}>
        <div className={`mx-auto flex h-full min-w-0 flex-col ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
          <RecordingStatus errorsOnly />
          <div className="min-h-0 min-w-0 flex-1"><Outlet /></div>
        </div>
      </main>
    </div></MonitoringProvider>
  );
};

export default AppLayout;
