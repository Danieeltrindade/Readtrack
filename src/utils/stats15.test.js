// 1.5: períodos 3 meses e Histórico total, baldes dos gráficos, comparação e conquistas por níveis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLedger } from './ledger.js';
import { getComparableRange, getPeriodRange, shiftPeriod, toDateKey } from './date.js';
import {
  compareValues,
  getAllTimeSummary,
  getFirstReadingDate,
  getPeriodBuckets,
  getPeriodStats,
  getStatsSessions,
} from './stats.js';
import { evaluateAchievements, findStaleAchievements, groupAchievements } from './achievements.js';
import { getGoalProgress, getWeeklyGoalHistory } from './goals.js';

const BRASILIA = new Date('2026-08-16T12:00:00Z').getTimezoneOffset() === 180;
const NOW = new Date(2026, 9, 18, 15, 0); // 18/10/2026 15:00 local
const at = (y, m, d, h = 10, min = 0) => new Date(y, m - 1, d, h, min);
let seq = 0;
/** Sessão manual com início/fim, páginas inclusivas e duração registrada. */
function manual(start, end, first, last, seconds, extra = {}) {
  seq += 1;
  return {
    id: `s${seq}`,
    bookId: 'b',
    source: 'manual',
    startedAt: start.toISOString(),
    finishedAt: end ? end.toISOString() : null,
    durationSeconds: seconds,
    startPage: first,
    endPage: last,
    pagesRead: last - first + 1,
    newPages: last - first + 1,
    segments: [],
    ...extra,
  };
}

test('3 meses: últimos três meses do calendário até o dia, contíguos ao navegar', () => {
  const q = getPeriodRange('quarter', NOW);
  assert.equal(toDateKey(q.start), '2026-07-19');
  assert.equal(toDateKey(q.end), '2026-10-19');
  const prev = shiftPeriod(q, -1);
  assert.equal(toDateKey(prev.end), toDateKey(q.start), 'sem buraco nem sobreposição');
  assert.equal(toDateKey(prev.start), '2026-04-19');
  const cmp = getComparableRange(q, NOW);
  assert.equal(cmp.partial, false);
  assert.equal(toDateKey(cmp.start), '2026-04-19');
  // Fim de mês: 31/05 − 3 meses = 28/02 (calendário real).
  const may = getPeriodRange('quarter', at(2026, 5, 31));
  assert.equal(toDateKey(may.start), '2026-03-01');
  assert.equal(toDateKey(shiftPeriod(may, -1).end), '2026-03-01');
});

test('Histórico total: do primeiro registro até hoje, sem período anterior inventado', () => {
  const sessions = [manual(at(2026, 8, 15, 17, 30), at(2026, 8, 15, 17, 42), 1, 8, 720)];
  const all = getPeriodRange('all', NOW, 'monday', { firstDate: getFirstReadingDate(sessions), now: NOW });
  assert.equal(toDateKey(all.start), '2026-08-15');
  assert.equal(toDateKey(all.end), '2026-10-19');
  assert.equal(getComparableRange(all, NOW), null);
  assert.equal(shiftPeriod(all, -1), all);
  const summary = getAllTimeSummary({ ledger: buildLedger(sessions), sessions }, NOW);
  assert.equal(summary.pages, 8);
  assert.equal(summary.readingDays, 1);
  assert.equal(summary.perReadingDay.pages, 8);
  assert.equal(getAllTimeSummary({ ledger: new Map(), sessions: [] }, NOW), null);
});

