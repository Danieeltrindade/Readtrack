import { useMemo } from 'react';
import { Link } from 'react-router';
import { BookCheck, Clock, FileText, Timer } from 'lucide-react';
import { FlameIcon } from '../../../components/ui/FlameIcon.jsx';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { addMonths, startOfMonth } from '../../../utils/date.js';
import { summarizeRange } from '../../../utils/ledger.js';
import { formatDuration, formatNumber, pluralize } from '../../../utils/format.js';

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/**
 * "Seus números": totais de toda a leitura em blocos. Páginas com a curva
 * dos últimos meses, tempo, sessões por dia da semana, livros e sequência.
 * Tudo vem de getDashboardSummary e do livro-razão (nada estimado).
 */
export function ReadingLedger({ totals, pace, streak, counts, ledger, sessions, books }) {
  const ROUTES = usePaths();
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const start = startOfMonth(addMonths(now, i - 5));
      const s = summarizeRange(ledger, start, addMonths(start, 1));
      return { label: MONTH.format(start).replace('.', ''), pages: s.pages, seconds: s.seconds };
    });
  }, [ledger]);
  const weekdays = useMemo(() => {
    const out = [0, 0, 0, 0, 0, 0, 0];
    for (const s of sessions) {
      const d = new Date(s.startedAt);
      if (!Number.isNaN(d.getTime())) out[(d.getDay() + 6) % 7] += 1;
    }
    return out;
  }, [sessions]);
  const finishedBooks = books.filter((b) => b.status === 'finished').slice(-6);
  const readingBook = books.find((b) => b.status === 'reading');

  const maxPages = Math.max(1, ...months.map((m) => m.pages));
  const pts = months.map((m, i) => [8 + i * (284 / 5), 72 - (m.pages / maxPages) * 60]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const maxWd = Math.max(1, ...weekdays);

  return (
    <section className="numbers" aria-labelledby="numbers-title">
      <div className="section-head">
        <h2 id="numbers-title">Seus números</h2>
        <Link to={ROUTES.statistics}>Estatísticas</Link>
      </div>
      <div className="numbers__grid">
        <div className="ntile ntile--big">
          <span className="ntile__k">
            <FileText size={15} aria-hidden="true" /> Páginas lidas
          </span>
          <span className="ntile__v tabular">{formatNumber(totals.pages)}</span>
          <span className="ntile__s">
            {totals.sessions === 0
              ? 'nenhuma sessão registrada ainda'
              : totals.newPages !== totals.pages
                ? `${formatNumber(totals.newPages)} novas · ${formatNumber(totals.pages - totals.newPages)} de releitura`
                : 'registradas em sessões'}
          </span>
          <svg className="ntile__spark" viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={`Páginas por mês: ${months.map((m) => `${m.label} ${m.pages}`).join(', ')}`}>
            <defs>
              <linearGradient id="numbers-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.45" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path} L292 80 L8 80 Z`} fill="url(#numbers-grad)" />
            <path d={path} fill="none" stroke="var(--chart-pages)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="ntile__months" aria-hidden="true">
            {months.map((m) => (
              <span key={m.label}>{m.label}</span>
            ))}
          </span>
        </div>

        <div className="ntile">
          <span className="ntile__k">
            <Clock size={15} aria-hidden="true" /> Tempo
          </span>
          <span className="ntile__v tabular">{totals.sessions === 0 ? '—' : formatDuration(totals.seconds)}</span>
          <span className="ntile__s">{pace.reliable ? `ritmo de ${formatNumber(Math.round(pace.pagesPerHour))} pág/h` : 'ritmo: dados insuficientes'}</span>
        </div>

        <div className="ntile">
          <span className="ntile__k">
            <Timer size={15} aria-hidden="true" /> Sessões
          </span>
          <span className="ntile__v tabular">{formatNumber(totals.sessions)}</span>
          <span className="ntile__s">{totals.averageSessionSeconds ? `média de ${formatDuration(totals.averageSessionSeconds)}` : 'nenhuma ainda'}</span>
          <span className="ntile__bars" role="img" aria-label={`Sessões por dia da semana: ${WEEKDAYS.map((w, i) => `${w} ${weekdays[i]}`).join(', ')}`}>
            {weekdays.map((v, i) => (
              <span key={WEEKDAYS[i]} style={{ height: `${Math.max(8, (v / maxWd) * 100)}%` }} />
            ))}
          </span>
        </div>

        <div className="ntile">
          <span className="ntile__k">
            <BookCheck size={15} aria-hidden="true" /> Livros
          </span>
          <span className="ntile__v tabular">
            {formatNumber(counts.finished)} <small>{counts.finished === 1 ? 'concluído' : 'concluídos'}</small>
          </span>
          <span className="ntile__s">
            {formatNumber(counts.reading)} lendo · {formatNumber(counts['want-to-read'])} para ler
          </span>
          <span className="ntile__spines" aria-hidden="true">
            {finishedBooks.map((b, i) => (
              <span key={b.id} style={{ background: b.coverColor ?? '#3a2a6e', height: `${84 + ((i * 7) % 16)}%` }} />
            ))}
            {readingBook && <span className="is-reading" style={{ background: readingBook.coverColor ?? '#3a2a6e' }} />}
          </span>
        </div>

        <div className={`ntile ntile--flame ${streak.readToday ? 'is-lit' : ''}`}>
          <span className="ntile__k">
            <FlameIcon lit={streak.readToday} size={15} /> Sequência
          </span>
          <span className="ntile__v tabular">{pluralize(streak.current, 'dia')}</span>
          <span className="ntile__s">
            {streak.readToday ? 'você já leu hoje' : streak.current > 0 ? 'leia hoje para manter' : `recorde: ${pluralize(streak.longest, 'dia')}`}
          </span>
        </div>
      </div>
    </section>
  );
}
