import { splitClock } from '../../../utils/format.js';

function describe(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h && `${h} ${h === 1 ? 'hora' : 'horas'}`, `${m} ${m === 1 ? 'minuto' : 'minutos'}`, `${s} ${s === 1 ? 'segundo' : 'segundos'}`]
    .filter(Boolean)
    .join(', ');
}

/**
 * Relógio HH:MM:SS. Cada dígito tem largura fixa, então os números não
 * "dançam" a cada segundo. role="timer" não é anunciado a cada mudança
 * pelos leitores de tela (aria-live implícito "off").
 */
export function TimerDisplay({ seconds, paused = false, size = 'lg' }) {
  const { hours, minutes, seconds: secs } = splitClock(seconds);
  const groups = [
    [hours, 'h'],
    [minutes, 'min'],
    [secs, 's'],
  ];
  return (
    <div
      className={`timer-display timer-display--${size} ${paused ? 'is-paused' : ''}`}
      role="timer"
      aria-label={`Tempo lido: ${describe(Math.floor(seconds))}`}
    >
      {groups.map(([value, unit], index) => (
        <span key={unit} className="timer-display__group" aria-hidden="true">
          {index > 0 && <span className="timer-display__colon">:</span>}
          {[...value].map((digit, i) => (
            <span key={i} className="timer-display__digit">
              {digit}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
