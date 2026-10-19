import { useState } from 'react';
import { Link } from 'react-router';
import { CloudUpload, HardDrive, TriangleAlert, X } from 'lucide-react';
import { useBackend } from '../../hooks/useBackend.js';
import { SYNC_STATE } from '../../services/sync/remoteSync.js';
import { usePaths } from '../../hooks/useWorkspace.js';
import { pluralize } from '../../utils/format.js';

/**
 * Avisos sobre ONDE os dados estão:
 * - modo local ativo (Supabase não configurado, configuração inválida ou escolha do usuário);
 * - falha ao salvar no banco, com nova tentativa;
 * - dados do modo local que ainda não foram enviados para a conta.
 */
export function BackendNotice() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const backend = useBackend();
  const [dismissed, setDismissed] = useState(false);

  // A demonstração tem a própria faixa (DemoBar).
  if (backend.mode === 'demo') return null;

  if (backend.mode === 'local') {
    if (backend.localReason === 'invalid-config') {
      return (
        <div className="storage-notice" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>
            <strong>Configuração do Supabase inválida — usando o modo local.</strong> {backend.configProblem}
          </p>
        </div>
      );
    }
    if (dismissed) return null;
    return (
      <div className="storage-notice storage-notice--info" role="status">
        <HardDrive size={18} aria-hidden="true" />
        <p>
          <strong>Modo local:</strong>{' '}
          o Supabase não está configurado nesta instalação; os dados ficam só neste navegador.{' '}
          <Link to={ROUTES.settings}>Saiba mais</Link>
        </p>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Fechar aviso do modo local">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (backend.syncStatus?.state === SYNC_STATE.ERROR) {
    return (
      <div className="storage-notice" role="alert">
        <TriangleAlert size={18} aria-hidden="true" />
        <p>
          <strong>Não foi possível salvar no banco.</strong> {backend.syncStatus.error?.message} Suas alterações continuam
          nesta tela e serão enviadas na próxima tentativa.{' '}
          <button type="button" className="storage-notice__link" onClick={backend.retrySync}>
            Tentar agora
          </button>
        </p>
      </div>
    );
  }

  const { summary, marker } = backend.migration;
  if (!summary.isEmpty && !marker && !dismissed) {
    return (
      <div className="storage-notice storage-notice--info" role="status">
        <CloudUpload size={18} aria-hidden="true" />
        <p>
          Este navegador tem {pluralize(summary.books, 'livro')} e {pluralize(summary.sessions, 'sessão', 'sessões')} do modo
          local que ainda não estão na sua conta. <Link to={ROUTES.settings}>Revisar e enviar</Link>{' '}
          <button type="button" className="storage-notice__link" onClick={backend.migration.dismiss}>
            Agora não
          </button>
        </p>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Fechar aviso de migração">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return null;
}
