import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PilotSelectPage from './pages/PilotSelectPage.jsx';
import PilotProfilePage from './pages/PilotProfilePage.jsx';

function RequireAuth({ children }) {
  const { isAuthed, ready } = useAuth();
  if (!ready) return null;
  if (!isAuthed) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
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
      <Route path="*" element={<Navigate to="/pilots" replace />} />
    </Routes>
  );
}
