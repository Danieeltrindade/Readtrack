import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlignLeft, CircleHelp, Download, Languages, Lightbulb, NotebookText, Quote, RefreshCw, Search, X } from 'lucide-react';
import { Button, EmptyState, FormatBadge, PageHeader } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useToast } from '../../hooks/useToast.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import {
  NOTEBOOK_LABELS,
  NOTEBOOK_SINGULAR,
  NOTEBOOK_TABS,
  collectNotebook,
  countByType,
  filterNotebook,
  formatEntryAnchor,
  groupNotebookByBook,
  notebookToMarkdown,
  pickQuote,
} from '../../utils/annotations.js';
import { FORMAT_LABELS } from '../../utils/formats.js';
import { formatRelativeDay } from '../../utils/format.js';
import { downloadText } from '../../utils/download.js';
import { SessionDialog } from '../history/components/SessionDialog.jsx';
import '../../components/ui/Form.css';
import './Notebook.css';

const TYPE_ICONS = { summary: AlignLeft, quote: Quote, word: Languages, idea: Lightbulb, question: CircleHelp };
const VALID_TYPES = new Set(['all', ...NOTEBOOK_TABS]);

/**
 * Caderno: tudo o que foi anotado nas sessões (resumos, citações,
 * vocabulário, ideias e dúvidas), de todos os livros, PDFs e audiobooks.
 * Filtros ficam na URL (?tipo=&livro=&q=&abertas=1).
 */
