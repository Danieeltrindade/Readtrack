import { Link } from 'react-router';
import { CircleHelp, Trophy } from 'lucide-react';
import { FormatIcon } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { FORMAT_LABELS, FORMAT_LIST, describeSessionProgress, getSessionKind, normalizeFormat } from '../../../utils/formats.js';
import { NOTEBOOK_SINGULAR, formatEntryAnchor } from '../../../utils/annotations.js';
import { formatDuration, formatNumber, formatRelativeDay, formatTime, formatWeekdayShort, pluralize } from '../../../utils/format.js';
import { getDurationDivergence } from '../../../utils/duration.js';

const RING_R = 50;
const RING_C = 2 * Math.PI * RING_R;
const shortTime = (seconds) => (seconds > 0 ? formatDuration(seconds) : '—');

/* ---------- Hoje: anel da meta diária + tempo por formato + semana ---------- */

export function TodayCard({ today, goalMinutes, week }) {
  const ROUTES = usePaths();
  const goalSeconds = goalMinutes ? goalMinutes * 60 : 0;
  const ratio = goalSeconds ? Math.min(1, today.totalSeconds / goalSeconds) : 0;
  const offset = RING_C * (1 - ratio);
  const max = Math.max(1, ...FORMAT_LIST.map((f) => today.seconds[f]));
  const left = Math.max(0, goalSeconds - today.totalSeconds);
  const label = goalSeconds
    ? `${formatDuration(today.totalSeconds)} de ${formatDuration(goalSeconds)} hoje`
    : `${formatDuration(today.totalSeconds)} hoje, sem meta diária`;

  return (
    <Link to={ROUTES.goals} className="today-card" aria-label={`Meta de hoje: ${label}. Abrir metas`}>
      <div className="today-card__head">
        <div className="today-card__ring" aria-hidden="true">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={RING_R} className="today-card__track" />
            {/* Brilho largo e suave por trás (sem filtro: não forma quadrado). */}
            <circle cx="60" cy="60" r={RING_R} className="today-card__halo" strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={offset} style={{ '--c': RING_C }} transform="rotate(-90 60 60)" />
            <circle cx="60" cy="60" r={RING_R} className="today-card__arc" strokeDasharray={`${RING_C} ${RING_C}`} strokeDashoffset={offset} style={{ '--c': RING_C }} transform="rotate(-90 60 60)" />
          </svg>
          <span className="today-card__pct">
            <strong>{goalSeconds ? `${Math.round(ratio * 100)}%` : '—'}</strong>
            <small>{goalSeconds ? 'da meta' : 'sem meta'}</small>
          </span>
        </div>
        <div className="today-card__text">
          <span className="today-card__kicker">Hoje</span>
          <span className="today-card__done">{formatDuration(today.totalSeconds)}</span>
          <span className="today-card__hint">
            {goalSeconds ? `de ${formatDuration(goalSeconds)} · ${left === 0 ? 'meta batida' : `faltam ${formatDuration(left)}`}` : 'Configure uma meta diária em Metas'}
          </span>
        </div>
      </div>

      <ul className="today-card__formats" aria-label="Tempo de hoje por formato">
        {FORMAT_LIST.map((f) => (
          <li key={f} style={{ '--fc': `var(--format-${f})` }}>
            <FormatIcon format={f} size={17} className="today-card__ficon" />
            <span className="today-card__fbody">
              <span className="today-card__flabel">{FORMAT_LABELS[f]}</span>
              <span className="today-card__fbar">
                <span style={{ width: `${(today.seconds[f] / max) * 100}%` }} />
              </span>
            </span>
            <span className={`today-card__ftime ${today.seconds[f] ? '' : 'is-empty'}`}>{shortTime(today.seconds[f])}</span>
          </li>
        ))}
      </ul>

      <div className="today-card__week">
        <span className="today-card__week-title">Meta diária nesta semana</span>
        <ol className="today-card__days">
          {week.map((d, i) => {
            const r = goalSeconds && !d.future ? Math.min(1, d.totalSeconds / goalSeconds) : 0;
            return (
              <li
                key={d.date.toISOString()}
                className={`${d.isToday ? 'is-today' : ''} ${r >= 1 ? 'is-met' : ''}`}
                aria-label={`${formatWeekdayShort(d.date)}: ${d.future ? 'ainda não chegou' : formatDuration(d.totalSeconds)}`}
              >
                <span className="today-card__day">
                  <span style={{ height: `${Math.round(r * 100)}%`, animationDelay: `${0.2 + i * 0.06}s` }} />
                </span>
                {formatWeekdayShort(d.date).charAt(0).toUpperCase()}
              </li>
            );
          })}
        </ol>
      </div>
    </Link>
  );
}

