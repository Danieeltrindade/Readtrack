import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePace,
  calculateStreak,
  comparePeriodStats,
  getBookProgress,
  getDailySeries,
  getDashboardSummary,
  getEvolutionSeries,
  getPeriodStats,
} from './stats.js';
import { buildLedger } from './ledger.js';
import { getPeriodRange, getComparableRange, startOfWeek, toDateKey } from './date.js';
import { createDemoData } from '../data/demoData.js';

const NOW = new Date(2026, 9, 15, 10, 30); // quinta-feira, 15/10/2026

function session(daysAgo, pages, minutes, hour = 20, extra = {}) {
  const start = new Date(NOW);
  start.setDate(start.getDate() - daysAgo);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    id: `s${daysAgo}-${hour}`,
    bookId: 'b1',
    startedAt: start.toISOString(),
    finishedAt: end.toISOString(),
    pagesRead: pages,
    newPages: pages,
    durationSeconds: minutes * 60,
    segments: [{ start: start.toISOString(), end: end.toISOString() }],
    ...extra,
  };
}

test('startOfWeek começa na segunda-feira', () => {
  assert.equal(toDateKey(startOfWeek(NOW)), '2026-10-12');
  assert.equal(toDateKey(startOfWeek(new Date(2026, 9, 18))), '2026-10-12'); // domingo
});

test('ritmo: páginas por minuto e por hora', () => {
  const pace = calculatePace([session(1, 30, 30), session(2, 30, 30)]);
  assert.equal(pace.pagesPerMinute, 1);
  assert.equal(pace.pagesPerHour, 60);
  assert.equal(pace.reliable, true);
});

test('ritmo não é confiável com pouco tempo, poucas páginas ou duração zero', () => {
  assert.equal(calculatePace([]).reliable, false);
  assert.equal(calculatePace([session(1, 20, 5)]).reliable, false, '5 minutos');
  assert.equal(calculatePace([session(1, 3, 30)]).reliable, false, '3 páginas');
  const zero = calculatePace([session(1, 50, 0)]);
  assert.equal(zero.pagesPerHour, 0, 'duração zero não gera velocidade infinita');
  assert.equal(zero.reliable, false);
  // Sessão de duração zero é ignorada, sem distorcer as válidas.
  assert.equal(calculatePace([session(1, 30, 30), session(2, 50, 0)]).pagesPerMinute, 1);
});

test('sequência continua viva se a última leitura foi ontem', () => {
  const streak = calculateStreak([session(1, 10, 10), session(2, 10, 10), session(4, 10, 10)], NOW);
  assert.equal(streak.current, 2);
  assert.equal(streak.readToday, false);
  assert.equal(streak.atRisk, true);
});

test('sequência zera quando há um dia inteiro sem leitura', () => {
  assert.equal(calculateStreak([session(2, 10, 10), session(3, 10, 10)], NOW).current, 0);
});

test('maior sequência histórica', () => {
  const streak = calculateStreak([session(10, 1, 1), session(9, 1, 1), session(8, 1, 1), session(0, 1, 1, 8)], NOW);
  assert.equal(streak.longest, 3);
  assert.equal(streak.current, 1);
  assert.equal(streak.readToday, true);
});

test('sessão que atravessa a meia-noite conta para os dois dias da sequência', () => {
  const crossing = session(2, 10, 60, 23); // 23:00 de anteontem até 00:00... 60 min → termina à meia-noite
  const late = session(2, 10, 90, 23); // 23:00 → 00:30 de ontem
  assert.equal(calculateStreak([crossing], NOW).current, 0, 'termina exatamente à meia-noite: só anteontem');
  assert.equal(calculateStreak([late], NOW).current, 2, 'passa da meia-noite: anteontem e ontem');
});

test('menos de 1 minuto sem páginas não conta como dia de leitura', () => {
  assert.equal(calculateStreak([session(1, 0, 0.5)], NOW).current, 0);
});

test('série diária inclui dias sem leitura', () => {
  const series = getDailySeries([session(0, 12, 15, 8), session(0, 8, 5, 9), session(3, 20, 25)], 7, NOW);
  assert.equal(series.length, 7);
  assert.equal(series.at(-1).pages, 20);
  assert.equal(series.at(-1).minutes, 20);
  assert.equal(series.at(-4).pages, 20);
  assert.equal(series.at(-2).pages, 0);
});

test('progresso do livro fica entre 0 e 100', () => {
  assert.equal(getBookProgress({ totalPages: 200, currentPage: 50, status: 'reading' }), 25);
  assert.equal(getBookProgress({ totalPages: 200, currentPage: 999, status: 'reading' }), 100);
  assert.equal(getBookProgress({ totalPages: 200, currentPage: 10, status: 'finished' }), 100);
  assert.equal(getBookProgress({ totalPages: 0, currentPage: 0 }), 0);
});