test('baldes dos gráficos: a soma é igual ao período, em todos os tipos (com meia-noite)', () => {
  const sessions = [
    manual(at(2026, 8, 16, 23, 27), at(2026, 8, 17, 0, 20), 34, 64, 3189), // passa da meia-noite
    manual(at(2026, 9, 24, 23, 21), at(2026, 9, 25, 1, 47), 56, 145, 8760),
    manual(at(2026, 10, 1, 9), null, 1, 10, null), // sem término nem duração
    manual(at(2026, 10, 10, 8), at(2026, 10, 10, 8, 30), 11, 20, 1800),
  ];
  const ledger = buildLedger(sessions);
  const firstDate = getFirstReadingDate(sessions);
  for (const [type, anchor] of [['week', at(2026, 8, 17)], ['month', at(2026, 9, 10)], ['quarter', NOW], ['all', NOW], ['day', at(2026, 8, 17)], ['day', at(2026, 10, 1)]]) {
    const range = getPeriodRange(type, anchor, 'monday', { firstDate, now: NOW });
    const buckets = getPeriodBuckets({ ledger, sessions }, range, { now: NOW });
    const stats = getPeriodStats({ ledger, sessions, books: [] }, range, NOW);
    const sum = (k) => buckets.reduce((t, b) => t + b[k], 0);
    assert.equal(sum('pages'), stats.pages, `${type}: páginas`);
    assert.equal(sum('seconds'), stats.seconds, `${type}: tempo`);
    assert.equal(sum('newPages'), stats.newPages, `${type}: páginas novas`);
    assert.equal(buckets[0].start.getTime(), range.start.getTime());
    assert.equal(buckets.at(-1).end.getTime(), type === 'day' ? range.end.getTime() : range.end.getTime());
  }
  const kinds = (type, anchor) => getPeriodBuckets({ ledger, sessions }, getPeriodRange(type, anchor, 'monday', { firstDate, now: NOW }), { now: NOW });
  assert.equal(kinds('day', at(2026, 8, 17)).length, 24);
  assert.equal(kinds('day', at(2026, 8, 17))[0].kind, 'hour');
  assert.equal(kinds('week', NOW)[0].kind, 'day');
  assert.equal(kinds('quarter', NOW)[0].kind, 'week');
  if (BRASILIA) {
    // 17/08: a parte depois da meia-noite (00:00–00:20) fica na hora 0.
    const hours = kinds('day', at(2026, 8, 17));
    assert.ok(hours[0].seconds > 0 && hours[0].pages > 0);
    assert.equal(hours.slice(1).reduce((t, h) => t + h.seconds, 0), 0);
  }
  // Sessão sem término: inteira na hora em que começou, sem tempo inventado.
  const oct1 = kinds('day', at(2026, 10, 1));
  assert.equal(oct1[9].pages, 10);
  assert.equal(oct1[9].seconds, 0);
});

test('comparação: sem "+100%" quando o período anterior não teve leitura', () => {
  assert.deepEqual({ ...compareValues(50, 0) }, { current: 50, previous: 0, delta: 50, percent: null, status: 'new' });
  assert.equal(compareValues(0, 0).status, 'none');
  assert.equal(compareValues(0, 0).percent, null);
  assert.equal(compareValues(0, 30).status, 'stopped');
  assert.equal(compareValues(0, 30).percent, -100);
  assert.equal(compareValues(30, 20).status, 'up');
  assert.equal(compareValues(30, 20).percent, 50);
  assert.equal(compareValues(10, 20).status, 'down');
  assert.equal(compareValues(20, 20).status, 'same');
});

test('dados de demonstração não entram quando há sessões reais', () => {
  const real = manual(at(2026, 10, 1), at(2026, 10, 1, 11), 1, 5, 600);
  const demo = { ...manual(at(2026, 10, 2), at(2026, 10, 2, 11), 1, 50, 3600), isDemo: true };
  assert.deepEqual(getStatsSessions([real, demo]).sessions, [real]);
  assert.equal(getStatsSessions([real, demo]).demoExcluded, true);
  assert.equal(getStatsSessions([demo]).demoOnly, true);
  const byId = Object.fromEntries(evaluateAchievements({ books: [], sessions: [real, demo], now: NOW }).map((a) => [a.id, a]));
  assert.equal(byId['pages-10'].unlocked, false, 'as 50 páginas da demonstração não contam');
  assert.equal(byId['pages-10'].value, 5);
});

const byId = (list) => Object.fromEntries(list.map((a) => [a.id, a]));

test('conquistas: histórico vazio, progresso parcial (90/150 = 60%), desbloqueio e superação', () => {
  const empty = groupAchievements(evaluateAchievements({ books: [], sessions: [], now: NOW }));
  assert.ok(empty.every((g) => g.unlockedCount === 0));
  const pages = empty.find((g) => g.id === 'pages');
  assert.equal(pages.next.target, 10, 'primeiro nível de páginas é 10, não 500');
  assert.equal(pages.ratio, 0);

  // 90 páginas: níveis 10 e 50 desbloqueados, próximo 150 com 60%.
  const s90 = [manual(at(2026, 10, 1), at(2026, 10, 1, 11), 1, 30, 900), manual(at(2026, 10, 2), at(2026, 10, 2, 11), 31, 90, 900)];
  const groups = groupAchievements(evaluateAchievements({ books: [], sessions: s90, now: NOW }));
  const g = groups.find((x) => x.id === 'pages');
  assert.equal(g.unlockedCount, 2);
  assert.equal(g.next.id, 'pages-150');
  assert.equal(g.next.value, 90);
  assert.equal(Math.round(g.ratio * 100), 60);
  // 15 min e 30 min: 15 min desbloqueado; 1 h com 50%.
  const time = groups.find((x) => x.id === 'time');
  assert.equal(time.levels[0].unlocked, true);
  assert.equal(time.next.target, 3600);
  assert.equal(time.ratio, 0.5);
  // Superar o objetivo: o anel nunca passa de 100%.
  const big = [manual(at(2026, 10, 1), at(2026, 10, 1, 11), 1, 16000, 3600)];
  const list = evaluateAchievements({ books: [], sessions: big, now: NOW });
  assert.ok(list.every((a) => a.ratio >= 0 && a.ratio <= 1));
  assert.equal(byId(list)['pages-15000'].unlocked, true);
  const complete = groupAchievements(list).find((x) => x.id === 'pages');
  assert.equal(complete.complete, true);
  assert.equal(complete.ratio, 1);
  // Ordem: categorias em andamento antes das completas.
  assert.notEqual(groupAchievements(list)[0].id, 'pages');
});

