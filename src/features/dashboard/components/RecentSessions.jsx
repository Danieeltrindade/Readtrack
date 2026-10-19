import { Link } from 'react-router';
import { Timer } from 'lucide-react';
import { BookCover, Button, EmptyState, Panel } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { formatDuration, formatNumber, formatRelativeDay, formatTime } from '../../../utils/format.js';

/** Últimas sessões de leitura, com livro, quando, páginas e duração. */
export function RecentSessions({ sessions, booksById }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  return (
    <Panel title="Sessões recentes" className="recent" action={<Link to={ROUTES.history}>Ver histórico</Link>}>
      {sessions.length === 0 ? (
        <EmptyState
          titleAs="h3"
          icon={Timer}
          title="Nenhuma sessão ainda"
          description="Use o cronômetro para registrar quanto tempo e quantas páginas você leu."
          action={<Button to={ROUTES.reading} variant="secondary">Iniciar sessão</Button>}
        />
      ) : (
        <ol className="recent__list">
          {sessions.map((session) => {
            const book = booksById.get(session.bookId);
            if (!book) return null;
            return (
              <li key={session.id}>
                <Link to={ROUTES.book(book.id)} className="recent__item">
                  <BookCover book={book} size="xs" />
                  <div className="recent__info">
                    <p className="recent__book">{book.title}</p>
                    <p className="recent__when">
                      {formatRelativeDay(session.startedAt)}, {formatTime(session.startedAt)}
                    </p>
                  </div>
                  <div className="recent__numbers tabular">
                    <p className="recent__pages">+{formatNumber(session.pagesRead)} pág</p>
                    <p className="recent__time">{formatDuration(session.durationSeconds)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
