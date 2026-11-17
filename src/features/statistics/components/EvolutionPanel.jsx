import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel } from '../../../components/ui';
import { summarizeRange } from '../../../utils/ledger.js';
import { addDays, addMonths, isWithin, startOfDay, startOfMonth, startOfWeek, toDateKey } from '../../../utils/date.js';
import { formatDuration, formatFullDate, formatNumber, formatShortDate, pluralize } from '../../../utils/format.js';

const VIEWS = [
  { id: 'acumulado', label: 'Acumulado' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'semanas', label: 'Semanas' },
];
const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const WEEKDAY_LETTERS = { monday: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'], sunday: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] };

/**
 * Evolução em três visões: páginas acumuladas no período (com os livros
 * concluídos marcados), calendário do mês por minutos lidos e as últimas
 * 12 semanas com a média. Tudo vem do livro-razão diário.
 */
export function EvolutionPanel({ ledger, books, range, now, weekStartsOn, periodLabel }) {
  const [view, setView] = useState('acumulado');
  return (
    <Panel
      title="Evolução"
      className="evo"
      action={
        <div className="segmented" role="group" aria-label="Visão da evolução">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
      }
    >
      {view === 'acumulado' && <Cumulative ledger={ledger} books={books} range={range} now={now} periodLabel={periodLabel} />}
      {view === 'calendario' && <Calendar ledger={ledger} now={now} anchor={addDays(range.end, -1)} weekStartsOn={weekStartsOn} />}
      {view === 'semanas' && <Weeks ledger={ledger} now={now} anchor={addDays(range.end, -1)} weekStartsOn={weekStartsOn} />}
    </Panel>
  );
}

/* ---------- Acumulado ---------- */

function Cumulative({ ledger, books, range, now, periodLabel }) {
  // Um dia só não forma curva: usa os 14 dias que terminam nele.
  const start = range.type === 'day' ? addDays(range.start, -13) : range.start;
  const tomorrow = addDays(startOfDay(now), 1);
  const end = range.end < tomorrow ? range.end : tomorrow;
  const days = end > start ? summarizeRange(ledger, start, end).days : [];
  let sum = 0;
  const points = days.map((d) => {
    sum += d.pages;
    return { date: d.date, key: d.dateKey, total: sum, pages: d.pages };
  });
  const total = sum;
  const n = points.length;
  const finished = books
    .filter((b) => b.status === 'finished' && b.finishedAt && isWithin(b.finishedAt, start, end))
    .map((b) => {
      const key = toDateKey(b.finishedAt);
      const i = points.findIndex((p) => p.key === key);
      return i < 0 ? null : { book: b, i, total: points[i].total };
    })
    .filter(Boolean);

  if (n === 0 || total === 0) return <p className="evo__empty">Sem páginas registradas neste período.</p>;

  const max = Math.max(1, total);
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => 100 - (v / max) * 92;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(p.total).toFixed(2)}`).join(' ');

  return (
    <div className="evo__cum">
      <p className="evo__caption">
        <strong className="tabular">{formatNumber(total)} páginas</strong> registradas — {range.type === 'day' ? '14 dias até o dia escolhido' : range.type === 'all' ? periodLabel.charAt(0).toLowerCase() + periodLabel.slice(1) : periodLabel}.
        {finished.length > 0 ? ' Cada ponto marca um livro concluído.' : ''}
      </p>
      <div className="evo__plot">
        <span className="evo__ymax tabular">{formatNumber(total)}</span>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="evo__svg" role="img" aria-label={`Páginas acumuladas: ${formatNumber(total)} até ${formatFullDate(points[n - 1].date)}`}>
          <defs>
            <linearGradient id="evo-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2="100" y1="50" y2="50" stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
          <path d={`${line} L100 100 L0 100 Z`} fill="url(#evo-grad)" />
          <path d={line} fill="none" stroke="var(--chart-pages)" strokeWidth="2.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {finished.map((f) => (
          <span
            key={f.book.id}
            className="evo__mark"
            style={{ left: `${x(f.i)}%`, top: `${y(f.total)}%`, background: f.book.coverColor ?? 'var(--accent)' }}
            title={`${f.book.title} — concluído em ${formatShortDate(f.book.finishedAt)}`}
          />
        ))}
      </div>
      <div className="evo__xaxis" aria-hidden="true">
        <span>{formatShortDate(points[0].date)}</span>
        <span>{formatShortDate(points[n - 1].date)}</span>
      </div>
      {finished.length > 0 && (
        <ul className="evo__legend">
          {finished.map((f) => (
            <li key={f.book.id}>
              <span className="evo__dot" style={{ background: f.book.coverColor ?? 'var(--accent)' }} aria-hidden="true" />
              {f.book.title} <small>· {formatShortDate(f.book.finishedAt)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Calendário ---------- */

function level(seconds, max) {
  if (!seconds) return 0;
  const r = seconds / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

function Calendar({ ledger, now, anchor, weekStartsOn }) {
  const [month, setMonth] = useState(() => startOfMonth(anchor > now ? now : anchor));
  const [picked, setPicked] = useState(null);
  const next = addMonths(month, 1);
  const summary = summarizeRange(ledger, month, next);
  const max = Math.max(1, ...summary.days.map((d) => d.seconds));
  const lead = (month.getDay() - (weekStartsOn === 'sunday' ? 0 : 1) + 7) % 7;
  const todayKey = toDateKey(now);
  const pickedDay = summary.days.find((d) => d.dateKey === picked) ?? null;
  const canNext = next <= startOfDay(now);

  return (
    <div className="evo__cal">
      <div className="evo__cal-head">
        <button type="button" className="period-nav__step" onClick={() => (setMonth(addMonths(month, -1)), setPicked(null))} aria-label="Mês anterior">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p className="evo__cal-title">
          <strong>{MONTH_YEAR.format(month).replace(/^./, (c) => c.toUpperCase())}</strong>
          <span className="tabular">
            {pluralize(summary.readingDays, 'dia', 'dias')} com leitura · {formatDuration(summary.seconds)} · {formatNumber(summary.pages)} pág
          </span>
        </p>
        <button type="button" className="period-nav__step" onClick={() => (setMonth(addMonths(month, 1)), setPicked(null))} disabled={!canNext} aria-label="Próximo mês">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="evo__grid" role="grid" aria-label={`Calendário de ${MONTH_YEAR.format(month)}`}>
        {WEEKDAY_LETTERS[weekStartsOn === 'sunday' ? 'sunday' : 'monday'].map((l, i) => (
          <span key={i} className="evo__wd" aria-hidden="true">
            {l}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {summary.days.map((d) => {
          const future = d.dateKey > todayKey;
          return (
            <button
              key={d.dateKey}
              type="button"
              className={`evo__cell lv${level(d.seconds, max)} ${d.dateKey === todayKey ? 'is-today' : ''} ${picked === d.dateKey ? 'is-picked' : ''}`}
              disabled={future}
              onClick={() => setPicked(picked === d.dateKey ? null : d.dateKey)}
              aria-label={`${formatFullDate(d.date)}: ${d.seconds ? `${formatDuration(d.seconds)}, ${formatNumber(d.pages)} páginas` : 'sem leitura'}`}
            >
              {d.date.getDate()}
            </button>
          );
        })}
      </div>
      <p className="evo__tip" aria-live="polite">
        {pickedDay
          ? `${formatFullDate(pickedDay.date)}: ${pickedDay.seconds || pickedDay.pages ? `${formatDuration(pickedDay.seconds)} · ${formatNumber(pickedDay.pages)} páginas · ${pluralize(pickedDay.sessions, 'sessão', 'sessões')}` : 'sem leitura'}`
          : 'Toque em um dia para ver o que você leu.'}
      </p>
      <div className="evo__scale" aria-hidden="true">
        menos
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`evo__cell lv${l}`} />
        ))}
        mais
      </div>
    </div>
  );
}

/* ---------- Semanas ---------- */

function Weeks({ ledger, now, anchor, weekStartsOn }) {
  const [picked, setPicked] = useState(null);
  const last = startOfWeek(anchor > now ? now : anchor, weekStartsOn);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(last, (i - 11) * 7);
    const s = summarizeRange(ledger, start, addDays(start, 7));
    return { key: toDateKey(start), start, minutes: Math.round(s.seconds / 60), seconds: s.seconds, pages: s.pages, days: s.readingDays };
  });
  const max = Math.max(1, ...weeks.map((w) => w.minutes));
  const avg = weeks.reduce((a, w) => a + w.minutes, 0) / weeks.length;
  const sel = weeks.find((w) => w.key === picked) ?? null;
  const thisWeekKey = toDateKey(startOfWeek(now, weekStartsOn));

  return (
    <div className="evo__weeks">
      <p className="evo__caption">
        Minutos de leitura nas últimas 12 semanas. A linha tracejada é a média: <strong className="tabular">{formatDuration(Math.round(avg) * 60)}</strong> por semana.
      </p>
      <div className="evo__wplot">
        <span className="evo__avg" style={{ bottom: `${(avg / max) * 100}%` }} aria-hidden="true" />
        {weeks.map((w) => (
          <button
            key={w.key}
            type="button"
            className={`evo__wbar ${w.minutes >= avg && w.minutes > 0 ? 'is-above' : ''} ${picked === w.key ? 'is-picked' : ''} ${w.key === thisWeekKey ? 'is-now' : ''}`}
            onClick={() => setPicked(picked === w.key ? null : w.key)}
            aria-label={`Semana de ${formatShortDate(w.start)}: ${formatDuration(w.seconds)}, ${formatNumber(w.pages)} páginas`}
          >
            <span style={{ height: `${w.minutes ? Math.max(3, (w.minutes / max) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
      <div className="evo__wlabels" aria-hidden="true">
        {weeks.map((w, i) => (
          <span key={w.key}>{i % 2 === 1 ? '' : `${w.start.getDate()}/${w.start.getMonth() + 1}`}</span>
        ))}
      </div>
      <p className="evo__tip" aria-live="polite">
        {sel
          ? `Semana de ${formatShortDate(sel.start)}: ${formatDuration(sel.seconds)} · ${formatNumber(sel.pages)} páginas · ${pluralize(sel.days, 'dia', 'dias')} com leitura`
          : 'Toque em uma barra para ver a semana.'}
      </p>
    </div>
  );
}

