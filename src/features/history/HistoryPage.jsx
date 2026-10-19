import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookA, BookOpenText, CalendarPlus, Clock, FileUp, History, NotebookPen, Search, SearchX, Timer, X } from 'lucide-react';
import { Button, EmptyState, PageHeader } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import {
  HISTORY_PAGE_SIZE,
  HISTORY_PERIODS,
  filterHistory,
  getRangeError,
  groupByDay,
  summarizeHistory,
} from '../../utils/history.js';
import { formatDuration, formatFullDate, formatNumber, formatSessionPeriod, formatWeekdayShort, pluralize } from '../../utils/format.js';
import { SessionDialog } from './components/SessionDialog.jsx';
import { ManualSessionDialog } from './components/ManualSessionDialog.jsx';
import { SessionDuration, SourceBadge } from './components/SessionBadges.jsx';
import { isManualSession } from '../../utils/pages.js';
import './History.css';

const VALID_PERIODS = new Set(HISTORY_PERIODS.map((p) => p.value));
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Filtros guardados na URL (dá para voltar, recarregar e compartilhar). */
function readFilters(params) {
  return {
    bookId: params.get('livro') ?? '',
    period: VALID_PERIODS.has(params.get('periodo')) ? params.get('periodo') : 'todos',
    from: params.get('de') ?? '',
    to: params.get('ate') ?? '',
    query: params.get('q') ?? '',
  };
}

