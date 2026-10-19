import { useState } from 'react';
import { Link } from 'react-router';
import { BookCheck, Library, Play, Plus } from 'lucide-react';
import { BookCover, Button, EmptyState, ProgressBar } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { getReadableBooks } from '../../../utils/sessions.js';
import { sortBooks } from '../../../utils/books.js';
import { getBookProgress } from '../../../utils/stats.js';
import { formatNumber } from '../../../utils/format.js';

/** Escolha do livro e botão "Iniciar leitura". */
export function StartSession({ requestedBookId }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { books, actions } = useData();
  const toast = useToast();
  const readable = sortBooks(getReadableBooks(books), 'recentes');
  // Livros em andamento primeiro, depois "Quero ler".
  readable.sort((a, b) => (a.status === 'reading' ? 0 : 1) - (b.status === 'reading' ? 0 : 1));

  const requested = books.find((b) => b.id === requestedBookId);
  const initial = readable.some((b) => b.id === requestedBookId) ? requestedBookId : readable[0]?.id;
  const [selectedId, setSelectedId] = useState(initial);
  const [error, setError] = useState(null);
  const selected = readable.find((b) => b.id === selectedId);

  if (books.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="Nenhum livro para ler"
        description="Cadastre um livro para começar a cronometrar suas leituras."
        action={<Button to={ROUTES.newBook} icon={Plus}>Adicionar livro</Button>}
      />
    );
  }

  if (readable.length === 0) {
    return (
      <EmptyState
        icon={BookCheck}
        title="Todos os seus livros estão concluídos"
        description="Adicione um novo livro ou mude o status de um concluído para “Lendo” para começar outra sessão."
        action={<Button to={ROUTES.newBook} icon={Plus}>Adicionar livro</Button>}
      />
    );
  }

  const start = () => {
    const result = actions.startSession(selectedId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.info('Cronômetro iniciado. Boa leitura!');
  };

  return (
    <div className="start-session">
      {requested?.status === 'finished' && (
        <p className="reading__notice" role="status">
          “{requested.title}” está concluído. Para relê-lo, mude o status para “Lendo” na{' '}
          <Link to={ROUTES.book(requested.id)}>página do livro</Link>.
        </p>
      )}

      <fieldset className="start-session__books">
        <legend className="start-session__legend">O que você vai ler?</legend>
        <div className="start-session__list">
          {readable.map((book) => (
            <label key={book.id} className="book-option">
              <input
                type="radio"
                name="book"
                value={book.id}
                checked={selectedId === book.id}
                onChange={() => {
                  setSelectedId(book.id);
                  setError(null);
                }}
              />
              <span className="book-option__body">
                <BookCover book={book} size="sm" />
                <span className="book-option__text">
                  <span className="book-option__title">{book.title}</span>
                  <span className="book-option__author">{book.author}</span>
                  <span className="book-option__progress">
                    <ProgressBar value={getBookProgress(book)} size="sm" label={`Progresso de ${book.title}`} />
                    <span className="tabular">
                      {book.currentPage > 0
                        ? `pág. ${formatNumber(book.currentPage)}${book.totalPages ? ` de ${formatNumber(book.totalPages)}` : ''}`
                        : 'ainda não começou'}
                    </span>
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="start-session__footer">
        {selected && (
          <p className="start-session__hint">
            {selected.currentPage > 0
              ? `Você continua da página ${formatNumber(selected.currentPage)}.`
              : 'Você começa do início.'}{' '}
            O tempo só conta enquanto o cronômetro estiver rodando.
          </p>
        )}
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <Button size="lg" icon={Play} onClick={start} disabled={!selected} className="start-session__button">
          Iniciar leitura
        </Button>
      </div>
    </div>
  );
}
