/**
 * Dados do Painel (1.7.0) — funções puras.
 * Tempo por formato (físico, e-book/PDF, audiobook) por dia, livros em
 * andamento para o "Lendo agora" e os números de cada um.
 */
import { addDays, startOfDay, startOfWeek, toDate } from './date.js';
import { buildLedger, summarizeRange } from './ledger.js';
import { FORMAT_LIST, getProgressKind, normalizeFormat, PROGRESS_KINDS } from './formats.js';
import { hasKnownDuration } from './duration.js';

/** Sessões separadas por formato do livro. */
export function splitSessionsByFormat(sessions, books) {
  const formatOf = new Map(books.map((b) => [b.id, normalizeFormat(b.format)]));
  const out = { print: [], digital: [], audio: [] };
  for (const s of sessions) out[formatOf.get(s.bookId) ?? 'print'].push(s);
  return out;
}

/**
 * Para cada dia de [start, start + days): segundos por formato, páginas e
 * sessões (a divisão pela meia-noite segue o livro-razão, como no resto do site).
 */
export function getDailyByFormat({ sessions, books }, start, days = 7) {
  const split = splitSessionsByFormat(sessions, books);
  const ledgers = Object.fromEntries(FORMAT_LIST.map((f) => [f, buildLedger(split[f])]));
  return Array.from({ length: days }, (_, i) => {
    const from = addDays(startOfDay(start), i);
    const to = addDays(from, 1);
    const byFormat = Object.fromEntries(FORMAT_LIST.map((f) => [f, summarizeRange(ledgers[f], from, to)]));
    return {
      date: from,
      seconds: Object.fromEntries(FORMAT_LIST.map((f) => [f, byFormat[f].seconds])),
      pages: Object.fromEntries(FORMAT_LIST.map((f) => [f, byFormat[f].pages])),
      sessions: Object.fromEntries(FORMAT_LIST.map((f) => [f, byFormat[f].sessions])),
      totalSeconds: FORMAT_LIST.reduce((t, f) => t + byFormat[f].seconds, 0),
    };
  });
}

/** Os 7 dias da semana atual (respeitando o início da semana escolhido). */
export function getCurrentWeekByFormat(data, now = new Date(), weekStartsOn = 'monday') {
  const start = startOfWeek(now, weekStartsOn);
  const days = getDailyByFormat(data, start, 7);
  const today = startOfDay(now).getTime();
  return days.map((d) => ({ ...d, isToday: d.date.getTime() === today, future: d.date.getTime() > today }));
}

/** Totais da semana por formato: segundos, páginas e sessões. */
export function sumWeekByFormat(week) {
  const out = {};
  for (const f of FORMAT_LIST) {
    out[f] = {
      seconds: week.reduce((t, d) => t + d.seconds[f], 0),
      pages: week.reduce((t, d) => t + d.pages[f], 0),
      sessions: week.reduce((t, d) => t + d.sessions[f], 0),
    };
  }
  return out;
}

const time = (value) => toDate(value)?.getTime() ?? 0;

/** Livros "Lendo", do mais recente (última sessão ou atualização) ao mais antigo. */
export function getReadingBooks(books, sessions) {
  const last = new Map();
  for (const s of sessions) {
    const t = time(s.finishedAt ?? s.startedAt);
    if (t > (last.get(s.bookId) ?? 0)) last.set(s.bookId, t);
  }
  const activity = (b) => Math.max(time(b.updatedAt), last.get(b.id) ?? 0);
  return books.filter((b) => b.status === 'reading').sort((a, b) => activity(b) - activity(a));
}

/** Números de um livro para o "Lendo agora": tempo, sessões e ritmo/estimativa. */
export function getBookNumbers(book, sessions) {
  const own = sessions.filter((s) => s.bookId === book.id);
  const seconds = own.reduce((t, s) => t + (hasKnownDuration(s) ? Number(s.durationSeconds) : 0), 0);
  const kind = getProgressKind(book);
  let perUnit = null; // páginas: minutos por página; áudio: velocidade média
  if (kind === PROGRESS_KINDS.PAGES) {
    const timed = own.filter((s) => hasKnownDuration(s) && s.durationSeconds > 0 && s.pagesRead > 0);
    const pages = timed.reduce((t, s) => t + s.pagesRead, 0);
    const secs = timed.reduce((t, s) => t + s.durationSeconds, 0);
    if (pages >= 5 && secs >= 600) perUnit = secs / 60 / pages;
  }
  if (kind === PROGRESS_KINDS.AUDIO) {
    const timed = own.filter((s) => hasKnownDuration(s) && s.durationSeconds > 0 && s.endPositionSeconds > s.startPositionSeconds);
    const audio = timed.reduce((t, s) => t + (s.endPositionSeconds - s.startPositionSeconds), 0);
    const secs = timed.reduce((t, s) => t + s.durationSeconds, 0);
    if (secs >= 600) perUnit = audio / secs; // segundos de áudio por segundo ouvido (≈ velocidade)
  }
  return { seconds, sessions: own.length, perUnit, lastSession: own.sort((a, b) => time(b.startedAt) - time(a.startedAt))[0] ?? null };
}

/**
 * Quanto tempo falta, quando dá para estimar sem inventar:
 * - páginas: páginas restantes × minutos por página medidos;
 * - áudio: duração restante ÷ velocidade média medida (ou a habitual).
 * Porcentagem: sem estimativa.
 */
export function estimateRemainingSeconds(book, numbers) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PAGES && book.totalPages && numbers.perUnit) {
    return Math.max(0, book.totalPages - book.currentPage) * numbers.perUnit * 60;
  }
  if (kind === PROGRESS_KINDS.AUDIO && book.audioDurationSeconds) {
    const left = Math.max(0, book.audioDurationSeconds - (book.audioPositionSeconds || 0));
    const speed = numbers.perUnit ?? book.audioSpeed ?? 1;
    return left / Math.max(0.5, speed);
  }
  return null;
}

/** A conquista em andamento mais perto de ser desbloqueada. */
export function getNextAchievement(evaluated) {
  return (
    evaluated
      .filter((a) => !a.unlocked && !a.blocked)
      .reduce((best, a) => {
        if (!best) return a;
        // Primeiro nível pendente de cada categoria; entre eles, o de maior progresso.
        return a.ratio > best.ratio ? a : best;
      }, null) ?? null
  );
}
