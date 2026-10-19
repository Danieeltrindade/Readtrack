/**
 * Regras das sessões de leitura — funções puras.
 *
 * CONVENÇÃO DE PÁGINAS ("marcador de livro")
 * As páginas informadas são posições do marcador, não páginas lidas:
 * - página inicial = última página concluída ANTES da sessão;
 * - página final   = última página concluída AO FINAL da sessão;
 * - páginas lidas  = página final − página inicial.
 *
 * Exemplo: sessão A de 0 a 30 (30 páginas), sessão B de 30 a 50
 * (20 páginas). A página 30 não é contada duas vezes: total 50.
 *
 * PROGRESSO DO LIVRO ≠ SOMA DAS SESSÕES
 * O progresso é a maior página alcançada: max(página atual, página final).
 * Nunca somamos páginas lidas para obter o progresso, porque o usuário
 * pode reler trechos. Por isso cada sessão guarda dois números:
 * - pagesRead: esforço de leitura da sessão (usado em estatísticas de volume);
 * - newPages: quanto o progresso do livro avançou (0 numa releitura).
 */
import { applyStatusChange } from './books.js';
import { getFinishedAt, getPauseCount, getPausedSeconds } from './timer.js';
import { SESSION_SOURCES, computeNewPagesByUnion, getContentStart, getPageBefore, withRecomputedNewPages } from './pages.js';

/** Calcula páginas lidas e páginas novas para um intervalo. */
export function calculateSessionPages({ startPage, endPage, previousProgress = 0 }) {
  const pagesRead = Math.max(0, endPage - startPage);
  const newPages = Math.max(0, endPage - Math.max(startPage, previousProgress));
  return { pagesRead, newPages, overlap: pagesRead - newPages };
}

/**
 * Monta a sessão definitiva a partir da sessão ativa + dados validados.
 * O id é o MESMO da sessão ativa: salvar duas vezes gera o mesmo id,
 * e o reducer ignora a duplicata.
 */
export function buildSession(active, data, { book, now = new Date() }) {
  const { pagesRead, newPages } = calculateSessionPages({
    startPage: data.startPage,
    endPage: data.endPage,
    previousProgress: book.currentPage,
  });
  const finishedAt = getFinishedAt(active, now);
  return {
    id: active.id,
    bookId: active.bookId,
    startedAt: active.startedAt,
    finishedAt,
    durationSeconds: data.durationSeconds,
    pausedSeconds: getPausedSeconds(active, now),
    pauseCount: getPauseCount(active),
    segments: active.segments.map((s) => ({ start: s.start, end: s.end ?? finishedAt })),
    startPage: data.startPage,
    endPage: data.endPage,
    pagesRead,
    newPages,
    notes: data.notes,
    vocabulary: [],
    source: SESSION_SOURCES.TIMER,
    createdAt: new Date(now).toISOString(),
    isDemo: false,
  };
}

/**
 * Atualiza o livro depois de uma sessão:
 * - página atual avança para a página final (nunca recua);
 * - "Quero ler" vira "Lendo" e ganha data de início;
 * - se o usuário confirmou a conclusão, o livro vira "Concluído"
 *   com a data de término da sessão.
 */
export function applySessionToBook(book, session, { markFinished = false } = {}) {
  let next = {
    ...book,
    currentPage: book.totalPages ? Math.min(book.totalPages, Math.max(book.currentPage, session.endPage)) : Math.max(book.currentPage, session.endPage),
    updatedAt: session.finishedAt,
  };
  if (next.status === 'want-to-read') {
    next = { ...applyStatusChange(next, 'reading', session.startedAt), updatedAt: session.finishedAt };
  }
  if (!next.startedAt) next.startedAt = session.startedAt;
  if (markFinished && next.status !== 'finished') {
    next = { ...applyStatusChange(next, 'finished', session.finishedAt), updatedAt: session.finishedAt };
  }
  return next;
}

/** Livros que podem receber uma nova sessão (não concluídos). */
export function getReadableBooks(books) {
  return books.filter((b) => b.status !== 'finished');
}

/* ---------- Edição e exclusão de sessões ---------- */

const time = (value) => new Date(value).getTime();

/**
 * Tempo medido pelo cronômetro (soma dos intervalos lidos). Para sessões
 * antigas sem intervalos, vale a duração registrada. Uma edição nunca pode
 * passar deste valor: não inventamos tempo de leitura.
 */
export function getMeasuredSeconds(session) {
  const segments = Array.isArray(session.segments) ? session.segments : [];
  const measured = segments.reduce((sum, s) => {
    const span = (time(s.end) - time(s.start)) / 1000;
    return Number.isFinite(span) && span > 0 ? sum + span : sum;
  }, 0);
  return Math.floor(Math.max(measured, Number(session.durationSeconds) || 0));
}

/**
 * Recalcula as "páginas novas" das sessões de UM livro, em ordem
 * cronológica, pela união das páginas já cobertas (utils/pages.js):
 * sessões fora de ordem, com lacunas ou releituras nunca contam a mesma
 * página duas vezes, e páginas antes do início do conteúdo não contam.
 */
