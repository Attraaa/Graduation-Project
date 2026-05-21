import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import FindId from './pages/FindId';
import FindPassword from './pages/FindPassword';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import Sidebar from './components/Sidebar';
import LearningSession from './pages/LearningSession';
import LearningHistory from './pages/LearningHistory';
import { DialogProvider } from './components/AppDialog';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen bg-[#f7f7f7]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8 pb-24 md:pb-8">
        <div className="mx-auto max-w-4xl h-full">
          {children}
        </div>
      </main>
    </div>
  );
}

function App() {
  useEffect(() => {
    const theme = localStorage.getItem('postureAI.theme') ?? 'light';
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
  }, []);

  return (
    <DialogProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/find-id" element={<FindId />} />
          <Route path="/find-password" element={<FindPassword />} />
          <Route
            path="/dashboard"
            element={
              <AppLayout>
                <Dashboard />
              </AppLayout>
            }
          />
          <Route
            path="/learn/:modeId"
            element={
              <AppLayout>
                <LearningSession />
              </AppLayout>
            }
          />
          <Route
            path="/statistics"
            element={
              <AppLayout>
                <Statistics />
              </AppLayout>
            }
          />
          <Route
            path="/history"
            element={
              <AppLayout>
                <LearningHistory />
              </AppLayout>
            }
          />
          <Route
            path="/settings"
            element={
              <AppLayout>
                <Settings />
              </AppLayout>
            }
          />
        </Routes>
      </HashRouter>
    </DialogProvider>
  );
}

export default App;
