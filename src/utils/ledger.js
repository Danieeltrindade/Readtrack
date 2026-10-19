/**
 * Livro-razão diário: a fonte única de números por dia.
 *
 * Toda estatística (Dashboard, Estatísticas, Metas, Conquistas) parte daqui,
 * para que a mesma pergunta nunca tenha duas respostas em telas diferentes.
 *
 * REGRAS
 * 1. Tempo: cada sessão é distribuída pelos dias locais em que a leitura
 *    realmente aconteceu, usando os intervalos de leitura (segments).
 *    Uma sessão das 23:40 às 00:20 conta 20 min num dia e 20 min no outro.
 *    Pausas não contam. Se a duração foi reduzida ao salvar, os intervalos
 *    são reduzidos na mesma proporção.
 * 2. Páginas: não sabemos em que minuto cada página foi lida, então elas
 *    são divididas entre os dias na proporção do tempo lido em cada um
 *    (números inteiros, método do maior resto: a soma bate com o total).
 * 3. Sessões: contam no dia em que COMEÇARAM.
 * 4. Dados ausentes: sessão sem intervalos usa [início, início + duração];
 *    sem duração (0), todas as páginas ficam no dia do início.
 * 5. Dia de leitura: dia com pelo menos 1 minuto lido ou 1 página registrada.
 */
import { addDays, listDateKeys, startOfDay, toDate, toDateKey } from './date.js';

export const MIN_READING_DAY_SECONDS = 60;

