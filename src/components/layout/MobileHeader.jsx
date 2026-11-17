import { CloudAlert, FlaskConical, HardDrive } from 'lucide-react';
import { Link } from 'react-router';
import { useData } from '../../hooks/useData.js';
import { useBackend } from '../../hooks/useBackend.js';
import { SYNC_STATE } from '../../services/sync/remoteSync.js';
import { usePaths } from '../../hooks/useWorkspace.js';
import { StreakButton } from './StreakButton.jsx';
import { Brand } from './Brand.jsx';
import { Avatar } from '../ui/Avatar.jsx';

/** Barra superior compacta do celular: marca + sequência de dias. */
export function MobileHeader() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { settings } = useData();
  const backend = useBackend();
  const syncError = backend.mode === 'remote' && backend.syncStatus?.state === SYNC_STATE.ERROR;

  return (
    <header className="mobile-header">
      <Brand to={ROUTES.dashboard} label="ReadTrack, ir para o painel" />
      <div className="mobile-header__end">
        {backend.mode === 'demo' && (
          <span className="mobile-header__mode" aria-label="Demonstração com dados fictícios">
            <FlaskConical size={14} aria-hidden="true" />
            <span aria-hidden="true">Demo</span>
          </span>
        )}
        {backend.mode === 'local' && (
          <Link to={ROUTES.settings} className="mobile-header__mode" aria-label="Modo local: os dados ficam só neste navegador. Abrir configurações">
            <HardDrive size={14} aria-hidden="true" />
            <span aria-hidden="true">Local</span>
          </Link>
        )}
        {syncError && (
          <Link to={ROUTES.settings} className="mobile-header__mode is-error" aria-label="Erro ao salvar na conta. Abrir configurações">
            <CloudAlert size={14} aria-hidden="true" />
            <span aria-hidden="true">Erro</span>
          </Link>
        )}
        <StreakButton />
        <Link to={ROUTES.settings} className="mobile-header__avatar" aria-label="Perfil e aparência">
          <Avatar src={settings.avatarUrl} name={settings.userName || backend.user?.email || ''} size={32} />
        </Link>
      </div>
    </header>
  );
}
