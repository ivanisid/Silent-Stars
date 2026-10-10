import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/theme.css';
import './styles/skin-ferum.css';
import './styles/skin-karrakin.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { initTheme } from './theme';

// Before the first paint, so the saved theme doesn't flash the default one first.
initTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
