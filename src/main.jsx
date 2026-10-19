import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './context/AuthProvider.jsx';
import { ToastProvider } from './context/ToastProvider.jsx';
import { AppRoutes } from './app/AppRoutes.jsx';
import { routerBasename } from './app/paths.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* basename: caminho de publicação (ex.: /readtrack no GitHub Pages). */}
    <BrowserRouter basename={routerBasename()}>
      <ToastProvider>
        {/* Login do Supabase para o site todo; cada espaço (/app, /demo) cria o próprio DataProvider. */}
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