/** Histórico de sessões: filtros na URL, lista por dia e detalhes em diálogo. */
export default function HistoryPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  useDocumentTitle('Histórico');
  const { books, sessions } = useData();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);

  const filters = useMemo(() => readFilters(params), [params]);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const booksWithSessions = useMemo(() => {
    const ids = new Set(sessions.map((s) => s.bookId));
    return books.filter((b) => ids.has(b.id)).sort((a, b) => collator.compare(a.title, b.title));
  }, [books, sessions]);

  const filtered = useMemo(() => filterHistory(sessions, booksById, filters), [sessions, booksById, filters]);
  const totals = useMemo(() => summarizeHistory(filtered), [filtered]);
  const manualCount = useMemo(() => sessions.filter(isManualSession).length, [sessions]);
  const visible = filtered.slice(0, limit);
  const groups = groupByDay(visible);
  const rangeError = getRangeError(filters.period, filters);
  const hasFilters = Boolean(filters.bookId || filters.query || filters.period !== 'todos');

  const updateParams = (patch) => {
    setLimit(HISTORY_PAGE_SIZE);
    // Parte da URL atual do navegador (não da última renderização), para que
    // duas mudanças seguidas — ex.: "Limpar filtros" e logo outro filtro —
    // não se sobrescrevam.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const openSession = openId ? sessions.find((s) => s.id === openId) : null;
  const openBook = openSession ? booksById.get(openSession.bookId) : null;

  return (
    <div className="page history">
      <PageHeader
        title="Histórico"
        description={
          sessions.length > 0
            ? `${pluralize(sessions.length, 'sessão registrada', 'sessões registradas')}${manualCount ? `, ${pluralize(manualCount, 'registro manual', 'registros manuais')}` : ''}.`
            : 'Suas sessões de leitura — cronometradas ou registradas à mão — aparecem aqui.'
        }
        actions={
          <>
            <Button to={ROUTES.importHistory} variant="ghost" icon={FileUp}>
              Importar histórico
            </Button>
            <Button variant="secondary" icon={CalendarPlus} onClick={() => setAdding(true)}>
              Adicionar sessão manual
            </Button>
          </>
        }
      />

      {sessions.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma sessão registrada ainda"
          description="Use o cronômetro para registrar tempo, páginas e observações de cada leitura, ou adicione à mão as sessões que você anotou antes."
          action={
            <div className="history__empty-actions">
              <Button to={ROUTES.reading} icon={Timer}>
                Ler agora
              </Button>
              <Button variant="secondary" icon={CalendarPlus} onClick={() => setAdding(true)}>
                Adicionar sessão manual
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <form className="history__filters" role="search" aria-label="Filtrar histórico" onSubmit={(e) => e.preventDefault()}>
            <div className="history__search">
              <Search size={18} aria-hidden="true" className="history__search-icon" />
              <label htmlFor="history-search" className="visually-hidden">
                Buscar por título do livro
              </label>
              <input
                id="history-search"
                type="search"
                className="input"
                placeholder="Buscar por título ou autor"
                value={filters.query}
                onChange={(event) => updateParams({ q: event.target.value })}
                autoComplete="off"
              />
              {filters.query && (
                <button type="button" className="history__search-clear" onClick={() => updateParams({ q: '' })}>
                  <X size={16} aria-hidden="true" />
                  <span className="visually-hidden">Limpar busca</span>
                </button>
              )}
            </div>
            <div className="history__field">
              <label htmlFor="history-book">Livro</label>
              <select id="history-book" className="select" value={filters.bookId} onChange={(e) => updateParams({ livro: e.target.value })}>
                <option value="">Todos os livros</option>
                {booksWithSessions.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="history__field">
              <label htmlFor="history-period">Período</label>
              <select
                id="history-period"
                className="select"
                value={filters.period}
                onChange={(e) => updateParams({ periodo: e.target.value === 'todos' ? '' : e.target.value, de: '', ate: '' })}
              >
                {HISTORY_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {filters.period === 'personalizado' && (
              <div className="history__dates">
                <div className="history__field">
                  <label htmlFor="history-from">De</label>
                  <input id="history-from" type="date" className="input" value={filters.from} onChange={(e) => updateParams({ de: e.target.value })} />
                </div>
                <div className="history__field">
                  <label htmlFor="history-to">Até</label>
                  <input id="history-to" type="date" className="input" value={filters.to} onChange={(e) => updateParams({ ate: e.target.value })} />
                </div>
              </div>
            )}
          </form>

          {rangeError && (
            <p className="form-alert" role="alert">
              {rangeError} Mostrando todas as datas.
            </p>
          )}

          <p className="history__summary tabular" role="status">
            {filtered.length === 0
              ? 'Nenhuma sessão encontrada.'
              : `${pluralize(totals.sessions, 'sessão', 'sessões')} · ${pluralize(totals.pages, 'página')} · ${formatDuration(totals.seconds)} de leitura${
                  totals.withoutDuration ? ` (${pluralize(totals.withoutDuration, 'sessão', 'sessões')} sem duração)` : ''
                }${
                  totals.withNotes ? ` · ${pluralize(totals.withNotes, 'com notas', 'com notas')}` : ''
                }`}
          </p>

          {filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nenhuma sessão com esses filtros"
              description="Tente outro livro, outro período ou uma busca mais curta."
              action={
                hasFilters && (
                  <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
                    Limpar filtros
                  </Button>
                )
              }
            />
          ) : (
            <>
              {groups.map((group) => (
                <section key={group.dateKey} className="history__day" aria-labelledby={`dia-${group.dateKey}`}>
                  <h2 id={`dia-${group.dateKey}`} className="history__day-title">
                    <span className="history__weekday">{formatWeekdayShort(group.date)}</span> {formatFullDate(group.date)}
                  </h2>
                  <ol className="history__list">
                    {group.sessions.map((session) => (
                      <li key={session.id}>
                        <SessionRow session={session} book={booksById.get(session.bookId)} onOpen={() => setOpenId(session.id)} />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              {filtered.length > visible.length && (
                <div className="history__more">
                  <Button variant="secondary" onClick={() => setLimit((n) => n + HISTORY_PAGE_SIZE)}>
                    Mostrar mais {Math.min(HISTORY_PAGE_SIZE, filtered.length - visible.length)}
                  </Button>
                  <p className="history__muted tabular">
                    Mostrando {formatNumber(visible.length)} de {formatNumber(filtered.length)}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      <SessionDialog session={openSession} book={openBook} open={Boolean(openSession)} onClose={() => setOpenId(null)} />
      <ManualSessionDialog open={adding} onClose={() => setAdding(false)} bookId={filters.bookId} />
    </div>
  );
}

function SessionRow({ session, book, onOpen }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  return (
    <article className="history-item">
      <div className="history-item__main">
        <h3 className="history-item__title">
          <Link to={ROUTES.book(book.id)}>{book.title}</Link>
        </h3>
        {book.author && <p className="history-item__author">{book.author}</p>}
        <p className="history-item__meta tabular">
          <SourceBadge session={session} compact />
          <span>
            <Clock size={14} aria-hidden="true" /> {formatSessionPeriod(session)} · <SessionDuration session={session} />
          </span>
          <span>
            <BookOpenText size={14} aria-hidden="true" /> p. {formatNumber(session.startPage)}–{formatNumber(session.endPage)} ·{' '}
            {pluralize(session.pagesRead, 'página')}
          </span>
          {session.vocabulary?.length > 0 && (
            <span>
              <BookA size={14} aria-hidden="true" /> {pluralize(session.vocabulary.length, 'palavra')}
            </span>
          )}
        </p>
        {session.notes && (
          <p className="history-item__notes">
            <NotebookPen size={14} aria-hidden="true" />
            <span>{session.notes}</span>
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" className="history-item__open" onClick={onOpen} aria-label={`Ver detalhes da sessão de ${formatFullDate(session.startedAt)}, ${book.title}`}>
        Ver detalhes
      </Button>
    </article>
  );
}
