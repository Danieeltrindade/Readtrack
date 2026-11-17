import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useData } from '../../hooks/useData.js';
import { FlameIcon } from '../ui/FlameIcon.jsx';
import { calculateStreakFromLedger } from '../../utils/stats.js';
import { getReadingDayKeys } from '../../utils/ledger.js';
import { addDays, fromDateKey, startOfWeek, toDateKey } from '../../utils/date.js';
import { formatShortDate, formatWeekdayShort, pluralize } from '../../utils/format.js';
import './StreakButton.css';

/**
 * Sequência de dias lendo, sempre no topo (celular e computador).
 * Chama acesa quando você já leu hoje; apagada em 0. Toque abre um resumo
 * com a semana e o recorde.
 */
export function StreakButton() {
  const { ledger, settings } = useData();
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef(null);
  const now = new Date();
  const todayKey = toDateKey(now);
  const streak = useMemo(() => calculateStreakFromLedger(ledger), [ledger]);
  const dayKeys = useMemo(() => new Set(getReadingDayKeys(ledger)), [ledger]);
  const lastKey = useMemo(() => [...dayKeys].sort().at(-1) ?? null, [dayKeys]);
  const weekStart = startOfWeek(now, settings.weekStartsOn);
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onClick);
    };
  }, [open]);

  const lit = streak.current > 0;
  const title = !lit ? 'Sequência apagada' : streak.readToday ? `${pluralize(streak.current, 'dia seguido', 'dias seguidos')}` : `${pluralize(streak.current, 'dia seguido', 'dias seguidos')} — leia hoje`;
  const text = !lit
    ? lastKey
      ? `Leia hoje para acender a chama. A última leitura foi em ${formatShortDate(fromDateKey(lastKey))}.`
      : 'Leia hoje para acender a chama.'
    : streak.readToday
      ? 'Você já leu hoje. Volte amanhã para continuar.'
      : 'Leia ainda hoje para não perder a sequência.';

  return (
    <div className="streak" ref={ref}>
      <button
        type="button"
        className={`streak__btn ${lit ? 'is-lit' : ''} ${lit && !streak.readToday ? 'is-risk' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Sequência: ${pluralize(streak.current, 'dia', 'dias')}. Ver detalhes`}
        onClick={() => setOpen((v) => !v)}
      >
        <FlameIcon lit={streak.readToday} size={20} />
        <span className="tabular">{streak.current}</span>
        <span className="streak__unit">{streak.current === 1 ? 'dia' : 'dias'}</span>
      </button>
      {open && (
        <div className="streak__pop" id={id} role="dialog" aria-label="Sequência de leitura">
          <div className="streak__head">
            <FlameIcon lit={streak.readToday} size={34} />
            <div>
              <p className="streak__title">{title}</p>
              <p className="streak__text">{text}</p>
            </div>
          </div>
          <ol className="streak__week" aria-label="Dias desta semana com leitura">
            {week.map((d) => {
              const key = toDateKey(d);
              const read = dayKeys.has(key);
              return (
                <li key={key} className={`${read ? 'is-read' : ''} ${key === todayKey ? 'is-today' : ''}`}>
                  <span className="streak__dot">{read && <FlameIcon lit size={15} />}</span>
                  <span aria-hidden="true">{formatWeekdayShort(d).charAt(0).toUpperCase()}</span>
                  <span className="visually-hidden">{`${formatWeekdayShort(d)}: ${read ? 'leu' : key > todayKey ? 'ainda não chegou' : 'não leu'}`}</span>
                </li>
              );
            })}
          </ol>
          <p className="streak__record">
            <span>Recorde</span>
            <strong>
              {pluralize(streak.longest, 'dia seguido', 'dias seguidos')}
              {streak.longestEnd ? ` · até ${formatShortDate(fromDateKey(streak.longestEnd))}` : ''}
            </strong>
          </p>
        </div>
      )}
    </div>
  );
}
