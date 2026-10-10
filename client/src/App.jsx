import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { start as startCascade } from './cascade/engine.js';
import { useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PilotSelectPage from './pages/PilotSelectPage.jsx';
import PilotProfilePage from './pages/PilotProfilePage.jsx';
import GmPanelPage from './pages/GmPanelPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import ReservesPage from './pages/ReservesPage.jsx';

function RequireAuth({ children }) {
  const { isAuthed, ready } = useAuth();
  if (!ready) return null;
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

// Каскад NHP — один рушій на застосунок. Без руху (prefers-reduced-motion) не запускається.
function useCascade() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    return startCascade();
  }, []);
}

export default function App() {
  useCascade();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pilots"
        element={
          <RequireAuth>
            <PilotSelectPage />
          </RequireAuth>
        }
      />
      <Route
        path="/pilots/:id"
        element={
          <RequireAuth>
            <PilotProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/board"
        element={
          <RequireAuth>
            <BoardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/reserves"
        element={
          <RequireAuth>
            <ReservesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/gm"
        element={
          <RequireAuth>
            <GmPanelPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/pilots" replace />} />
    </Routes>
  );
}
