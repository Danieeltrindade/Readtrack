/**
 * Estatísticas de leitura — funções puras sobre o livro-razão diário
 * (utils/ledger.js). Veja as regras de calendário em utils/date.js.
 *
 * DEFINIÇÕES
 * - Páginas registradas: soma de (página final − inicial) das sessões.
 *   Inclui releituras; mede o esforço de leitura.
 * - Páginas novas (únicas): quanto o progresso dos livros avançou.
 *   Releitura conta 0. Mede o avanço real nos livros.
 * - Tempo efetivo: soma dos intervalos lidos, sem pausas.
 * - Médias por sessão: consideram as sessões INICIADAS no período, com seus
 *   valores completos (uma sessão que passa da meia-noite não vira "meia sessão").
 * - Média diária: total ÷ dias já decorridos do período (inclui dias sem
 *   leitura, exclui dias futuros).
 * - Ritmo (páginas por minuto/hora): só é considerado confiável com pelo
 *   menos 10 minutos efetivos e 5 páginas, ignorando sessões de duração zero.
 */
import {
  addDays,
  addMonths,
  countElapsedDays,
  diffInCalendarDays,
  fromDateKey,
  getElapsedEnd,
  isWithin,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDate,
  toDateKey,
} from './date.js';
import { buildLedger, getReadingDayKeys, isReadingDay, summarizeHours, summarizeRange } from './ledger.js';
import { getContentPagesDone, getReadablePages } from './pages.js';
import { hasKnownDuration } from './duration.js';

export const PACE_MIN_SECONDS = 600;
export const PACE_MIN_PAGES = 5;

export function sumPages(sessions) {
  return sessions.reduce((total, s) => total + (Number(s.pagesRead) || 0), 0);
}

export function sumNewPages(sessions) {
  return sessions.reduce((total, s) => total + (Number(s.newPages ?? s.pagesRead) || 0), 0);
}

export function sumSeconds(sessions) {
  return sessions.reduce((total, s) => total + (Number(s.durationSeconds) || 0), 0);
}

export function filterSessionsBetween(sessions, start, end) {
  return sessions.filter((s) => isWithin(s.startedAt, start, end));
}

/**
 * Ritmo de leitura. Sessões com duração zero (dados antigos ou incompletos)
 * não entram na conta. `reliable` diz se há dados suficientes para exibir.
 */
export function calculatePace(sessions) {
  const valid = sessions.filter((s) => Number(s.durationSeconds) > 0 && Number(s.pagesRead) > 0);
  const pages = sumPages(valid);
  const seconds = sumSeconds(valid);
  const reliable = seconds >= PACE_MIN_SECONDS && pages >= PACE_MIN_PAGES;
  if (seconds <= 0 || pages <= 0) return { pagesPerMinute: 0, pagesPerHour: 0, minutesPerPage: 0, reliable: false, seconds, pages };
  const pagesPerMinute = pages / (seconds / 60);
  return { pagesPerMinute, pagesPerHour: pagesPerMinute * 60, minutesPerPage: 1 / pagesPerMinute, reliable, seconds, pages };
}

