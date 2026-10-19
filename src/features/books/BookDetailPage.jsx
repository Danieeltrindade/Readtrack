import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, BookX, Languages, MessageSquareQuote, NotebookPen, Pencil, PenLine, Timer } from 'lucide-react';
import { BookCover, Button, EmptyState, Panel, ProgressBar, StatusBadge } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { calculatePace, getBookProgress, sortSessionsByDateDesc, sumSeconds } from '../../utils/stats.js';
import {
  formatDecimal,
  formatDuration,
  formatFullDate,
  formatNumber,
  formatSessionPeriod,
  formatShortDate,
  formatTime,
  pluralize,
} from '../../utils/format.js';
import { getContentPagesDone, getContentStart, getReadablePages } from '../../utils/pages.js';
import { ManualSessionDialog } from '../history/components/ManualSessionDialog.jsx';
import { SessionDuration, SourceBadge } from '../history/components/SessionBadges.jsx';
import { BookActionsMenu } from './components/BookActionsMenu.jsx';
import { FinalReviewDialog } from './components/FinalReviewDialog.jsx';
import { SessionDialog } from '../history/components/SessionDialog.jsx';
import { hasFinalReview } from '../../utils/books.js';
import './BookDetail.css';

const RECENT_LIMIT = 8;

export default function BookDetailPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { bookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { books, sessions, activeSession } = useData();
  const book = books.find((b) => b.id === bookId);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAfterFinish, setReviewAfterFinish] = useState(false);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [addingManual, setAddingManual] = useState(false);

  // Chegou aqui logo depois de concluir o livro pelo cronômetro: convida
  // para o comentário final (uma vez; o estado da navegação é limpo).
  useEffect(() => {
    if (!location.state?.askReview || !book) return;
    setReviewAfterFinish(true);
    setReviewOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, book, navigate]);
  useDocumentTitle(book ? book.title : 'Livro não encontrado');

  const bookSessions = useMemo(
    () => sortSessionsByDateDesc(sessions.filter((s) => s.bookId === bookId)),
    [sessions, bookId],
  );

  if (!book) {
    return (
      <div className="page">
        <EmptyState
          titleAs="h1"
          icon={BookX}
          title="Livro não encontrado"
          description="Ele pode ter sido removido. Volte para a biblioteca para escolher outro."
          action={<Button to={ROUTES.library} icon={ArrowLeft}>Voltar para a biblioteca</Button>}
        />
      </div>
    );
  }

  const progress = getBookProgress(book);
  const pastRead = Boolean(book.addedAsRead);
  // Página impressa (currentPage) x progresso de leitura (a partir da página inicial do texto).
  const contentStart = getContentStart(book);
  const readable = getReadablePages(book);
  const contentDone = getContentPagesDone(book);
  const remaining = book.totalPages ? Math.max(0, readable - contentDone) : 0;
  const withoutDuration = bookSessions.filter((s) => s.durationSeconds === null || s.durationSeconds === undefined).length;
  const totalSeconds = sumSeconds(bookSessions);
  const pace = calculatePace(bookSessions);
  const estimateSeconds = book.status !== 'finished' && pace.reliable ? (remaining / pace.pagesPerMinute) * 60 : 0;

  const timerHere = activeSession?.bookId === book.id;
  const timerElsewhere = activeSession && !timerHere ? books.find((b) => b.id === activeSession.bookId) : null;

  // Livro lido antes do ReadTrack: mostramos só o que foi informado e
  // dizemos claramente o que não existe (sem sessões, não há tempo nem ritmo).
  const pastFacts = [
    {
      label: 'Páginas',
      value: book.totalPages ? formatNumber(book.totalPages) : '—',
      detail: book.totalPages ? 'total do livro' : 'não informado',
    },
    {
      label: 'Conclusão',
      value: book.finishedAt ? formatShortDate(book.finishedAt) : '—',
      detail: book.finishedAt ? new Date(book.finishedAt).getFullYear() : 'data não informada',
    },
    { label: 'Tempo de leitura', value: '—', detail: 'não registrado: lido antes do ReadTrack' },
    { label: 'Velocidade média', value: '—', detail: 'sem sessões cronometradas' },
  ];

  const facts = pastRead ? pastFacts : [
    {
      label: 'Páginas lidas',
      value: formatNumber(contentDone),
      detail: !book.totalPages
        ? 'total do livro não informado'
        : contentStart > 1
          ? `de ${formatNumber(readable)} de leitura (texto a partir da p. ${contentStart})`
          : `de ${formatNumber(book.totalPages)}`,
    },
    {
      label: 'Restantes',
      value: book.totalPages ? formatNumber(remaining) : '—',
      detail: !book.totalPages
        ? 'informe o total de páginas para calcular'
        : estimateSeconds > 0 ? `cerca de ${formatDuration(estimateSeconds)} no seu ritmo` : remaining === 0 ? 'livro terminado' : 'ritmo ainda não medido',
    },
    {
      label: 'Tempo de leitura',
      value: formatDuration(totalSeconds),
      detail: `${pluralize(bookSessions.length, 'sessão', 'sessões')}${withoutDuration ? ` · ${withoutDuration} sem duração` : ''}`,
    },
    {
      label: 'Velocidade média',
      value: pace.reliable ? `${formatNumber(Math.round(pace.pagesPerHour))} pág/h` : '—',
      detail: pace.reliable
        ? `${formatDecimal(pace.minutesPerPage)} min por página`
        : bookSessions.length > 0
          ? 'dados insuficientes (mín. 10 min e 5 páginas)'
          : 'registre uma sessão',
    },
  ];

  const dates = [
    book.startedAt && ['Início', formatFullDate(book.startedAt)],
    book.finishedAt && ['Conclusão', formatFullDate(book.finishedAt)],
    book.createdAt && ['Cadastrado em', formatFullDate(book.createdAt)],
  ].filter(Boolean);

  return (
    <div className="page book-detail">
      <Button to={ROUTES.library} variant="ghost" size="sm" icon={ArrowLeft} className="book-detail__back">
        Biblioteca
      </Button>

      <section className="book-detail__hero" aria-labelledby="book-title">
        <BookCover book={book} size="fluid" className="book-detail__cover" />
        <div className="book-detail__info">
          <div className="book-detail__badges">
            <StatusBadge status={book.status} />
            {pastRead && <span className="book-detail__origin">Lido antes do ReadTrack</span>}
          </div>
          <h1 id="book-title">{book.title}</h1>
          {book.author && <p className="book-detail__author">{book.author}</p>}
          {book.description && <p className="book-detail__description">{book.description}</p>}

          {!pastRead && (
          <div className="book-detail__progress">
            <div className="book-detail__progress-text tabular">
              <span>
                Página <strong>{formatNumber(book.currentPage)}</strong>
                {book.totalPages ? ` de ${formatNumber(book.totalPages)}` : ' · total de páginas não informado'}
                {contentStart > 1 && book.totalPages && (
                  <span className="book-detail__reading-pages">
                    {' '}
                    · {formatNumber(contentDone)} de {formatNumber(readable)} páginas de leitura
                  </span>
                )}
              </span>
              {(book.totalPages || book.status === 'finished') && <span className="book-detail__percent">{progress}%</span>}
            </div>
            {(book.totalPages || book.status === 'finished') && (
              <ProgressBar value={progress} tone={book.status === 'finished' ? 'success' : 'accent'} label="Progresso do livro" />
            )}
            {contentStart > 1 && (
              <p className="book-detail__content-start">
                O texto começa na página {contentStart}; as páginas anteriores não contam como lidas.
              </p>
            )}
          </div>
          )}

          <div className="book-detail__actions">
            {book.status !== 'finished' && !timerElsewhere && (
              <Button to={`${ROUTES.reading}?livro=${book.id}`} icon={Timer}>
                {timerHere ? 'Voltar ao cronômetro' : 'Iniciar sessão'}
              </Button>
            )}
            {!pastRead && (
              <Button variant="secondary" icon={PenLine} onClick={() => setAddingManual(true)}>
                Adicionar sessão manual
              </Button>
            )}
            <Button to={ROUTES.editBook(book.id)} variant="secondary" icon={Pencil}>
              Editar
            </Button>
            <BookActionsMenu book={book} showRead={false} onDeleted={() => navigate(ROUTES.library, { replace: true })} />
          </div>
          {timerElsewhere && book.status !== 'finished' && (
            <p className="book-detail__notice">
              Há uma sessão em andamento com <Link to={ROUTES.reading}>{timerElsewhere.title}</Link>. Finalize-a para
              começar este livro.
            </p>
          )}
        </div>
      </section>

      <dl className="book-detail__facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd className="book-detail__fact-value tabular">{fact.value}</dd>
            <dd className="book-detail__fact-detail">{fact.detail}</dd>
          </div>
        ))}
      </dl>

      {dates.length > 0 && (
        <dl className="book-detail__dates">
          {dates.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {hasFinalReview(book) ? (
        <Panel
          title="Comentário final"
          className="book-detail__final"
          action={
            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => { setReviewAfterFinish(false); setReviewOpen(true); }}>
              Editar comentário
            </Button>
          }
        >
          <div className="book-detail__review">
            {book.rating ? (
              <p className="book-detail__stars" aria-label={`Minha avaliação: ${book.rating} de 5`}>
                <span aria-hidden="true">{'★'.repeat(book.rating)}</span>
                <span aria-hidden="true" className="book-detail__stars-empty">
                  {'★'.repeat(5 - book.rating)}
                </span>
              </p>
            ) : (
              <p className="book-detail__muted">Sem nota.</p>
            )}
            {book.review && (
              <div>
                <h3 className="book-detail__review-label">O que achei do livro</h3>
                <p className="book-detail__review-text">{book.review}</p>
              </div>
            )}
            {book.learnings && (
              <div>
                <h3 className="book-detail__review-label">O que aprendi ou levo desta leitura</h3>
                <p className="book-detail__review-text">{book.learnings}</p>
              </div>
            )}
          </div>
        </Panel>
      ) : (
        book.status === 'finished' && (
          <div className="book-detail__review-invite">
            <MessageSquareQuote size={20} aria-hidden="true" />
            <p>Você concluiu este livro. Quer registrar o que achou e o que leva dele?</p>
            <Button variant="secondary" size="sm" onClick={() => { setReviewAfterFinish(false); setReviewOpen(true); }}>
              Escrever comentário final
            </Button>
          </div>
        )
      )}

      <Panel
        title="Sessões recentes"
        action={
          bookSessions.length > 0 ? (
            <Link to={`${ROUTES.history}?livro=${book.id}`} className="book-detail__history-link">
              {bookSessions.length > RECENT_LIMIT ? `Ver todas (${bookSessions.length})` : 'Ver no histórico'}
            </Link>
          ) : null
        }
      >
        {bookSessions.length === 0 ? (
          <EmptyState
            titleAs="h3"
            icon={Timer}
            title="Nenhuma sessão registrada"
            description={
              pastRead
                ? 'Este livro foi adicionado como já lido: não há sessões cronometradas, e nada foi estimado.'
                : book.status === 'finished'
                ? 'Este livro foi concluído sem sessões cronometradas.'
                : 'Use o cronômetro ou adicione uma sessão manual com o que você anotou.'
            }
          />
        ) : (
          <ol className="session-list">
            {bookSessions.slice(0, RECENT_LIMIT).map((session) => (
              <li key={session.id} className="session-list__item">
                <div className="session-list__date">
                  <span>{formatShortDate(session.startedAt)}</span>
                  <small className="tabular">{formatSessionPeriod(session)}</small>
                </div>
                <div className="session-list__main">
                  <p className="tabular">
                    Páginas {session.startPage}–{session.endPage}
                    <span className="session-list__pages"> +{session.pagesRead}</span>
                  </p>
                  <p className="session-list__meta session-list__badges">
                    <SourceBadge session={session} compact />
                    {session.vocabulary?.length > 0 && (
                      <span className="session-list__vocab">
                        <Languages size={13} aria-hidden="true" /> {pluralize(session.vocabulary.length, 'palavra')}
                      </span>
                    )}
                  </p>
                  {session.pauseCount > 0 && (
                    <p className="session-list__meta">
                      {pluralize(session.pauseCount, 'pausa')}, {formatDuration(session.pausedSeconds)} pausado
                    </p>
                  )}
                  {session.notes && (
                    <p className="session-list__notes">
                      <NotebookPen size={14} aria-hidden="true" />
                      <span>
                        <span className="visually-hidden">Observação de {formatShortDate(session.startedAt)}: </span>
                        {session.notes}
                      </span>
                    </p>
                  )}
                </div>
                <div className="session-list__side">
                  <p className="session-list__duration tabular">
                    <SessionDuration session={session} />
                  </p>
                  <button
                    type="button"
                    className="session-list__open"
                    onClick={() => setOpenSessionId(session.id)}
                    aria-label={`Detalhes da sessão de ${formatShortDate(session.startedAt)} às ${formatTime(session.startedAt)}`}
                  >
                    Detalhes
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <ManualSessionDialog open={addingManual} onClose={() => setAddingManual(false)} bookId={book.id} />
      <FinalReviewDialog book={book} open={reviewOpen} afterFinish={reviewAfterFinish} onClose={() => setReviewOpen(false)} />
      <SessionDialog
        session={bookSessions.find((s) => s.id === openSessionId)}
        book={book}
        open={Boolean(openSessionId)}
        onClose={() => setOpenSessionId(null)}
      />
    </div>
  );
}