test('conquistas: recalculadas ao editar e excluir; tempo só com duração válida; sem duplicar sessão', () => {
  const a = manual(at(2026, 10, 1), at(2026, 10, 1, 11), 1, 30, null); // sem duração
  const b = manual(at(2026, 10, 2), at(2026, 10, 2, 11), 31, 60, 600);
  let list = byId(evaluateAchievements({ books: [], sessions: [a, b, b], now: NOW }));
  assert.equal(list['first-session'].value, 2, 'a mesma sessão (id) conta uma vez');
  assert.equal(list['pages-50'].unlocked, true);
  assert.equal(list['time-15m'].value, 600, 'sessão sem duração não soma tempo');
  // Excluir a sessão b: 50 páginas deixa de valer e sai da lista salva.
  const stored = [{ id: 'pages-50', unlockedAt: b.finishedAt }];
  const after = evaluateAchievements({ books: [], sessions: [a], stored, now: NOW });
  assert.equal(byId(after)['pages-50'].unlocked, false);
  assert.deepEqual(findStaleAchievements(after, stored), ['pages-50']);
  // Editar a sessão a para 1–60: volta a valer.
  list = byId(evaluateAchievements({ books: [], sessions: [{ ...a, endPage: 60, pagesRead: 60 }], stored, now: NOW }));
  assert.equal(list['pages-50'].unlocked, true);
  assert.equal(list['pages-50'].unlockedAt, b.finishedAt, 'data salva preservada');
});

test('conquistas de consistência: dias diferentes, sequência (com meia-noite) e meta semanal', () => {
  // 14/10 23:30 → 15/10 00:30 conta nos dois dias; 16 e 17 também: 4 dias seguidos.
  const sessions = [
    manual(at(2026, 10, 14, 23, 30), at(2026, 10, 15, 0, 30), 1, 20, 3600),
    manual(at(2026, 10, 16, 8), at(2026, 10, 16, 8, 20), 21, 30, 1200),
    manual(at(2026, 10, 17, 8), at(2026, 10, 17, 8, 20), 31, 40, 1200),
    manual(at(2026, 9, 1, 8), at(2026, 9, 1, 8, 20), 41, 160, 1200), // 120 páginas numa semana de setembro
  ];
  const list = byId(evaluateAchievements({ books: [], sessions, now: NOW, goals: { weeklyPages: 100 } }));
  if (BRASILIA) {
    assert.equal(list['days-3'].unlocked, true);
    assert.equal(list['days-3'].value, 5, '14, 15, 16, 17/10 e 01/09');
    assert.equal(list['streak-4'].unlocked, true, '14→17/10: a sessão da meia-noite liga os dias');
    assert.equal(list['streak-10'].unlocked, false);
    assert.equal(list['streak-10'].value, 4, 'progresso pela sequência atual (até ontem, 17/10)');
  }
  assert.equal(list['weekly-goal-1'].unlocked, true);
  assert.equal(list['weekly-goal-3'].unlocked, false);
  // Meta semanal não configurada: categoria bloqueada, sem progresso inventado.
  const noGoal = groupAchievements(evaluateAchievements({ books: [], sessions, now: NOW, goals: { weeklyPages: null } })).find((g) => g.id === 'weekly');
  assert.equal(noGoal.blocked, true);
  assert.equal(noGoal.unlockedCount, 0);
});

test('metas diária e semanal: mesmo comportamento de antes; histórico semanal coerente', () => {
  const sessions = [manual(at(2026, 10, 12, 8), at(2026, 10, 12, 9), 1, 120, 3600), manual(at(2026, 10, 18, 8), at(2026, 10, 18, 8, 40), 121, 130, 2400)];
  const ledger = buildLedger(sessions);
  const progress = getGoalProgress({ ledger, goals: { dailyMinutes: 30, weeklyPages: 100 }, now: NOW });
  assert.equal(progress.daily.value, 40);
  assert.equal(progress.daily.status, 'done');
  assert.equal(progress.weekly.value, 130, 'semana de 12 a 18/10 (segunda a domingo)');
  assert.equal(progress.weekly.status, 'done');
  const weeks = getWeeklyGoalHistory({ ledger, weeklyPages: 100, now: NOW });
  assert.equal(weeks.length, 1);
  assert.equal(toDateKey(weeks[0].metOn), '2026-10-12', 'meta atingida no dia real (120 páginas na segunda)');
  assert.equal(getWeeklyGoalHistory({ ledger, weeklyPages: null, now: NOW }).length, 0);
});