/** Percentual de progresso de um livro, de 0 a 100. */
export function getBookProgress(book) {
  if (!book) return 0;
  if (book.status === 'finished') return 100;
  if (!book.totalPages) return 0;
  // Conta do início do conteúdo (página inicial da leitura) até o total.
  const value = (getContentPagesDone(book) / getReadablePages(book)) * 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function sortSessionsByDateDesc(sessions) {
  return [...sessions].sort((a, b) => (toDate(b.startedAt)?.getTime() ?? 0) - (toDate(a.startedAt)?.getTime() ?? 0));
}

export function countBooksByStatus(books) {
  return books.reduce(
    (acc, book) => {
      if (acc[book.status] !== undefined) acc[book.status] += 1;
      return acc;
    },
    { reading: 0, finished: 0, 'want-to-read': 0 },
  );
}

/** Livro em andamento mais recente (pela última sessão ou atualização). */
export function getCurrentBook(books, sessions) {
  const reading = books.filter((b) => b.status === 'reading');
  if (reading.length === 0) return null;
  const lastActivity = (book) => {
    const times = sessions
      .filter((s) => s.bookId === book.id)
      .map((s) => toDate(s.finishedAt ?? s.startedAt)?.getTime() ?? 0);
    return Math.max(toDate(book.updatedAt)?.getTime() ?? 0, ...times);
  };
  return [...reading].sort((a, b) => lastActivity(b) - lastActivity(a))[0];
}

/* ---------- Sequências ---------- */

/**
 * Sequência de dias consecutivos com leitura (dias locais).
 * - Hoje só conta depois que houver leitura hoje: um dia em andamento sem
 *   leitura não é tratado como cumprido.
 * - Se a última leitura foi ontem, a sequência continua "viva" (ainda dá
 *   tempo de ler hoje), mas `readToday` é falso.
 * - Mais de um dia sem ler zera a sequência atual.
 */
export function calculateStreakFromLedger(ledger, now = new Date()) {
  const days = new Set(getReadingDayKeys(ledger));
  if (days.size === 0) return { current: 0, readToday: false, longest: 0, longestEnd: null, atRisk: false };

  const readToday = days.has(toDateKey(now));
  let cursor = readToday ? startOfDay(now) : addDays(now, -1);
  let current = 0;
  while (days.has(toDateKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let longestEnd = null;
  let run = 0;
  let previous = null;
  for (const key of [...days].sort()) {
    const date = fromDateKey(key);
    run = previous && diffInCalendarDays(previous, date) === 1 ? run + 1 : 1;
    if (run > longest) {
      longest = run;
      longestEnd = key;
    }
    previous = date;
  }
  return { current, readToday, longest, longestEnd, atRisk: current > 0 && !readToday };
}

/** Atalho para quem só tem as sessões. */
export function calculateStreak(sessions, now = new Date()) {
  return calculateStreakFromLedger(buildLedger(sessions), now);
}

/* ---------- Períodos ---------- */

function ratioOrNull(value, divisor) {
  return divisor > 0 ? value / divisor : null;
}

/**
 * Estatísticas de um período [range.start, range.end).
 * Dias futuros não entram em médias nem gráficos.
 */
export function getPeriodStats({ ledger, sessions, books }, range, now = new Date()) {
  const elapsedEnd = getElapsedEnd(range, now);
  const summary = summarizeRange(ledger, range.start, range.end);
  const elapsed = summarizeRange(ledger, range.start, elapsedEnd > range.start ? elapsedEnd : range.start);
  const elapsedDays = countElapsedDays(range, now);

  const started = filterSessionsBetween(sessions, range.start, range.end);
  const pace = calculatePace(started);

  const best = summary.days
    .filter(isReadingDay)
    .sort((a, b) => b.pages - a.pages || b.seconds - a.seconds || a.dateKey.localeCompare(b.dateKey))[0] ?? null;

  const finishedBooks = books
    .filter((b) => b.status === 'finished' && isWithin(b.finishedAt, range.start, range.end))
    .sort((a, b) => toDate(a.finishedAt) - toDate(b.finishedAt));

  return {
    range,
    elapsedDays,
    pages: summary.pages,
    newPages: summary.newPages,
    seconds: summary.seconds,
    sessions: summary.sessions,
    readingDays: summary.readingDays,
    days: summary.days.map((d) => ({ ...d, future: d.date >= elapsedEnd })),
    averages: {
      pagesPerSession: ratioOrNull(sumPages(started), started.length),
      // Só sessões com duração conhecida (registros manuais podem não ter).
      secondsPerSession: ratioOrNull(sumSeconds(started), started.filter(hasKnownDuration).length),
      pagesPerDay: ratioOrNull(elapsed.pages, elapsedDays),
      secondsPerDay: ratioOrNull(elapsed.seconds, elapsedDays),
    },
    pace,
    bestDay: best,
    finishedBooks,
  };
}

/**
 * Variação entre dois valores; `percent` é null quando a base é zero
 * (nunca "+100%" sobre um período sem leitura).
 * status: 'none' (zero nos dois) | 'new' (antes zero, agora não) |
 *         'stopped' (antes sim, agora zero) | 'up' | 'down' | 'same'.
 */
export function compareValues(current, previous) {
  const delta = current - previous;
  let status = 'same';
  if (current === 0 && previous === 0) status = 'none';
  else if (previous === 0) status = 'new';
  else if (current === 0) status = 'stopped';
  else if (delta > 0) status = 'up';
  else if (delta < 0) status = 'down';
  return { current, previous, delta, percent: previous > 0 ? (delta / previous) * 100 : null, status };
}

export function comparePeriodStats(current, previous) {
  return {
    pages: compareValues(current.pages, previous.pages),
    newPages: compareValues(current.newPages, previous.newPages),
    seconds: compareValues(current.seconds, previous.seconds),
    sessions: compareValues(current.sessions, previous.sessions),
    readingDays: compareValues(current.readingDays, previous.readingDays),
  };
}

/* ---------- Sessões que entram nas estatísticas ---------- */

/**
 * Dados de demonstração não são leitura real: quando existe pelo menos uma
 * sessão sua, as estatísticas e as conquistas usam só as suas. Sem nenhuma
 * sessão real, a demonstração continua visível (e a tela avisa).
 */
export function getStatsSessions(sessions) {
  const real = sessions.filter((s) => !s.isDemo);
  return { sessions: real.length > 0 ? real : sessions, demoOnly: real.length === 0 && sessions.length > 0, demoExcluded: real.length > 0 && real.length < sessions.length };
}

/** Primeiro dia com registro de leitura (início da sessão mais antiga). */
export function getFirstReadingDate(sessions) {
  let first = null;
  for (const s of sessions) {
    const date = toDate(s.startedAt);
    if (date && (!first || date < first)) first = date;
  }
  return first;
}

/* ---------- Agrupamento dos gráficos por período ---------- */

const DAY_MS = 86_400_000;

/** Granularidade dos gráficos para cada período (legível sem perder dados). */
export function getBucketKind(range) {
  if (range.type === 'day') return 'hour';
  if (range.type === 'week' || range.type === 'month') return 'day';
  if (range.type === 'quarter') return 'week';
  const days = Math.round((range.end - range.start) / DAY_MS);
  if (days <= 31) return 'day';
  if (days <= 26 * 7) return 'week';
  const months = (range.end.getFullYear() - range.start.getFullYear()) * 12 + range.end.getMonth() - range.start.getMonth() + 1;
  return months > 36 ? 'quarter' : 'month';
}

/**
 * Série do período escolhido, para os gráficos de Estatísticas e Evolução.
 * Cada balde: { key, kind, start, end, pages, newPages, seconds, minutes, sessions, future }.
 * Os baldes cobrem exatamente o período (o primeiro e o último são cortados
 * nas bordas), então a soma dos baldes é igual aos números do período.
 * `sessions` só é necessário para o período "Dia" (distribuição por hora).
 */
export function getPeriodBuckets({ ledger, sessions = [] }, range, { now = new Date(), weekStartsOn = 'monday' } = {}) {
  const kind = getBucketKind(range);
  const elapsedEnd = getElapsedEnd(range, now);
  const make = (start, end, totals) => ({
    key: `${kind}-${start.getTime()}`,
    kind,
    start,
    end,
    pages: totals.pages,
    newPages: totals.newPages,
    seconds: totals.seconds,
    minutes: Math.round(totals.seconds / 60),
    sessions: totals.sessions,
    future: start >= elapsedEnd,
  });

  if (kind === 'hour') {
    return summarizeHours(sessions, range.start).map((h) => {
      const start = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate(), h.hour);
      const end = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate(), h.hour + 1);
      return { ...make(start, end, h), future: start > now };
    });
  }

  const buckets = [];
  let cursor = range.start;
  while (cursor < range.end) {
    let next;
    if (kind === 'day') next = addDays(cursor, 1);
    else if (kind === 'week') next = addDays(startOfWeek(cursor, weekStartsOn), 7);
    else if (kind === 'month') next = addMonths(startOfMonth(cursor), 1);
    else next = addMonths(startOfMonth(cursor), 3 - (cursor.getMonth() % 3));
    const end = next < range.end ? next : range.end;
    buckets.push(make(cursor, end, summarizeRange(ledger, cursor, end)));
    cursor = end;
  }
  return buckets;
}

/**
 * Resumo do "Histórico total": totais acumulados e médias honestas
 * (por dia de leitura, por semana e por mês corridos desde o primeiro registro).
 */
export function getAllTimeSummary({ ledger, sessions }, now = new Date()) {
  const first = getFirstReadingDate(sessions);
  if (!first) return null;
  const range = { type: 'all', start: startOfDay(first), end: addDays(now, 1) };
  const total = summarizeRange(ledger, range.start, range.end);
  const days = Math.max(1, Math.round((range.end - range.start) / DAY_MS));
  const monthly = [];
  for (let cursor = startOfMonth(range.start); cursor < range.end; cursor = addMonths(cursor, 1)) {
    const end = addMonths(cursor, 1);
    const s = summarizeRange(ledger, cursor < range.start ? range.start : cursor, end < range.end ? end : range.end);
    monthly.push({ start: cursor, pages: s.pages, seconds: s.seconds, sessions: s.sessions });
  }
  const bestMonth = monthly.filter((m) => m.pages > 0 || m.seconds > 0).sort((a, b) => b.pages - a.pages || b.seconds - a.seconds)[0] ?? null;
  return {
    first,
    days,
    pages: total.pages,
    newPages: total.newPages,
    seconds: total.seconds,
    sessions: total.sessions,
    readingDays: total.readingDays,
    perReadingDay: {
      pages: ratioOrNull(total.pages, total.readingDays),
      seconds: ratioOrNull(total.seconds, total.readingDays),
    },
    perWeek: {
      pages: total.pages / (days / 7),
      seconds: total.seconds / (days / 7),
    },
    monthsWithReading: monthly.filter((m) => m.pages > 0 || m.seconds > 0).length,
    monthsTotal: monthly.length,
    bestMonth,
  };
}

/* ---------- Evolução ---------- */

export const EVOLUTION_GRANULARITIES = {
  daily: { label: 'Diária', count: 30, description: 'últimos 30 dias' },
  weekly: { label: 'Semanal', count: 12, description: 'últimas 12 semanas' },
  monthly: { label: 'Mensal', count: 12, description: 'últimos 12 meses' },
};

/** Série temporal para gráficos de evolução, terminando no período atual. */
export function getEvolutionSeries(ledger, granularity = 'daily', now = new Date(), weekStartsOn = 'monday') {
  const count = EVOLUTION_GRANULARITIES[granularity]?.count ?? 30;
  const buckets = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    let start;
    let end;
    if (granularity === 'weekly') {
      start = addDays(startOfWeek(now, weekStartsOn), -7 * i);
      end = addDays(start, 7);
    } else if (granularity === 'monthly') {
      start = addMonths(startOfMonth(now), -i);
      end = addMonths(start, 1);
    } else {
      start = addDays(now, -i);
      end = addDays(start, 1);
    }
    const s = summarizeRange(ledger, start, end);
    buckets.push({ key: toDateKey(start), start, end, pages: s.pages, newPages: s.newPages, minutes: Math.round(s.seconds / 60), seconds: s.seconds });
  }
  return buckets;
}