/* ---------- Destaques: próxima conquista, páginas da semana, caderno ---------- */

export function Highlights({ next, weekPages, weeklyGoal, openQuestions, notesCount }) {
  const ROUTES = usePaths();
  const pagesRatio = weeklyGoal ? Math.min(1, weekPages / weeklyGoal) : 0;
  return (
    <div className="highlights">
      <Link to={ROUTES.goals} className="highlight highlight--accent">
        <span className="highlight__icon">
          <Trophy size={22} aria-hidden="true" />
        </span>
        <span className="highlight__body">
          <span className="highlight__label">{next ? `Próxima conquista · ${Math.round(next.ratio * 100)}%` : 'Conquistas'}</span>
          <span className="highlight__value">{next ? next.title : 'Todas desbloqueadas'}</span>
          <span className="highlight__bar">
            <span style={{ width: `${(next?.ratio ?? 1) * 100}%` }} />
          </span>
        </span>
      </Link>
      <Link to={ROUTES.statistics} className="highlight highlight--print">
        <span className="highlight__icon">
          <FormatIcon format="print" size={22} />
        </span>
        <span className="highlight__body">
          <span className="highlight__label">{weeklyGoal ? `Páginas na semana · meta ${formatNumber(weeklyGoal)}` : 'Páginas na semana'}</span>
          <span className="highlight__value">{pluralize(weekPages, 'página')}</span>
          {weeklyGoal ? (
            <span className="highlight__bar">
              <span style={{ width: `${pagesRatio * 100}%` }} />
            </span>
          ) : (
            <span className="highlight__note">sem meta semanal</span>
          )}
        </span>
      </Link>
      <Link to={`${ROUTES.notebook}${openQuestions ? '?tipo=question&abertas=1' : ''}`} className="highlight highlight--question">
        <span className="highlight__icon">
          <CircleHelp size={22} aria-hidden="true" />
        </span>
        <span className="highlight__body">
          <span className="highlight__label">Caderno</span>
          <span className="highlight__value">
            {openQuestions ? pluralize(openQuestions, 'dúvida em aberto', 'dúvidas em aberto') : pluralize(notesCount, 'anotação', 'anotações')}
          </span>
          <span className="highlight__note">{openQuestions ? 'ver e resolver' : 'abrir o caderno'}</span>
        </span>
      </Link>
    </div>
  );
}

/* ---------- Esta semana: minutos por dia, empilhados por formato ---------- */

