import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import FindId from './pages/FindId';
import FindPassword from './pages/FindPassword';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import AppLayout from './components/layout/AppLayout';
import LearningSession from './pages/LearningSession';
import LearningHistory from './pages/LearningHistory';
import { DialogProvider } from './components/AppDialog';

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
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/learn/:modeId" element={<LearningSession />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/history" element={<LearningHistory />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </DialogProvider>
  );
}

export default App;
