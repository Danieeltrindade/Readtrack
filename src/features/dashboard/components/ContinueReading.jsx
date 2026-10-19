import { Link } from 'react-router';
import { BookOpen, Library, Plus, Timer } from 'lucide-react';
import { BookCover, Button, EmptyState, ProgressBar } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { getBookProgress } from '../../../utils/stats.js';
import { formatNumber, formatRelativeDay } from '../../../utils/format.js';

/** Destaque do Dashboard: o livro que está sendo lido agora. */
export function ContinueReading({ book, lastSession, hasBooks, timerRunning = false }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  if (!book) {
    return (
      <section className="continue continue--empty" aria-label="Leitura atual">
        {hasBooks ? (
          <EmptyState
            icon={BookOpen}
            title="Nenhum livro em andamento"
            description="Escolha um livro da sua biblioteca para começar a acompanhar a leitura."
            action={<Button to={ROUTES.library} icon={Library}>Abrir biblioteca</Button>}
          />
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Sua estante está vazia"
            description="Cadastre o livro que você está lendo para registrar sessões e acompanhar o progresso."
            action={<Button to={ROUTES.newBook} icon={Plus}>Adicionar livro</Button>}
          />
        )}
      </section>
    );
  }

  const progress = getBookProgress(book);
  const remaining = book.totalPages ? Math.max(0, book.totalPages - book.currentPage) : null;

  return (
    <section className="continue" aria-labelledby="continue-title">
      <Link to={ROUTES.book(book.id)} className="continue__cover" tabIndex={-1} aria-hidden="true">
        <BookCover book={book} size="fluid" />
      </Link>

      <div className="continue__body">
        <p className="continue__kicker">
          Lendo agora
          {lastSession && <span> · última leitura {formatRelativeDay(lastSession.startedAt)}</span>}
        </p>
        <h2 id="continue-title" className="continue__title">
          <Link to={ROUTES.book(book.id)}>{book.title}</Link>
        </h2>
        <p className="continue__author">{book.author}</p>

        <div className="continue__progress">
          <div className="continue__progress-text">
            <span className="tabular">
              Página <strong>{formatNumber(book.currentPage)}</strong>
              {book.totalPages ? ` de ${formatNumber(book.totalPages)}` : ' · total não informado'}
            </span>
            {book.totalPages && <span className="continue__percent tabular">{progress}%</span>}
          </div>
          {book.totalPages && <ProgressBar value={progress} label={`Progresso de ${book.title}`} />}
          <p className="continue__remaining">
            {remaining === null ? 'Informe o total de páginas no livro para ver quanto falta' : remaining > 0 ? `Faltam ${formatNumber(remaining)} páginas` : 'Última página alcançada'}
          </p>
        </div>

        <div className="continue__actions">
          <Button to={`${ROUTES.reading}?livro=${book.id}`} icon={Timer} size="lg">
            {timerRunning ? 'Voltar ao cronômetro' : 'Continuar leitura'}
          </Button>
          <Button to={ROUTES.book(book.id)} variant="ghost" size="lg" className="continue__secondary">
            Ver detalhes
          </Button>
        </div>
      </div>
    </section>
  );
}