/** Série diária simples (usada no Dashboard). */
export function getDailySeries(sessionsOrLedger, days = 7, endDate = new Date()) {
  const ledger = sessionsOrLedger instanceof Map ? sessionsOrLedger : buildLedger(sessionsOrLedger);
  const start = addDays(endDate, -(days - 1));
  return summarizeRange(ledger, start, addDays(endDate, 1)).days.map((d) => ({
    ...d,
    minutes: Math.round(d.seconds / 60),
  }));
}

/* ---------- Totais gerais ---------- */

export function getLifetimeTotals({ books, sessions, ledger }) {
  const all = ledger ?? buildLedger(sessions);
  let readingDays = 0;
  for (const entry of all.values()) if (isReadingDay(entry)) readingDays += 1;
  return {
    pages: sumPages(sessions),
    newPages: sumNewPages(sessions),
    seconds: sumSeconds(sessions),
    sessions: sessions.length,
    finishedBooks: books.filter((b) => b.status === 'finished').length,
    // Concluídos cadastrados como "já lidos": contam como livros, mas não têm sessões.
    finishedBeforeApp: books.filter((b) => b.status === 'finished' && b.addedAsRead).length,
    readingDays,
    averageSessionSeconds: ratioOrNull(sumSeconds(sessions), sessions.filter(hasKnownDuration).length),
    sessionsWithoutDuration: sessions.filter((s) => !hasKnownDuration(s)).length,
  };
}