test('estatísticas de período com caso conhecido', () => {
  // Semana de 12 a 18/10. Hoje é quinta (15). Sessões: seg 30 pág/30 min, qua 20 pág/40 min (10 novas).
  const sessions = [
    session(3, 30, 30), // segunda 12
    session(1, 20, 40, 20, { newPages: 10 }), // quarta 14
    session(10, 99, 60), // semana anterior, fora
  ];
  const ledger = buildLedger(sessions);
  const books = [{ id: 'x', status: 'finished', finishedAt: new Date(2026, 9, 13, 21).toISOString() }];
  const week = getPeriodRange('week', NOW);
  const stats = getPeriodStats({ ledger, sessions, books }, week, NOW);
  assert.equal(stats.pages, 50);
  assert.equal(stats.newPages, 40);
  assert.equal(stats.seconds, 70 * 60);
  assert.equal(stats.sessions, 2);
  assert.equal(stats.readingDays, 2);
  assert.equal(stats.elapsedDays, 4, 'seg a qui; sex–dom são futuros');
  assert.equal(stats.averages.pagesPerSession, 25);
  assert.equal(stats.averages.secondsPerSession, 35 * 60);
  assert.equal(stats.averages.pagesPerDay, 12.5, '50 páginas ÷ 4 dias decorridos');
  assert.equal(stats.bestDay.dateKey, '2026-10-12');
  assert.equal(stats.finishedBooks.length, 1);
  assert.equal(stats.days.filter((d) => d.future).length, 3);
  assert.ok(Math.abs(stats.pace.pagesPerHour - (50 / 70) * 60) < 1e-9);
});

test('período vazio: médias nulas, sem melhor dia, ritmo não confiável', () => {
  const stats = getPeriodStats({ ledger: new Map(), sessions: [], books: [] }, getPeriodRange('day', NOW), NOW);
  assert.equal(stats.pages, 0);
  assert.equal(stats.averages.pagesPerSession, null);
  assert.equal(stats.bestDay, null);
  assert.equal(stats.pace.reliable, false);
  assert.equal(stats.averages.pagesPerDay, 0);
});

test('comparação entre períodos', () => {
  const sessions = [session(0, 30, 30, 8), session(7, 10, 20, 8)];
  const ledger = buildLedger(sessions);
  const day = getPeriodRange('day', NOW);
  const current = getPeriodStats({ ledger, sessions, books: [] }, day, NOW);
  const previous = getPeriodStats({ ledger, sessions, books: [] }, getComparableRange(getPeriodRange('week', NOW), NOW), NOW);
  const cmp = comparePeriodStats(current, previous);
  assert.equal(cmp.pages.delta, 20);
  assert.equal(cmp.pages.percent, 200);
  const none = comparePeriodStats(current, { pages: 0, newPages: 0, seconds: 0, sessions: 0, readingDays: 0 });
  assert.equal(none.pages.percent, null, 'sem base, sem porcentagem');
});

test('evolução semanal e mensal', () => {
  const sessions = [session(0, 10, 10, 8), session(7, 20, 20), session(40, 5, 5)];
  const ledger = buildLedger(sessions);
  const weekly = getEvolutionSeries(ledger, 'weekly', NOW);
  assert.equal(weekly.length, 12);
  assert.equal(weekly.at(-1).pages, 10);
  assert.equal(weekly.at(-2).pages, 20);
  const monthly = getEvolutionSeries(ledger, 'monthly', NOW);
  assert.equal(monthly.length, 12);
  assert.equal(monthly.at(-1).pages, 30, 'outubro: dias 15 e 8');
  assert.equal(monthly.at(-2).pages, 5, 'setembro');
});

test('resumo do dashboard com os dados de demonstração', () => {
  const demo = createDemoData(NOW);
  const summary = getDashboardSummary({ ...demo, goals: { dailyMinutes: 30, weeklyPages: 150 } }, NOW);
  assert.equal(summary.currentBook.title, 'Memórias Póstumas de Brás Cubas');
  assert.equal(summary.streak.current, 4);
  assert.equal(summary.today.pages, 0);
  assert.equal(summary.counts.finished, 2);
  assert.equal(summary.recentSessions.length, 5);
  assert.equal(summary.totals.sessions, 25);
  assert.equal(summary.totals.pages, 256 + 304 + 142);
  assert.ok(summary.week.pages > 0);
  assert.ok(summary.week.goalRatio <= 1);
});

test('meta não configurada não gera progresso', () => {
  const summary = getDashboardSummary({ books: [], sessions: [session(0, 10, 40, 8)], goals: { dailyMinutes: null, weeklyPages: null } }, NOW);
  assert.equal(summary.today.goalMinutes, null);
  assert.equal(summary.today.goalRatio, 0);
});

test('dados de demonstração são coerentes', () => {
  const { books, sessions } = createDemoData(NOW);
  assert.equal(books.filter((b) => b.status === 'finished').length, 2);
  assert.equal(books.filter((b) => b.status === 'reading').length, 1);
  for (const book of books) {
    const own = sessions.filter((s) => s.bookId === book.id);
    const pages = own.reduce((t, s) => t + s.pagesRead, 0);
    assert.equal(pages, book.currentPage, `páginas somadas de ${book.title}`);
    own.forEach((s, i) => {
      assert.equal(s.endPage - s.startPage, s.pagesRead);
      if (i > 0) assert.equal(s.startPage, own[i - 1].endPage, 'páginas encadeadas');
      assert.ok(new Date(s.startedAt) < NOW, 'nenhuma sessão no futuro');
    });
    if (book.status === 'finished') assert.equal(pages, book.totalPages);
  }
  assert.ok(books.every((b) => b.isDemo) && sessions.every((s) => s.isDemo));
});