/** Divide `total` (inteiro) em partes proporcionais aos pesos, somando exatamente `total`. */
export function largestRemainder(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map((_, i) => (i === 0 ? Math.max(0, total) : 0));
  const raw = weights.map((w) => (w / sum) * total);
  const parts = raw.map(Math.floor);
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((value, i) => ({ i, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k += 1, rest -= 1) parts[order[k % order.length].i] += 1;
  return parts;
}

/** Intervalos de leitura válidos da sessão, em milissegundos. */
export function getSessionIntervals(session) {
  // Registro manual: o intervalo é o que foi anotado (início → término).
  // Sem término conhecido, nada é deduzido: a sessão inteira fica no dia
  // em que começou (allocateSession usa a data de início).
  if (session.source === 'manual') {
    const start = toDate(session.startedAt)?.getTime();
    const end = toDate(session.finishedAt)?.getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ start, end }] : [];
  }
  const intervals = (Array.isArray(session.segments) ? session.segments : [])
    .map((s) => ({ start: toDate(s.start)?.getTime(), end: toDate(s.end)?.getTime() }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  if (intervals.length > 0) return intervals;

  const start = toDate(session.startedAt)?.getTime();
  if (!Number.isFinite(start)) return [];
  const duration = Math.max(0, Number(session.durationSeconds) || 0) * 1000;
  return duration > 0 ? [{ start, end: start + duration }] : [];
}

/** Milissegundos de cada intervalo, cortados nas meias-noites locais. */
function splitByDay(intervals) {
  const perDay = new Map();
  for (const { start, end } of intervals) {
    let cursor = start;
    while (cursor < end) {
      const nextMidnight = addDays(cursor, 1).getTime();
      const chunkEnd = Math.min(end, nextMidnight);
      const key = toDateKey(cursor);
      perDay.set(key, (perDay.get(key) ?? 0) + (chunkEnd - cursor));
      cursor = chunkEnd;
    }
  }
  return perDay;
}

/**
 * Distribui uma sessão pelos dias.
 * @returns {Array<{ dateKey, seconds, pages, newPages }>}
 */
export function allocateSession(session) {
  const duration = Math.max(0, Math.round(Number(session.durationSeconds) || 0));
  const pagesRead = Math.max(0, Math.round(Number(session.pagesRead) || 0));
  const newPages = Math.max(0, Math.min(pagesRead, Math.round(Number(session.newPages ?? pagesRead) || 0)));
  const perDay = splitByDay(getSessionIntervals(session));

  if (perDay.size === 0) {
    const key = toDateKey(session.startedAt);
    return key ? [{ dateKey: key, seconds: duration, pages: pagesRead, newPages }] : [];
  }

  const keys = [...perDay.keys()].sort();
  const weights = keys.map((k) => perDay.get(k));
  const seconds = largestRemainder(duration, weights);
  const pages = largestRemainder(pagesRead, weights);
  const fresh = largestRemainder(newPages, weights);
  return keys.map((dateKey, i) => ({ dateKey, seconds: seconds[i], pages: pages[i], newPages: fresh[i] }));
}

function emptyDay(dateKey) {
  return { dateKey, seconds: 0, pages: 0, newPages: 0, sessions: 0 };
}

/** Constrói o livro-razão: Map de "AAAA-MM-DD" → totais do dia. */
export function buildLedger(sessions) {
  const ledger = new Map();
  const day = (key) => {
    if (!ledger.has(key)) ledger.set(key, emptyDay(key));
    return ledger.get(key);
  };
  for (const session of sessions) {
    for (const part of allocateSession(session)) {
      const entry = day(part.dateKey);
      entry.seconds += part.seconds;
      entry.pages += part.pages;
      entry.newPages += part.newPages;
    }
    const startKey = toDateKey(session.startedAt);
    if (startKey) day(startKey).sessions += 1;
  }
  return ledger;
}

export function isReadingDay(entry) {
  return Boolean(entry) && (entry.seconds >= MIN_READING_DAY_SECONDS || entry.pages > 0);
}

/** Dias (com zeros) e totais de um intervalo [start, end). */
export function summarizeRange(ledger, start, end) {
  const days = listDateKeys(start, end).map((key) => ({ ...(ledger.get(key) ?? emptyDay(key)), date: startOfDay(new Date(`${key}T12:00:00`)) }));
  const totals = days.reduce(
    (acc, d) => {
      acc.seconds += d.seconds;
      acc.pages += d.pages;
      acc.newPages += d.newPages;
      acc.sessions += d.sessions;
      if (isReadingDay(d)) acc.readingDays += 1;
      return acc;
    },
    { seconds: 0, pages: 0, newPages: 0, sessions: 0, readingDays: 0 },
  );
  return { ...totals, days };
}

/** Dias de leitura, em ordem crescente. */
export function getReadingDayKeys(ledger) {
  return [...ledger.values()].filter(isReadingDay).map((d) => d.dateKey).sort();
}

/* ---------- Distribuição por hora (gráfico do período "Dia") ---------- */

/**
 * Tempo e páginas de um dia distribuídos pelas 24 horas, com as MESMAS
 * regras do livro-razão: intervalos reais de leitura (sessões que passam da
 * meia-noite entram só com a parte deste dia), duração registrada repartida
 * pelo tempo de cada hora e páginas na mesma proporção (números inteiros).
 * Sessão sem horário de término: fica inteira na hora em que começou.
 * Os totais de cada sessão neste dia batem com o livro-razão do dia.
 */
export function summarizeHours(sessions, day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const dayKey = toDateKey(dayStart);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, seconds: 0, pages: 0, newPages: 0, sessions: 0 }));
  for (const session of sessions) {
    const part = allocateSession(session).find((p) => p.dateKey === dayKey);
    const startedAt = toDate(session.startedAt);
    if (startedAt && toDateKey(startedAt) === dayKey) hours[startedAt.getHours()].sessions += 1;
    if (!part) continue;
    // Milissegundos de leitura em cada hora deste dia.
    const perHour = new Array(24).fill(0);
    for (const { start, end } of getSessionIntervals(session)) {
      let cursor = Math.max(start, dayStart.getTime());
      const stop = Math.min(end, dayEnd.getTime());
      while (cursor < stop) {
        const at = new Date(cursor);
        const nextHour = new Date(at.getFullYear(), at.getMonth(), at.getDate(), at.getHours() + 1).getTime();
        const chunkEnd = Math.min(stop, nextHour);
        perHour[at.getHours()] += chunkEnd - cursor;
        cursor = chunkEnd;
      }
    }
    if (perHour.every((ms) => ms === 0)) {
      const hour = startedAt && toDateKey(startedAt) === dayKey ? startedAt.getHours() : 0;
      hours[hour].seconds += part.seconds;
      hours[hour].pages += part.pages;
      hours[hour].newPages += part.newPages;
      continue;
    }
    const seconds = largestRemainder(part.seconds, perHour);
    const pages = largestRemainder(part.pages, perHour);
    const fresh = largestRemainder(part.newPages, perHour);
    for (let h = 0; h < 24; h += 1) {
      hours[h].seconds += seconds[h];
      hours[h].pages += pages[h];
      hours[h].newPages += fresh[h];
    }
  }
  return hours;
}