/** Recordes de todos os tempos. */
export function getRecords(ledger, sessions) {
  let bestDay = null;
  for (const entry of ledger.values()) {
    if (!isReadingDay(entry)) continue;
    if (!bestDay || entry.pages > bestDay.pages || (entry.pages === bestDay.pages && entry.seconds > bestDay.seconds)) bestDay = entry;
  }
  const longestSession = [...sessions].sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0))[0] ?? null;
  return { bestDay, longestSession };
}

/* ---------- Dashboard ---------- */

/** Tudo o que o Dashboard precisa, calculado em um só lugar. */
export function getDashboardSummary({ books, sessions, goals, ledger: given }, now = new Date(), weekStartsOn = 'monday') {
  const ledger = given ?? buildLedger(sessions);
  const today = summarizeRange(ledger, startOfDay(now), addDays(now, 1));
  const weekStart = startOfWeek(now, weekStartsOn);
  const week = summarizeRange(ledger, weekStart, addDays(weekStart, 7));
  const month = summarizeRange(ledger, startOfMonth(now), addDays(now, 1));
  const todayMinutes = Math.floor(today.seconds / 60);
  const dailyGoal = goals?.dailyMinutes ?? null;
  const weeklyGoal = goals?.weeklyPages ?? null;

  return {
    ledger,
    today: {
      pages: today.pages,
      minutes: todayMinutes,
      seconds: today.seconds,
      sessions: today.sessions,
      goalMinutes: dailyGoal,
      goalRatio: dailyGoal ? Math.min(1, todayMinutes / dailyGoal) : 0,
    },
    week: {
      pages: week.pages,
      minutes: Math.floor(week.seconds / 60),
      goalPages: weeklyGoal,
      goalRatio: weeklyGoal ? Math.min(1, week.pages / weeklyGoal) : 0,
    },
    month: { pages: month.pages, minutes: Math.floor(month.seconds / 60) },
    pace: calculatePace(sessions),
    streak: calculateStreakFromLedger(ledger, now),
    counts: countBooksByStatus(books),
    totals: getLifetimeTotals({ books, sessions, ledger }),
    currentBook: getCurrentBook(books, sessions),
    lastSevenDays: getDailySeries(ledger, 7, now),
    recentSessions: sortSessionsByDateDesc(sessions).slice(0, 5),
    totalPages: sumPages(sessions),
    totalSessions: sessions.length,
  };
}