export function WeekByFormat({ week, totals }) {
  const ROUTES = usePaths();
  const max = Math.max(60 * 60, ...week.map((d) => d.totalSeconds));
  const total = FORMAT_LIST.reduce((t, f) => t + totals[f].seconds, 0);
  const sessions = FORMAT_LIST.reduce((t, f) => t + totals[f].sessions, 0);
  const description = week
    .map((d) => `${formatWeekdayShort(d.date)}: ${FORMAT_LIST.map((f) => `${FORMAT_LABELS[f]} ${Math.round(d.seconds[f] / 60)} min`).join(', ')}`)
    .join('; ');

  return (
    <section className="week-card" aria-labelledby="week-title">
      <div className="week-card__head">
        <div>
          <h2 id="week-title">Esta semana</h2>
          <p className="week-card__sub">
            {formatDuration(total)} no total · {pluralize(sessions, 'sessão', 'sessões')}
          </p>
        </div>
        <Link to={ROUTES.statistics} className="week-card__link">
          Ver estatísticas
        </Link>
      </div>

      <dl className="week-card__split">
        {FORMAT_LIST.map((f) => (
          <div key={f} style={{ '--fc': `var(--format-${f})`, '--fc-text': `var(--format-${f}-text)` }}>
            <span className="week-card__split-icon">
              <FormatIcon format={f} size={17} />
            </span>
            <span>
              <dt>{FORMAT_LABELS[f]}</dt>
              <dd>
                {shortTime(totals[f].seconds)}{' '}
                <small>
                  {f === 'audio' || totals[f].pages === 0 ? `· ${pluralize(totals[f].sessions, 'sessão', 'sessões')}` : `· ${formatNumber(totals[f].pages)} p.`}
                </small>
              </dd>
            </span>
          </div>
        ))}
      </dl>

      <figure className="week-card__chart">
        <div className="week-card__bars" role="img" aria-label={`Minutos por dia e por formato. ${description}`}>
          {week.map((d, i) => (
            <div key={d.date.toISOString()} className={`week-card__col ${d.isToday ? 'is-today' : ''}`}>
              <div className="week-card__stack" style={{ animationDelay: `${i * 0.08}s` }}>
                {['audio', 'digital', 'print'].map((f) =>
                  d.seconds[f] > 0 ? <span key={f} className={`week-card__seg week-card__seg--${f}`} style={{ height: `${(d.seconds[f] / max) * 100}%` }} /> : null,
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="week-card__labels" aria-hidden="true">
          {week.map((d) => (
            <span key={d.date.toISOString()} className={d.isToday ? 'is-today' : ''}>
              <span>{formatWeekdayShort(d.date)}</span>
              <small>{d.totalSeconds ? formatDuration(d.totalSeconds) : '—'}</small>
            </span>
          ))}
        </div>
        <figcaption className="week-card__legend">
          {FORMAT_LIST.map((f) => (
            <span key={f}>
              <span className={`week-card__dot week-card__seg--${f}`} />
              {FORMAT_LABELS[f]}
            </span>
          ))}
        </figcaption>
      </figure>
    </section>
  );
}

/* ---------- Últimas anotações (carrossel) ---------- */

export function LatestNotes({ entries }) {
  const ROUTES = usePaths();
  if (entries.length === 0) return null;
  return (
    <section className="latest-notes" aria-labelledby="notes-title">
      <div className="section-head">
        <h2 id="notes-title">Últimas anotações</h2>
        <Link to={ROUTES.notebook}>Abrir caderno</Link>
      </div>
      <ul className="latest-notes__list">
        {entries.map((e, i) => (
          <li key={e.key} className={`latest-note latest-note--${e.type}`} style={{ animationDelay: `${i * 0.06}s` }}>
            <span className="latest-note__type">{NOTEBOOK_SINGULAR[e.type]}</span>
            <p className="latest-note__text">{e.type === 'quote' ? `“${e.text}”` : e.type === 'word' && e.note ? `${e.text} — ${e.note}` : e.text}</p>
            <p className="latest-note__meta" style={{ '--fc-text': `var(--format-${normalizeFormat(e.book.format)}-text)` }}>
              <span className="latest-note__cover" style={{ background: e.book.coverColor ?? '#3a2a6e' }} />
              <span className="latest-note__book">{e.book.title}</span>
              {formatEntryAnchor(e) && <span className="latest-note__anchor tabular">{formatEntryAnchor(e)}</span>}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- Sessões recentes, por dia ---------- */

export function SessionsByDay({ sessions, booksById }) {
  const ROUTES = usePaths();
  const groups = [];
  for (const s of sessions) {
    const label = formatRelativeDay(s.startedAt);
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [], seconds: 0 }));
    g.items.push(s);
    g.seconds += Number(s.durationSeconds) || 0;
  }
  return (
    <section className="sessions-card" aria-labelledby="sessions-title">
      <div className="section-head">
        <h2 id="sessions-title">Sessões recentes</h2>
        <Link to={ROUTES.history}>Histórico</Link>
      </div>
      {groups.length === 0 ? (
        <p className="sessions-card__empty">Nenhuma sessão ainda. Use o cronômetro ou registre uma leitura feita fora dele.</p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="sessions-card__day">
            <div className="sessions-card__day-head">
              <span>{g.label}</span>
              <span>{g.seconds ? formatDuration(g.seconds) : ''}</span>
            </div>
            {g.items.map((s) => {
              const book = booksById.get(s.bookId);
              if (!book) return null;
              const f = normalizeFormat(book.format);
              const kind = getSessionKind(s);
              const notes = (s.notes ? 1 : 0) + (s.vocabulary?.length ?? 0) + (s.annotations?.length ?? 0);
              return (
                <Link key={s.id} to={ROUTES.book(book.id)} className="sessions-card__item" style={{ '--fc': `var(--format-${f})`, '--fc-text': `var(--format-${f}-text)` }}>
                  <span className="sessions-card__icon">
                    <FormatIcon format={f} size={18} />
                  </span>
                  <span className="sessions-card__main">
                    <span className="sessions-card__title">{book.title}</span>
                    <span className="sessions-card__range tabular">
                      {formatTime(s.startedAt)} · {kind === 'pages' ? `p. ${s.startPage} → ${s.endPage}` : describeSessionProgress(s)}
                    </span>
                  </span>
                  <span className="sessions-card__side">
                    <span className="sessions-card__duration">
                      {s.durationSeconds === null || s.durationSeconds === undefined ? '—' : formatDuration(s.durationSeconds)}
                      {getDurationDivergence(s) ? ' *' : ''}
                    </span>
                    <span className="sessions-card__notes">{notes ? pluralize(notes, 'nota') : kind === 'pages' ? `+${s.pagesRead} p.` : ''}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
