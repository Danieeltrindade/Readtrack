import { Link } from 'react-router';
import { Gauge, Sunrise } from 'lucide-react';
import { Panel } from '../../../components/ui';
import { FlameIcon } from '../../../components/ui/FlameIcon.jsx';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { fromDateKey, isWithin, toDate } from '../../../utils/date.js';
import { PACE_MIN_PAGES, PACE_MIN_SECONDS } from '../../../utils/stats.js';
import { formatDecimal, formatDuration, formatFullDate, formatNumber, formatShortDate, pluralize } from '../../../utils/format.js';

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

const PARTS = [
  { id: 'madrugada', label: 'De madrugada', from: 0, to: 5 },
  { id: 'manha', label: 'De manhã', from: 5, to: 12 },
  { id: 'tarde', label: 'À tarde', from: 12, to: 18 },
  { id: 'noite', label: 'À noite', from: 18, to: 24 },
];

/** Horário em que as sessões costumam começar (no período; sem sessões, em todo o histórico). */
function getReadingHours(sessions, range) {
  const inRange = sessions.filter((s) => isWithin(s.startedAt, range.start, range.end));
  const list = inRange.length > 0 ? inRange : sessions;
  const hours = Array(24).fill(0);
  for (const s of list) {
    const d = toDate(s.startedAt);
    if (d) hours[d.getHours()] += 1;
  }
  const total = hours.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const peak = hours.indexOf(Math.max(...hours));
  const part = PARTS.find((p) => peak >= p.from && peak < p.to);
  return { hours, total, peak, part, wholeHistory: inRange.length === 0 };
}

/**
 * Destaques em blocos: melhor dia do período, recorde diário, sequência,
 * livros concluídos no período, horário em que você costuma ler e ritmo.
 */
export function HighlightTiles({ stats, records, streak, sessions, range, undatedFinished }) {
  const ROUTES = usePaths();
  const best = stats.bestDay;
  const record = records.bestDay;
  const hours = getReadingHours(sessions, range);
  const pace = stats.pace;
  const gauge = record && best ? Math.min(1, best.pages / Math.max(1, record.pages)) : 0;
  const recordDate = record ? fromDateKey(record.dateKey) : null;

  return (
    <Panel title="Destaques" className="hl">
      <div className="hl__grid">
        <div className="hl__tile">
          <span className="hl__k">Melhor dia do período</span>
          {best ? (
            <div className="hl__leaf-row">
              <span className="hl__leaf" aria-hidden="true">
                <small>{MONTH.format(best.date).replace('.', '')}</small>
                <b>{best.date.getDate()}</b>
              </span>
              <span className="hl__body">
                <span className="hl__v tabular">{formatNumber(best.pages)} pág</span>
                <span className="hl__s">
                  {formatFullDate(best.date)} · {formatDuration(best.seconds)}
                </span>
              </span>
            </div>
          ) : (
            <span className="hl__s">Nenhuma leitura neste período.</span>
          )}
        </div>

        <div className="hl__tile">
          <span className="hl__k">Recorde diário</span>
          {record ? (
            <div className="hl__leaf-row">
              <svg className="hl__gauge" viewBox="0 0 60 36" role="img" aria-label={best ? `Melhor dia do período: ${Math.round(gauge * 100)}% do recorde` : 'Recorde diário'}>
                <path d="M6 32 A24 24 0 0 1 54 32" fill="none" stroke="var(--line-strong)" strokeWidth="6" strokeLinecap="round" />
                <path
                  d="M6 32 A24 24 0 0 1 54 32"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray={`${Math.max(0.5, gauge * 100)} 100`}
                />
              </svg>
              <span className="hl__body">
                <span className="hl__v tabular">{formatNumber(record.pages)} pág</span>
                <span className="hl__s">
                  em {formatFullDate(recordDate)}
                  {best ? ` · melhor dia do período: ${Math.round(gauge * 100)}% disso` : ''}
                </span>
              </span>
            </div>
          ) : (
            <span className="hl__s">Ainda sem recorde.</span>
          )}
        </div>

        <div className={`hl__tile hl__tile--flame ${streak.readToday ? 'is-lit' : ''}`}>
          <span className="hl__k">Sequência</span>
          <div className="hl__leaf-row">
            <span className="hl__flame">
              <FlameIcon lit={streak.readToday || streak.current > 0} size={34} />
            </span>
            <span className="hl__body">
              <span className="hl__v tabular">{pluralize(streak.current, 'dia')}</span>
              <span className="hl__s">
                {streak.readToday ? 'você já leu hoje' : streak.current > 0 ? 'leia hoje para manter' : 'comece hoje'} · maior: {pluralize(streak.longest, 'dia')}
                {streak.longestEnd ? ` (até ${formatShortDate(fromDateKey(streak.longestEnd))})` : ''}
              </span>
            </span>
          </div>
        </div>

        <div className="hl__tile hl__tile--books">
          <span className="hl__k">Livros concluídos no período</span>
          {stats.finishedBooks.length === 0 ? (
            <span className="hl__s">Nenhum.</span>
          ) : (
            <ul className="hl__books">
              {stats.finishedBooks.map((b) => (
                <li key={b.id}>
                  <span className="hl__book" style={{ background: b.coverColor ?? '#3a2a6e' }} aria-hidden="true" />
                  <span>
                    <Link to={ROUTES.book(b.id)}>{b.title}</Link>
                    <small> em {formatShortDate(b.finishedAt)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {undatedFinished > 0 && (
            <small className="hl__note">
              {pluralize(undatedFinished, 'livro concluído', 'livros concluídos')} sem data de conclusão {undatedFinished === 1 ? 'não aparece' : 'não aparecem'} em nenhum período.
            </small>
          )}
        </div>

        <div className="hl__tile">
          <span className="hl__k">
            <Sunrise size={14} aria-hidden="true" /> Seu horário
          </span>
          {hours ? (
            <>
              <span className="hl__v">
                {hours.part.label} <small>· por volta das {hours.peak}h</small>
              </span>
              <span className="hl__hours" role="img" aria-label={`Sessões por hora de início: ${hours.hours.map((v, h) => (v ? `${h}h ${v}` : null)).filter(Boolean).join(', ')}`}>
                {hours.hours.map((v, h) => (
                  <span key={h} className={h === hours.peak ? 'is-peak' : ''} style={{ height: `${v ? Math.max(14, (v / hours.hours[hours.peak]) * 100) : 4}%` }} />
                ))}
              </span>
              <span className="hl__axis" aria-hidden="true">
                <span>0h</span>
                <span>6h</span>
                <span>12h</span>
                <span>18h</span>
                <span>24h</span>
              </span>
              <span className="hl__s">
                {pluralize(hours.total, 'sessão', 'sessões')}
                {hours.wholeHistory ? ' em todo o histórico (nenhuma no período)' : ' no período'}, pela hora de início
              </span>
            </>
          ) : (
            <span className="hl__s">Sem sessões ainda.</span>
          )}
        </div>

        <div className="hl__tile">
          <span className="hl__k">
            <Gauge size={14} aria-hidden="true" /> Ritmo no período
          </span>
          {pace.reliable ? (
            <>
              <span className="hl__v tabular">{formatNumber(Math.round(pace.pagesPerHour))} pág/h</span>
              <span className="hl__s">{formatDecimal(pace.pagesPerMinute)} página por minuto</span>
            </>
          ) : (
            <>
              <span className="hl__v hl__v--muted">Dados insuficientes</span>
              <span className="hl__s">
                precisa de {PACE_MIN_SECONDS / 60} min e {PACE_MIN_PAGES} páginas no período
              </span>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
