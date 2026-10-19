import { Link } from 'react-router';
import { ArrowLeft, FlaskConical, LogOut, RefreshCw } from 'lucide-react';
import { Brand } from '../../components/layout/Brand.jsx';
import { Button, LoadingState } from '../../components/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PUBLIC_ROUTES } from '../../app/paths.js';
import './Auth.css';

/** Moldura comum das telas de conta: marca no topo e cartão centralizado. */
export function AuthFrame({ children, labelledBy, footer = true }) {
  return (
    <main className="auth" id="conteudo" aria-labelledby={labelledBy}>
      <div className="auth__brand">
        <Brand to={PUBLIC_ROUTES.home} />
      </div>
      <div className="auth__card">{children}</div>
      {footer && (
        <nav className="auth__footer" aria-label="Outras opções">
          <Link to={PUBLIC_ROUTES.home}>
            <ArrowLeft size={14} aria-hidden="true" /> Página inicial
          </Link>
          <Link to={PUBLIC_ROUTES.demo}>
            <FlaskConical size={14} aria-hidden="true" /> Experimentar demonstração
          </Link>
        </nav>
      )}
    </main>
  );
}

/** Supabase sem variáveis de ambiente: contas não existem nesta instalação. */
export function AccountsUnavailable({ problem }) {
  return (
    <div className="form-alert" role="alert">
      <p>
        <strong>As contas não estão disponíveis nesta instalação.</strong>{' '}
        {problem ?? 'O Supabase não foi configurado (faltam as variáveis de ambiente).'}
      </p>
      <p>
        Você pode <Link to={PUBLIC_ROUTES.demo}>experimentar a demonstração</Link> ou usar o{' '}
        <Link to={PUBLIC_ROUTES.app}>modo local</Link>, em que os dados ficam só neste navegador.
      </p>
    </div>
  );
}

export function BackendLoadingScreen({ label }) {
  useDocumentTitle('Carregando');
  return (
    <AuthFrame footer={false}>
      <LoadingState label={label} />
    </AuthFrame>
  );
}

export function BackendErrorScreen({ title, description, onRetry, onSignOut, homeLink = false }) {
  useDocumentTitle('Erro');
  return (
    <AuthFrame labelledBy="backend-error-title" footer={homeLink}>
      <div role="alert">
        <h1 id="backend-error-title" className="auth__title">
          {title}
        </h1>
        {description && <p className="auth__lead">{description}</p>}
      </div>
      <div className="auth__actions">
        {onRetry && (
          <Button icon={RefreshCw} onClick={onRetry}>
            Tentar novamente
          </Button>
        )}
        {onSignOut && (
          <Button variant="ghost" icon={LogOut} onClick={onSignOut}>
            Sair da conta
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}
