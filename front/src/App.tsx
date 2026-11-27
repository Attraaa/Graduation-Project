import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import FindId from './pages/FindId';
import FindPassword from './pages/FindPassword';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import AiReview from './pages/AiReview';
import AppLayout from './components/layout/AppLayout';
import LearningHistory from './pages/LearningHistory';
import { DialogProvider } from './components/AppDialog';
import WindowTitleBar from './components/layout/WindowTitleBar';
import { MODAL_VISIBILITY_EVENT } from './components/dialog/modalEvents';
import './components/dialog/modal.css';
import SystemNotifications from './features/notifications/SystemNotifications';

function App() {
  useEffect(() => {
    const theme = localStorage.getItem('postureAI.theme') ?? 'light';
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
    const syncTheme = () => {
      const theme = document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
      void window.motiWindow?.setTheme(theme, !!document.querySelector('dialog:modal'))
        .catch(error => console.error('창 테마 적용 실패', error));
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener(MODAL_VISIBILITY_EVENT, syncTheme);
    return () => { observer.disconnect(); document.removeEventListener(MODAL_VISIBILITY_EVENT, syncTheme); };
  }, []);

  return (
    <div className={window.motiWindow ? 'desktop-window' : undefined}>
      <WindowTitleBar />
      <HashRouter>
        <DialogProvider>
          <SystemNotifications />
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/find-id" element={<FindId />} />
            <Route path="/find-password" element={<FindPassword />} />
            {/* The monitoring detail screen was removed on 2026-11-21; old links open the home cards. */}
            <Route path="/learn/*" element={<Navigate to="/dashboard" replace />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/history" element={<LearningHistory />} />
              <Route path="/ai-review" element={<AiReview />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </DialogProvider>
      </HashRouter>
    </div>
  );
}

export default App;
