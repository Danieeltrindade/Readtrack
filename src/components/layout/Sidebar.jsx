import { NavLink } from 'react-router';
import { Cloud, CloudAlert, CloudOff, FlaskConical, HardDrive } from 'lucide-react';
import { useNavItems, usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useBackend } from '../../hooks/useBackend.js';
import { SYNC_STATE } from '../../services/sync/remoteSync.js';
import { Brand } from './Brand.jsx';
import './Sidebar.css';

/**
 * Navegação lateral. No desktop mostra ícone + texto; no tablet vira
 * um trilho só de ícones (o texto continua disponível para leitores de tela
 * e aparece como dica ao passar o mouse).
 */
export function Sidebar() {
  const { storage, activeSession } = useData();
  const backend = useBackend();
  const navItems = useNavItems();
  const paths = usePaths();
  const mainItems = navItems.filter((item) => item.section !== 'footer');
  const footerItems = navItems.filter((item) => item.section === 'footer');

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Brand to={paths.dashboard} label="ReadTrack, ir para o painel" />
      </div>

      <nav className="sidebar__nav" aria-label="Navegação principal">
        <ul>
          {mainItems.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} live={item.mobile === 'primary' && Boolean(activeSession)} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <ul>
          {footerItems.map((item) => (
            <li key={item.to}>
              <SidebarLink item={item} />
            </li>
          ))}
        </ul>
        <StorageStatus storage={storage} backend={backend} />
      </div>
    </aside>
  );
}

function SidebarLink({ item, live = false }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      className={({ isActive }) =>
        ['sidebar__link', isActive && 'is-active', item.mobile === 'primary' && 'sidebar__link--primary']
          .filter(Boolean)
          .join(' ')
      }
    >
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      <span className="sidebar__label">{item.label}</span>
      {live && (
        <span className="sidebar__live" title="Sessão em andamento">
          <span className="visually-hidden">(sessão em andamento)</span>
        </span>
      )}
    </NavLink>
  );
}

/** Onde os dados estão sendo salvos: conta (com estado da sincronização) ou navegador. */
function StorageStatus({ storage, backend }) {
  if (backend.mode === 'demo') {
    return (
      <p className="sidebar__storage" title="Demonstração: dados fictícios guardados só neste navegador, separados de qualquer conta">
        <FlaskConical size={14} aria-hidden="true" />
        <span>Demonstração · dados fictícios</span>
      </p>
    );
  }
  if (backend.mode === 'remote') {
    const state = backend.syncStatus?.state;
    const error = state === SYNC_STATE.ERROR;
    const label = error ? 'Erro ao salvar na conta' : state === SYNC_STATE.IDLE || !state ? 'Salvo na sua conta' : 'Salvando na conta…';
    const Icon = error ? CloudAlert : Cloud;
    return (
      <p className={`sidebar__storage ${error ? 'is-error' : ''}`} title={backend.user?.email}>
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
      </p>
    );
  }
  return (
    <p className="sidebar__storage" title={storage.canPersist ? 'Modo local: os dados ficam só neste navegador' : storage.message ?? undefined}>
      {storage.canPersist ? <HardDrive size={14} aria-hidden="true" /> : <CloudOff size={14} aria-hidden="true" />}
      <span>{storage.canPersist ? 'Modo local · neste navegador' : 'Dados não estão sendo salvos'}</span>
    </p>
  );
}
