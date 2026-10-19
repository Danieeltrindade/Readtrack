/**
 * Páginas impressas × progresso de leitura — funções puras.
 *
 * PÁGINA INICIAL DA LEITURA (book.contentStartPage)
 * Muitos livros têm capa, sumário e prefácio antes do texto. O usuário pode
 * dizer em que página IMPRESSA o conteúdo começa (ex.: 9). Então:
 * - página atual e páginas das sessões continuam sendo números impressos
 *   (nada é convertido nem alterado);
 * - o progresso conta só do início do conteúdo até o total:
 *   páginas de leitura = total − início + 1 (ex.: 400 − 9 + 1 = 392);
 * - páginas antes do início não contam como páginas novas do livro.
 * Sem o campo, o início é a página 1 (comportamento das versões anteriores).
 *
 * DUAS CONVENÇÕES DE PÁGINAS NAS SESSÕES
 * - Cronômetro (source "timer"): marcador de livro. Início = última página
 *   concluída antes da sessão; páginas lidas = final − inicial (ex.: 8→14 = 6).
 * - Registro manual (source "manual"): intervalo como se anota no caderno,
 *   da primeira à última página lida, inclusive (ex.: 9–14 = 6).
 * As duas cobrem exatamente as mesmas páginas; só a forma de escrever muda.
 */

export const SESSION_SOURCES = Object.freeze({ TIMER: 'timer', MANUAL: 'manual' });

export const isManualSession = (session) => session?.source === SESSION_SOURCES.MANUAL;

/** Página impressa em que a leitura começa (1 se não configurada). */
export function getContentStart(book) {
  const start = Number(book?.contentStartPage);
  return Number.isInteger(start) && start >= 1 ? start : 1;
}

/** Quantidade de páginas de leitura (do início do conteúdo ao total), ou null. */
export function getReadablePages(book) {
  if (!book?.totalPages) return null;
  return Math.max(1, book.totalPages - getContentStart(book) + 1);
}

/** Páginas de conteúdo já lidas segundo a página atual (nunca negativo). */
export function getContentPagesDone(book) {
  if (!book) return 0;
  const current = book.totalPages ? Math.min(book.currentPage, book.totalPages) : book.currentPage;
  return Math.max(0, (Number(current) || 0) - (getContentStart(book) - 1));
}

/** Páginas lidas numa sessão, conforme a convenção dela. */
export function countSessionPages(source, startPage, endPage) {
  if (source === SESSION_SOURCES.MANUAL) return Math.max(0, endPage - startPage + 1);
  return Math.max(0, endPage - startPage);
}

/** Páginas impressas cobertas pela sessão: { from, to } inclusivo, ou null. */
export function getSessionCoverage(session) {
  const from = isManualSession(session) ? session.startPage : session.startPage + 1;
  const to = session.endPage;
  return to >= from ? { from, to } : null;
}

/**
 * Antes desta sessão, até que página o marcador já estava (para o livro não
 * "recuar" além disso quando a sessão é editada ou excluída).
 */
export function getPageBefore(session) {
  return isManualSession(session) ? Math.max(0, session.startPage - 1) : session.startPage;
}

/* ---------- União de intervalos (páginas novas sem dupla contagem) ---------- */

function overlapWithUnion(union, from, to) {
  let covered = 0;
  for (const [a, b] of union) {
    const lo = Math.max(a, from);
    const hi = Math.min(b, to);
    if (hi >= lo) covered += hi - lo + 1;
  }
  return covered;
}

function addToUnion(union, from, to) {
  const next = [...union, [from, to]].sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of next) {
    const last = merged.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/**
 * Páginas novas de cada sessão de UM livro, em ordem cronológica: só contam
 * páginas a partir do início do conteúdo que nenhuma sessão anterior cobriu.
 * Funciona com sessões fora de ordem de páginas, com lacunas entre elas e
 * com releituras — nunca soma a mesma página duas vezes.
 */
export function computeNewPagesByUnion(bookSessions, contentStart = 1) {
  const ordered = [...bookSessions].sort(
    (a, b) => new Date(a.startedAt) - new Date(b.startedAt) || String(a.id).localeCompare(String(b.id)),
  );
  let union = [];
  const result = new Map();
  for (const session of ordered) {
    const coverage = getSessionCoverage(session);
    if (!coverage) {
      result.set(session.id, 0);
      continue;
    }
    const from = Math.max(coverage.from, contentStart);
    if (coverage.to < from) {
      result.set(session.id, 0);
      continue;
    }
    const size = coverage.to - from + 1;
    result.set(session.id, size - overlapWithUnion(union, from, coverage.to));
    union = addToUnion(union, from, coverage.to);
  }
  return result;
}

/** Aplica as páginas novas recalculadas às sessões de um livro. */
export function withRecomputedNewPages(sessions, book) {
  const own = sessions.filter((s) => s.bookId === book.id);
  const fresh = computeNewPagesByUnion(own, getContentStart(book));
  return sessions.map((s) => {
    if (s.bookId !== book.id) return s;
    const newPages = Math.min(fresh.get(s.id) ?? 0, s.pagesRead);
    return newPages === s.newPages ? s : { ...s, newPages };
  });
}
