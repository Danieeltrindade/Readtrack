/**
 * Histórico de sessões — filtros puros (testados em history.test.js).
 * Só mostra sessões realmente registradas: nada é inventado para livros
 * lidos antes do ReadTrack.
 */
import { addDays, fromInputDate, startOfDay, startOfMonth, toDateKey } from './date.js';
import { normalizeText } from './books.js';

export const HISTORY_PERIODS = [
  { value: 'todos', label: 'Todo o período' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Escolher datas' },
];

export const HISTORY_PAGE_SIZE = 25;

/**
 * Intervalo [início, fim) do período escolhido, no fuso local.
 * `from`/`to` (AAAA-MM-DD, inclusivos) só valem para "personalizado".
 */
export function getHistoryRange(period, { from, to } = {}, now = new Date()) {
  const tomorrow = addDays(startOfDay(now), 1);
  switch (period) {
    case '7d':
      return { start: addDays(tomorrow, -7), end: tomorrow };
    case '30d':
      return { start: addDays(tomorrow, -30), end: tomorrow };
    case 'mes':
      return { start: startOfMonth(now), end: tomorrow };
    case 'ano':
      return { start: new Date(new Date(now).getFullYear(), 0, 1), end: tomorrow };
    case 'personalizado': {
      // fromInputDate devolve meio-dia; o filtro usa o dia inteiro.
      const first = from ? fromInputDate(from) : null;
      const last = to ? fromInputDate(to) : null;
      return { start: first ? startOfDay(first) : null, end: last ? addDays(startOfDay(last), 1) : null };
    }
    default:
      return { start: null, end: null };
  }
}

/** Datas personalizadas inválidas (início depois do fim). */
export function getRangeError(period, { from, to } = {}) {
  if (period !== 'personalizado' || !from || !to) return null;
  return from > to ? 'A data inicial é depois da data final.' : null;
}

/**
 * Filtra e ordena (mais recente primeiro).
 * @param filters { bookId, period, from, to, query }
 */
export function filterHistory(sessions, booksById, filters = {}, now = new Date()) {
  const { bookId = '', period = 'todos', query = '' } = filters;
  const { start, end } = getRangeError(period, filters) ? { start: null, end: null } : getHistoryRange(period, filters, now);
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);

  return sessions
    .filter((session) => {
      const book = booksById.get(session.bookId);
      if (!book) return false;
      if (bookId && session.bookId !== bookId) return false;
      const time = new Date(session.startedAt).getTime();
      if (start && time < start.getTime()) return false;
      if (end && time >= end.getTime()) return false;
      if (terms.length) {
        const haystack = normalizeText(`${book.title} ${book.author}`);
        if (!terms.every((t) => haystack.includes(t))) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt) || String(b.id).localeCompare(String(a.id)));
}

/** Agrupa sessões já ordenadas por dia local (para os cabeçalhos da lista). */
export function groupByDay(sessions) {
  const groups = [];
  for (const session of sessions) {
    const key = toDateKey(session.startedAt);
    const last = groups.at(-1);
    if (last && last.dateKey === key) last.sessions.push(session);
    else groups.push({ dateKey: key, date: session.startedAt, sessions: [session] });
  }
  return groups;
}

/** Totais do que está filtrado. */
export function summarizeHistory(sessions) {
  return sessions.reduce(
    (acc, s) => ({
      sessions: acc.sessions + 1,
      pages: acc.pages + (s.pagesRead || 0),
      seconds: acc.seconds + (s.durationSeconds || 0),
      withNotes: acc.withNotes + (s.notes || s.vocabulary?.length ? 1 : 0),
      withoutDuration: acc.withoutDuration + (Number(s.durationSeconds) > 0 ? 0 : 1),
    }),
    { sessions: 0, pages: 0, seconds: 0, withNotes: 0, withoutDuration: 0 },
  );
}
