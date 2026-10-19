import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookCheck, Library, Plus, Search, SearchX, X } from 'lucide-react';
import { BookCover, Button, EmptyState, PageHeader, ProgressBar, StatusBadge } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { getBookProgress } from '../../utils/stats.js';
import { SORT_OPTIONS, queryLibrary } from '../../utils/books.js';
import { formatNumber } from '../../utils/format.js';
import { BookActionsMenu } from '../books/components/BookActionsMenu.jsx';
import '../../components/ui/Form.css';
import './Library.css';

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'reading', label: 'Em andamento' },
  { value: 'finished', label: 'Concluídos' },
  { value: 'want-to-read', label: 'Quero ler' },
];

const EMPTY_MESSAGES = {
  reading: 'Nenhum livro em andamento.',
  finished: 'Nenhum livro concluído ainda.',
  'want-to-read': 'Sua lista de próximos livros está vazia.',
};

const VALID_STATUS = new Set(FILTERS.map((f) => f.value));
const VALID_SORT = new Set(SORT_OPTIONS.map((o) => o.value));

/**
 * Biblioteca: pesquisa por título/autor, filtro por status e ordenação.
 * O estado fica na URL (?status=&q=&ordem=), então o botão "voltar" do
 * navegador e links compartilhados preservam a busca.
 */
export default function LibraryPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  useDocumentTitle('Biblioteca');
  const { books } = useData();
  const [params, setParams] = useSearchParams();

  const status = VALID_STATUS.has(params.get('status')) ? params.get('status') : 'all';
  const sort = VALID_SORT.has(params.get('ordem')) ? params.get('ordem') : 'recentes';
  const query = params.get('q') ?? '';

  const updateParam = (key, value, defaultValue) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || value === defaultValue) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const result = useMemo(() => queryLibrary(books, { query, status, sort }), [books, query, status, sort]);
  const hasFilters = Boolean(query) || status !== 'all';

  return (
    <div className="page library">
      <PageHeader
        title="Biblioteca"
        description={`${formatNumber(books.length)} ${books.length === 1 ? 'livro' : 'livros'} na sua estante.`}
        actions={
          <>
            <Button to={ROUTES.newPastBook} variant="secondary" icon={BookCheck}>
              Adicionar livro já concluído
            </Button>
            <Button to={ROUTES.newBook} icon={Plus}>
              Adicionar livro
            </Button>
          </>
        }
      />

      {books.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Sua estante está vazia"
          description="Cadastre o primeiro livro para começar a registrar suas leituras. Já leu algum antes? Adicione-o direto aos concluídos."
          action={
            <div className="library__empty-actions">
              <Button to={ROUTES.newBook} icon={Plus}>Adicionar livro</Button>
              <Button to={ROUTES.newPastBook} variant="secondary" icon={BookCheck}>
                Adicionar livro já concluído
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="library__toolbar">
            <div className="library__search">
              <Search size={18} aria-hidden="true" className="library__search-icon" />
              <label htmlFor="library-search" className="visually-hidden">
                Pesquisar por título ou autor
              </label>
              <input
                id="library-search"
                type="search"
                className="input"
                placeholder="Pesquisar por título ou autor"
                value={query}
                onChange={(event) => updateParam('q', event.target.value, '')}
                autoComplete="off"
              />
              {query && (
                <button type="button" className="library__search-clear" onClick={() => updateParam('q', '', '')}>
                  <X size={16} aria-hidden="true" />
                  <span className="visually-hidden">Limpar pesquisa</span>
                </button>
              )}
            </div>
            <div className="library__sort">
              <label htmlFor="library-sort" className="library__sort-label">
                Ordenar
              </label>
              <select
                id="library-sort"
                className="select"
                value={sort}
                onChange={(event) => updateParam('ordem', event.target.value, 'recentes')}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="library__filters" role="group" aria-label="Filtrar por status">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className="filter-chip"
                aria-pressed={status === item.value}
                onClick={() => updateParam('status', item.value, 'all')}
              >
                {item.label}
                <span className="filter-chip__count tabular">{result.counts[item.value]}</span>
              </button>
            ))}
          </div>

          <p className="visually-hidden" role="status">
            {result.books.length === 1 ? '1 livro encontrado' : `${result.books.length} livros encontrados`}
          </p>

          {result.books.length === 0 ? (
            query ? (
              <EmptyState
                icon={SearchX}
                title={`Nada encontrado para “${query}”`}
                description="Confira a grafia ou pesquise só uma parte do título ou do autor."
                action={
                  <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
                    Limpar pesquisa e filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Library}
                title={EMPTY_MESSAGES[status]}
                description="Escolha outro filtro ou adicione um livro."
                action={
                  hasFilters && (
                    <Button variant="secondary" onClick={() => updateParam('status', 'all', 'all')}>
                      Ver todos os livros
                    </Button>
                  )
                }
              />
            )
          ) : (
            <ul className="library__grid">
              {result.books.map((book) => (
                <li key={book.id}>
                  <BookCard book={book} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function BookCard({ book }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const progress = getBookProgress(book);
  return (
    <article className="book-card">
      <Link to={ROUTES.book(book.id)} className="book-card__link">
        <BookCover book={book} size="fluid" />
        <div className="book-card__info">
          <StatusBadge status={book.status} />
          <h2 className="book-card__title">{book.title}</h2>
          <p className="book-card__author">{book.author}</p>
          {book.addedAsRead && <p className="book-card__origin">Lido antes do ReadTrack</p>}
          {book.status === 'reading' && book.totalPages && (
            <div className="book-card__progress">
              <ProgressBar value={progress} size="sm" label={`Progresso de ${book.title}`} />
              <span className="tabular">{progress}%</span>
            </div>
          )}
          {book.status === 'reading' && !book.totalPages && (
            <p className="book-card__origin tabular">Página {book.currentPage} · total não informado</p>
          )}
        </div>
      </Link>
      <div className="book-card__menu">
        <BookActionsMenu book={book} />
      </div>
    </article>
  );
}
