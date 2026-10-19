import { NotebookText, Timer, TriangleAlert } from 'lucide-react';
import { formatDurationText, getDurationDivergence } from '../../../utils/duration.js';
import { formatDuration } from '../../../utils/format.js';
import { isManualSession } from '../../../utils/pages.js';

/** Origem da sessão: cronometrada pelo app ou registro manual. */
export function SourceBadge({ session, compact = false }) {
  const manual = isManualSession(session);
  const Icon = manual ? NotebookText : Timer;
  return (
    <span className={`source-badge ${manual ? 'source-badge--manual' : ''}`}>
      <Icon size={13} aria-hidden="true" />
      {manual ? 'Registro manual' : compact ? 'Cronômetro' : 'Cronometrada'}
    </span>
  );
}

/**
 * Duração registrada, como se anotou (h:mm:ss nos registros manuais).
 * Sem duração conhecida: diz isso, sem inventar. Com divergência em
 * relação aos horários: aviso discreto com os dois valores.
 */
export function SessionDuration({ session }) {
  const manual = isManualSession(session);
  if (session.durationSeconds === null || session.durationSeconds === undefined) {
    return <span className="session-duration session-duration--unknown">duração não informada</span>;
  }
  const divergence = getDurationDivergence(session);
  return (
    <span className="session-duration">
      {manual ? formatDurationText(session.durationSeconds) : formatDuration(session.durationSeconds)}
      {divergence && (
        <span
          className="session-duration__warning"
          title={`Duração anotada ${formatDurationText(divergence.recorded)} · pelos horários ${formatDurationText(divergence.calculated)}`}
        >
          <TriangleAlert size={13} aria-hidden="true" />
          <span className="visually-hidden">
            {' '}
            (difere dos horários: anotada {formatDurationText(divergence.recorded)}, calculada {formatDurationText(divergence.calculated)})
          </span>
        </span>
      )}
    </span>
  );
}
