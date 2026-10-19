import { useData } from './useData.js';
import { useNow } from './useNow.js';
import { TIMER_STATUS, getElapsedSeconds, getPauseCount, getPausedSeconds } from '../utils/timer.js';

/**
 * Sessão de leitura em andamento + valores derivados para a interface.
 * O relógio só re-renderiza (1x por segundo) enquanto está rodando.
 */
export function useActiveSession() {
  const { activeSession, books, actions } = useData();
  const running = activeSession?.status === TIMER_STATUS.RUNNING;
  const paused = activeSession?.status === TIMER_STATUS.PAUSED;
  // Pausado também atualiza (devagar) para o "pausado há X min".
  const now = useNow(running ? 1000 : 15000, Boolean(activeSession) && (running || paused));

  if (!activeSession) return { active: null, book: null, actions };

  return {
    active: activeSession,
    book: books.find((b) => b.id === activeSession.bookId) ?? null,
    status: activeSession.status,
    isRunning: running,
    isPaused: paused,
    isReviewing: activeSession.status === TIMER_STATUS.REVIEWING,
    elapsedSeconds: getElapsedSeconds(activeSession, now),
    pausedSeconds: getPausedSeconds(activeSession, now),
    pauseCount: getPauseCount(activeSession),
    actions,
  };
}
