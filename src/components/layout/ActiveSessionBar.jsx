import { Link, useLocation } from 'react-router';
import { Pause, Play } from 'lucide-react';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useActiveSession } from '../../hooks/useActiveSession.js';
import { formatClock } from '../../utils/format.js';
import './ActiveSessionBar.css';

/**
 * Lembrete da sessão em andamento fora da página do cronômetro.
 * Desktop: faixa no topo do conteúdo. Celular: pílula acima da barra inferior.
 */
export function ActiveSessionBar() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { pathname } = useLocation();
  const { active, book, isRunning, isPaused, isReviewing, elapsedSeconds, actions } = useActiveSession();
  if (!active || !book || pathname === ROUTES.reading) return null;

  const label = isReviewing ? 'Aguardando registro' : isRunning ? 'Lendo' : 'Pausado';

  return (
    <aside className={`session-bar ${isRunning ? 'is-running' : ''}`} aria-label="Sessão de leitura em andamento">
      <Link to={ROUTES.reading} className="session-bar__link">
        <span className="session-bar__dot" aria-hidden="true" />
        <span className="session-bar__text">
          <span className="session-bar__label">{label}</span>
          <span className="session-bar__title">{book.title}</span>
        </span>
        <span className="session-bar__clock tabular">{formatClock(elapsedSeconds)}</span>
        <span className="visually-hidden">Abrir cronômetro</span>
      </Link>
      {!isReviewing && (
        <button
          type="button"
          className="session-bar__toggle"
          onClick={isRunning ? actions.pauseSession : actions.resumeSession}
          aria-label={isRunning ? 'Pausar leitura' : 'Continuar leitura'}
        >
          {isPaused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
      )}
    </aside>
  );
}