export default function NotebookPage() {
  useDocumentTitle('Caderno');
  const ROUTES = usePaths();
  const toast = useToast();
  const { books, sessions, actions } = useData();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));

  const type = VALID_TYPES.has(params.get('tipo')) ? params.get('tipo') : 'all';
  const bookId = params.get('livro') ?? 'all';
  const query = params.get('q') ?? '';
  const onlyOpen = params.get('abertas') === '1';
  const view = params.get('ver') === 'livros' ? 'books' : 'list';

  const update = (key, value, fallback) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const all = useMemo(() => collectNotebook({ books, sessions }), [books, sessions]);
  const counts = useMemo(() => countByType(filterNotebook(all, { bookId })), [all, bookId]);
  const entries = useMemo(() => filterNotebook(all, { type, bookId, query, onlyOpen }), [all, type, bookId, query, onlyOpen]);
  const bookOptions = useMemo(() => groupNotebookByBook(all).map((g) => ({ id: g.book.id, title: g.book.title, count: g.entries.length })), [all]);
  const quote = pickQuote(all, seed);
  const openSession = sessions.find((s) => s.id === openId) ?? null;
  const openBook = openSession ? books.find((b) => b.id === openSession.bookId) : null;
  const hasFilters = type !== 'all' || bookId !== 'all' || Boolean(query) || onlyOpen;

  const exportMarkdown = () => {
    if (entries.length === 0) return;
    const day = new Date().toISOString().slice(0, 10);
    downloadText(`readtrack-caderno-${day}.md`, notebookToMarkdown(entries));
    toast.success(`${entries.length} ${entries.length === 1 ? 'anotação exportada' : 'anotações exportadas'} em Markdown.`);
  };

  if (all.length === 0) {
    return (
      <div className="page notebook-page">
        <PageHeader title="Caderno" description="Tudo o que você anotou, em todos os livros, PDFs e audiobooks." />
        <EmptyState
          icon={NotebookText}
          title="Seu caderno está vazio"
          description="Ao finalizar uma sessão, anote resumos, citações, palavras novas, ideias e dúvidas. Elas aparecem todas aqui."
          action={<Button to={ROUTES.reading}>Começar uma leitura</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page notebook-page">
      <PageHeader
        title="Caderno"
        description="Tudo o que você anotou, em todos os livros, PDFs e audiobooks."
        actions={
          <Button variant="secondary" icon={Download} onClick={exportMarkdown} disabled={entries.length === 0}>
            Exportar
          </Button>
        }
      />

      {quote && (
        <section className="notebook-page__recall" aria-label="Relembre uma citação">
          <p className="notebook-page__recall-kicker">Relembre · citação de {formatRelativeDay(quote.date)}</p>
          <blockquote className="notebook-page__recall-quote">“{quote.text}”</blockquote>
          <p className="notebook-page__recall-meta">
            {quote.book.title}
            {formatEntryAnchor(quote) && ` · ${formatEntryAnchor(quote)}`} · {FORMAT_LABELS[quote.book.format ?? 'print'].toLowerCase()}
          </p>
          {counts.quote > 1 && (
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => setSeed((n) => n + 1)}>
              Outra citação
            </Button>
          )}
        </section>
      )}

      <div className="notebook-page__toolbar">
        <div className="notebook-page__search">
          <Search size={18} aria-hidden="true" className="notebook-page__search-icon" />
          <label htmlFor="notebook-search" className="visually-hidden">
            Buscar nas anotações
          </label>
          <input
            id="notebook-search"
            type="search"
            className="input"
            placeholder="Buscar nas anotações"
            value={query}
            onChange={(e) => update('q', e.target.value, '')}
            autoComplete="off"
          />
        </div>
        <label className="visually-hidden" htmlFor="notebook-book">
          Livro
        </label>
        <select id="notebook-book" className="select notebook-page__book" value={bookId} onChange={(e) => update('livro', e.target.value, 'all')}>
          <option value="all">Todos os livros</option>
          {bookOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.count})
            </option>
          ))}
        </select>
        <div className="notebook-page__view" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={view === 'list'} onClick={() => update('ver', '', '')}>
            Lista
          </button>
          <button type="button" aria-pressed={view === 'books'} onClick={() => update('ver', 'livros', '')}>
            Por livro
          </button>
        </div>
      </div>

      <div className="notebook-page__kinds" role="group" aria-label="Tipo de anotação">
        <button type="button" className="notebook-page__kind" aria-pressed={type === 'all'} onClick={() => update('tipo', '', '')}>
          Tudo <span className="tabular">{counts.all}</span>
        </button>
        {NOTEBOOK_TABS.map((id) => {
          const Icon = TYPE_ICONS[id];
          return (
            <button key={id} type="button" className={`notebook-page__kind notebook-page__kind--${id}`} aria-pressed={type === id} onClick={() => update('tipo', id, 'all')}>
              <Icon size={15} aria-hidden="true" /> {NOTEBOOK_LABELS[id]} <span className="tabular">{counts[id]}</span>
            </button>
          );
        })}
        {type === 'question' && (
          <label className="check notebook-page__open">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => update('abertas', e.target.checked ? '1' : '', '')} />
            <span>Só em aberto ({counts.open})</span>
          </label>
        )}
      </div>

      <p className="notebook-page__summary" aria-live="polite">
        {entries.length === 0 ? 'Nenhuma anotação com esses filtros.' : `${entries.length} ${entries.length === 1 ? 'anotação' : 'anotações'}`}
        {hasFilters && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => setParams({}, { replace: true })}>
              <X size={13} aria-hidden="true" /> limpar filtros
            </button>
          </>
        )}
      </p>

      {view === 'list' ? (
        <ul className="notebook-page__grid">
          {entries.map((entry) => (
            <li key={entry.key}>
              <EntryCard entry={entry} onOpen={() => setOpenId(entry.sessionId)} onToggle={() => actions.toggleQuestion(entry.sessionId, entry.annotationId)} showBook />
            </li>
          ))}
        </ul>
      ) : (
        <div className="notebook-page__groups">
          {groupNotebookByBook(entries).map((group) => (
            <section key={group.book.id} className="notebook-page__group" aria-label={group.book.title}>
              <header className="notebook-page__group-head">
                <h2>{group.book.title}</h2>
                <FormatBadge format={group.book.format} />
                <span className="notebook-page__group-count">
                  {group.entries.length} {group.entries.length === 1 ? 'anotação' : 'anotações'}
                </span>
                <Link to={ROUTES.book(group.book.id)} className="notebook-page__group-link">
                  Abrir livro
                </Link>
              </header>
              <ul className="notebook-page__grid">
                {group.entries.map((entry) => (
                  <li key={entry.key}>
                    <EntryCard entry={entry} onOpen={() => setOpenId(entry.sessionId)} onToggle={() => actions.toggleQuestion(entry.sessionId, entry.annotationId)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <SessionDialog session={openSession} book={openBook} open={Boolean(openSession)} onClose={() => setOpenId(null)} />
    </div>
  );
}

function EntryCard({ entry, onOpen, onToggle, showBook = false }) {
  const Icon = TYPE_ICONS[entry.type];
  const anchor = formatEntryAnchor(entry);
  return (
    <article className={`note-card note-card--${entry.type} ${entry.resolved ? 'is-resolved' : ''}`}>
      <p className="note-card__kind">
        <Icon size={14} aria-hidden="true" /> {NOTEBOOK_SINGULAR[entry.type]}
        <span className="note-card__when">{formatRelativeDay(entry.date)}</span>
      </p>
      <p className="note-card__text">{entry.type === 'quote' ? `“${entry.text}”` : entry.text}</p>
      {entry.note && <p className="note-card__extra">{entry.note}</p>}
      <footer className="note-card__foot">
        <span className="note-card__where">
          {showBook && <span className="note-card__book">{entry.book.title}</span>}
          {anchor && <span className="note-card__anchor tabular">{anchor}</span>}
        </span>
        <span className="note-card__actions">
          {entry.type === 'question' && (
            <button type="button" className="note-card__resolve" aria-pressed={entry.resolved} onClick={onToggle}>
              {entry.resolved ? 'Resolvida' : 'Marcar como resolvida'}
            </button>
          )}
          <button type="button" className="note-card__open" onClick={onOpen}>
            Ver sessão
          </button>
        </span>
      </footer>
    </article>
  );
}
