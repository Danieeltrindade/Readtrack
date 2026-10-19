import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout.jsx';
import { LoadingState } from '../components/ui';
import { AccountWorkspace } from '../context/AccountWorkspace.jsx';
import { DemoWorkspace } from '../context/DemoWorkspace.jsx';
import { ROUTES } from './routes.js';
import { PUBLIC_ROUTES, routePath } from './paths.js';

// Cada página vira um arquivo JS separado, baixado só quando visitado.
const LandingPage = lazy(() => import('../features/public/LandingPage.jsx'));
const LoginPage = lazy(() => import('../features/auth/AuthPages.jsx').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../features/auth/AuthPages.jsx').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('../features/auth/AuthPages.jsx').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('../features/auth/AuthPages.jsx').then((m) => ({ default: m.ResetPasswordPage })));
const PublicNotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx').then((m) => ({ default: m.PublicNotFoundPage })));

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage.jsx'));
const LibraryPage = lazy(() => import('../features/library/LibraryPage.jsx'));
const BookDetailPage = lazy(() => import('../features/books/BookDetailPage.jsx'));
const BookFormPage = lazy(() => import('../features/books/BookFormPage.jsx'));
const PastBookFormPage = lazy(() => import('../features/books/PastBookFormPage.jsx'));
const ReadingPage = lazy(() => import('../features/reading/ReadingPage.jsx'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage.jsx'));
const StatisticsPage = lazy(() => import('../features/statistics/StatisticsPage.jsx'));
const GoalsPage = lazy(() => import('../features/goals/GoalsPage.jsx'));
const HistoryPage = lazy(() => import('../features/history/HistoryPage.jsx'));
const ImportHistoryPage = lazy(() => import('../features/history/ImportHistoryPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

const loading = <LoadingState label="Carregando página…" />;

/**
 * Rotas do site:
 *   /                 página inicial pública
 *   /demo/...         demonstração (dados fictícios, sem login)
 *   /login, /register, /forgot-password, /reset-password
 *   /app/...          área pessoal (exige login quando o Supabase está configurado)
 * /demo e /app usam as MESMAS telas (WorkspaceRoutes), cada uma com seus dados.
 */
export function AppRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route index element={<LandingPage />} />
        <Route path={routePath(PUBLIC_ROUTES.login)} element={<LoginPage />} />
        <Route path={routePath(PUBLIC_ROUTES.register)} element={<RegisterPage />} />
        <Route path={routePath(PUBLIC_ROUTES.forgotPassword)} element={<ForgotPasswordPage />} />
        <Route path={routePath(PUBLIC_ROUTES.resetPassword)} element={<ResetPasswordPage />} />
        <Route
          path={`${routePath(PUBLIC_ROUTES.demo)}/*`}
          element={
            <DemoWorkspace>
              <WorkspaceRoutes />
            </DemoWorkspace>
          }
        />
        <Route
          path={`${routePath(PUBLIC_ROUTES.app)}/*`}
          element={
            <AccountWorkspace>
              <WorkspaceRoutes />
            </AccountWorkspace>
          }
        />
        <Route path="*" element={<PublicNotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

/** Telas do app, com caminhos relativos ao espaço (/app ou /demo). */
function WorkspaceRoutes() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path={routePath(ROUTES.library)} element={<LibraryPage />} />
          <Route path={routePath(ROUTES.newBook)} element={<BookFormPage />} />
          <Route path={routePath(ROUTES.newPastBook)} element={<PastBookFormPage />} />
          <Route path={routePath(ROUTES.book())} element={<BookDetailPage />} />
          <Route path={routePath(ROUTES.editBook())} element={<BookFormPage />} />
          <Route path={routePath(ROUTES.reading)} element={<ReadingPage />} />
          <Route path={routePath(ROUTES.statistics)} element={<StatisticsPage />} />
          <Route path={routePath(ROUTES.goals)} element={<GoalsPage />} />
          <Route path={routePath(ROUTES.settings)} element={<SettingsPage />} />
          <Route path={routePath(ROUTES.history)} element={<HistoryPage />} />
          <Route path={routePath(ROUTES.importHistory)} element={<ImportHistoryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
