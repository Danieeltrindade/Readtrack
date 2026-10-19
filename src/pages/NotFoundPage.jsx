import { MapPinOff } from 'lucide-react';
import { Button, EmptyState } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { usePaths } from '../hooks/useWorkspace.js';
import { AuthFrame } from '../features/auth/AuthScreens.jsx';
import { PUBLIC_ROUTES } from '../app/paths.js';

/** Endereço inexistente dentro do app (/app/... ou /demo/...). */
export default function NotFoundPage() {
  useDocumentTitle('Página não encontrada');
  const paths = usePaths();
  return (
    <div className="page">
      <EmptyState
        titleAs="h1"
        icon={MapPinOff}
        title="Página não encontrada"
        description="O endereço digitado não existe no ReadTrack. Confira o link ou volte ao painel."
        action={<Button to={paths.dashboard}>Voltar ao painel</Button>}
      />
    </div>
  );
}

/** Endereço inexistente fora do app. */
export function PublicNotFoundPage() {
  useDocumentTitle('Página não encontrada');
  return (
    <AuthFrame labelledBy="not-found-title">
      <h1 id="not-found-title" className="auth__title">
        Página não encontrada
      </h1>
      <p className="auth__lead">O endereço digitado não existe no ReadTrack. Confira o link ou volte à página inicial.</p>
      <Button to={PUBLIC_ROUTES.home} icon={MapPinOff}>
        Ir para a página inicial
      </Button>
    </AuthFrame>
  );
}
