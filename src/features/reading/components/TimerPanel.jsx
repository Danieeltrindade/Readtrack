import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Flag, Pause, Play, X } from 'lucide-react';
import { BookCover, Button, ConfirmDialog, ProgressBar } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { useActiveSession } from '../../../hooks/useActiveSession.js';
import { formatDuration, formatNumber, formatRelativeDay, formatTime, pluralize } from '../../../utils/format.js';
import { getDashboardSummary } from '../../../utils/stats.js';
import { TimerDisplay } from './TimerDisplay.jsx';

/** Cronômetro em andamento ou pausado, com os controles. */
export function TimerPanel() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { book, active, elapsedSeconds, pausedSeconds, pauseCount, isRunning, isPaused, actions } = useActiveSession();
  const { books, sessions, goals, ledger, settings } = useData();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Meta do dia = minutos já salvos hoje + esta sessão.
  const today = getDashboardSummary({ books, sessions, goals, ledger }, new Date(), settings.weekStartsOn).today;
  const todayMinutes = today.minutes + Math.floor(elapsedSeconds / 60);

  // Atalho de teclado: Espaço pausa/continua (fora de campos e botões).
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const tag = event.target.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) || event.target.isContentEditable) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      if (isRunning) actions.pauseSession();
      else if (isPaused) actions.resumeSession();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isRunning, isPaused, actions]);

  return (
    <div className="timer-panel">
      <div className="timer-panel__book">
        <BookCover book={book} size="sm" />
        <div>
          <p className="timer-panel__kicker">{isRunning ? 'Lendo agora' : 'Pausado'}</p>
          <h2 className="timer-panel__title">
            <Link to={ROUTES.book(book.id)}>{book.title}</Link>
          </h2>
          <p className="timer-panel__author">{book.author}</p>
        </div>
      </div>

      <div className={`timer-panel__clock ${isPaused ? 'is-paused' : 'is-running'}`}>
        <TimerDisplay seconds={elapsedSeconds} paused={isPaused} />
        <p className="timer-panel__state" aria-live="polite">
          <span className={`timer-panel__dot ${isRunning ? 'is-running' : ''}`} aria-hidden="true" />
          {isRunning ? 'Cronômetro rodando' : 'Pausado — o tempo parado não conta'}
        </p>
        <p className="timer-panel__meta">
          Iniciada {formatRelativeDay(active.startedAt) === 'hoje' ? '' : `${formatRelativeDay(active.startedAt)} `}às{' '}
          {formatTime(active.startedAt)}, a partir da página {formatNumber(active.startPage)}
          {pauseCount > 0 && `. ${pluralize(pauseCount, 'pausa')}, ${formatDuration(pausedSeconds)} pausado`}
        </p>
      </div>

      <div className="timer-panel__controls">
        <Button variant="ghost" icon={X} onClick={() => setConfirmCancel(true)} className="timer-panel__cancel">
          Cancelar
        </Button>
        {isRunning ? (
          <button type="button" className="timer-toggle" onClick={actions.pauseSession}>
            <Pause size={30} aria-hidden="true" />
            <span>Pausar</span>
          </button>
        ) : (
          <button type="button" className="timer-toggle is-paused" onClick={actions.resumeSession}>
            <Play size={30} aria-hidden="true" />
            <span>Continuar</span>
          </button>
        )}
        <Button variant="secondary" icon={Flag} onClick={actions.reviewSession} className="timer-panel__finish">
          Finalizar
        </Button>
      </div>
      <p className="timer-panel__shortcut">
        Dica: a tecla <kbd>Espaço</kbd> pausa e continua.
      </p>

      {goals.dailyMinutes ? (
        <div className="timer-panel__goal">
          <div className="timer-panel__goal-text">
            <span>Meta de hoje</span>
            <span className="tabular">
              {formatNumber(todayMinutes)} de {formatNumber(goals.dailyMinutes)} min
            </span>
          </div>
          <ProgressBar
            value={(todayMinutes / goals.dailyMinutes) * 100}
            tone={todayMinutes >= goals.dailyMinutes ? 'success' : 'accent'}
            size="sm"
            label="Progresso da meta diária"
          />
        </div>
      ) : (
        <p className="timer-panel__goal timer-panel__goal-text">
          <span>Hoje</span>
          <span className="tabular">{formatNumber(todayMinutes)} min lidos</span>
        </p>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar esta sessão?"
        description={`Os ${formatDuration(elapsedSeconds)} desta leitura não serão registrados e o progresso do livro não muda.`}
        confirmLabel="Descartar sessão"
        cancelLabel="Continuar lendo"
        variant="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          actions.cancelSession();
          toast.info('Sessão cancelada. Nada foi registrado.');
        }}
      />
    </div>
  );
}