export function recomputeNewPages(bookSessions, contentStart = 1) {
  return computeNewPagesByUnion(bookSessions, contentStart);
}

/**
 * Aplica a edição (`change.session`) ou a exclusão (`change.deleteId`) de
 * uma sessão e devolve o livro e a lista de sessões coerentes:
 * - as páginas novas das sessões do livro são recalculadas;
 * - a página atual do livro acompanha as sessões, sem recuar abaixo da
 *   página em que a sessão alterada começou e sem desfazer um progresso
 *   que o usuário registrou à mão além das sessões;
 * - livro concluído continua concluído (página atual = total).
 */
export function applySessionChange({ book, sessions, change, now = new Date() }) {
  const targetId = change.session?.id ?? change.deleteId;
  const old = sessions.find((s) => s.id === targetId);
  if (!old || !book || old.bookId !== book.id) return null;

  const nextAll = change.deleteId
    ? sessions.filter((s) => s.id !== targetId)
    : sessions.map((s) => (s.id === targetId ? { ...old, ...change.session } : s));

  const bookSessionsBefore = sessions.filter((s) => s.bookId === book.id);
  const bookSessionsAfter = nextAll.filter((s) => s.bookId === book.id);
  const finalSessions = withRecomputedNewPages(nextAll, book);

  let currentPage = book.currentPage;
  if (book.status === 'finished') {
    currentPage = book.totalPages ?? book.currentPage;
  } else {
    const maxBefore = Math.max(0, ...bookSessionsBefore.map((s) => s.endPage));
    const maxAfter = Math.max(0, ...bookSessionsAfter.map((s) => s.endPage));
    const manualBeyondSessions = book.currentPage > maxBefore;
    currentPage = manualBeyondSessions ? Math.max(book.currentPage, maxAfter) : Math.max(maxAfter, getPageBefore(old));
    if (book.totalPages) currentPage = Math.min(book.totalPages, currentPage);
  }

  const nextBook = currentPage === book.currentPage ? book : { ...book, currentPage, updatedAt: new Date(now).toISOString() };
  return { book: nextBook, sessions: finalSessions };
}

/* ---------- Sessões novas (registro manual e importação) ---------- */

const minIso = (a, b) => (!a ? b : !b ? a : new Date(a) <= new Date(b) ? a : b);

/**
 * Acrescenta sessões já validadas e ajusta os livros afetados:
 * - páginas novas recalculadas pela união de páginas (sem dupla contagem);
 * - página atual = maior página alcançada (nunca recua);
 * - "Quero ler" passa a "Lendo"; data de início = sessão mais antiga;
 * - livro concluído continua como está (nenhuma data de conclusão é criada
 *   ou alterada por sessões).
 */
export function applyAddedSessions({ books, sessions, added, now = new Date() }) {
  const known = new Set(sessions.map((s) => s.id));
  const fresh = added.filter((s) => !known.has(s.id));
  if (fresh.length === 0) return { books, sessions, added: [] };

  let nextSessions = [...sessions, ...fresh];
  const touched = new Set(fresh.map((s) => s.bookId));
  const nextBooks = books.map((book) => {
    if (!touched.has(book.id)) return book;
    const own = fresh.filter((s) => s.bookId === book.id);
    const maxEnd = Math.max(...own.map((s) => s.endPage));
    const earliest = own.map((s) => s.startedAt).reduce(minIso, null);
    let next = { ...book, updatedAt: new Date(now).toISOString() };
    if (book.status !== 'finished') {
      next.currentPage = Math.max(book.currentPage, book.totalPages ? Math.min(book.totalPages, maxEnd) : maxEnd);
      if (book.status === 'want-to-read') next.status = 'reading';
      next.startedAt = minIso(book.startedAt, earliest);
    }
    nextSessions = withRecomputedNewPages(nextSessions, next);
    return next;
  });
  return { books: nextBooks, sessions: nextSessions, added: fresh };
}

/** Página em que uma nova sessão do cronômetro começa (respeita o início do conteúdo). */
export function getTimerStartPage(book) {
  return Math.max(book.currentPage, getContentStart(book) - 1);
}

/**
 * Sessão de registro manual (dados de validateManualSession).
 * - startedAt/finishedAt: os instantes informados (finishedAt pode ser null);
 * - durationSeconds: a duração ANOTADA, preservada como veio (pode ser null);
 * - createdAt: quando o registro foi cadastrado — nunca confundido com a
 *   data da leitura.
 */
export function buildManualSession(data, { id, now = new Date() }) {
  return {
    id,
    bookId: data.bookId,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    durationSeconds: data.durationSeconds,
    pausedSeconds: 0,
    pauseCount: 0,
    segments: [],
    startPage: data.startPage,
    endPage: data.endPage,
    pagesRead: data.pagesRead,
    newPages: data.pagesRead,
    notes: data.notes,
    vocabulary: data.vocabulary,
    source: SESSION_SOURCES.MANUAL,
    createdAt: new Date(now).toISOString(),
    isDemo: false,
  };
}
