import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getGoalProgress, normalizeGoals, validateGoalsForm } from './goals.js';
import { ACHIEVEMENTS, LEVEL_TARGETS, evaluateAchievements, findNewAchievements, findStaleAchievements } from './achievements.js';
import { buildLedger } from './ledger.js';

const NOW = new Date(2026, 9, 15, 21, 0); // quinta-feira

function session(daysAgo, pages, minutes, hour = 8, id = `s${daysAgo}-${hour}`) {
  const start = new Date(NOW);
  start.setDate(start.getDate() - daysAgo);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    id,
    bookId: 'b',
    startedAt: start.toISOString(),
    finishedAt: end.toISOString(),
    pagesRead: pages,
    newPages: pages,
    durationSeconds: minutes * 60,
    segments: [{ start: start.toISOString(), end: end.toISOString() }],
  };
}

test('normalização: valores inválidos viram "não configurada"', () => {
  assert.deepEqual(normalizeGoals({ dailyMinutes: 45, weeklyPages: null }), { dailyMinutes: 45, weeklyPages: null });
  assert.deepEqual(normalizeGoals({ dailyMinutes: -3, weeklyPages: 2.5 }), { dailyMinutes: null, weeklyPages: null });
  assert.deepEqual(normalizeGoals(undefined), { dailyMinutes: 30, weeklyPages: 150 });
});

test('formulário de metas', () => {
  assert.deepEqual(validateGoalsForm({ dailyEnabled: true, dailyMinutes: '20', weeklyEnabled: false, weeklyPages: 'x' }).data, {
    dailyMinutes: 20,
    weeklyPages: null,
  });
  const bad = validateGoalsForm({ dailyEnabled: true, dailyMinutes: '0', weeklyEnabled: true, weeklyPages: '1.5' });
  assert.equal(bad.valid, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['dailyMinutes', 'weeklyPages']);
});

test('progresso das metas a partir das sessões', () => {
  const ledger = buildLedger([session(0, 10, 20), session(0, 5, 15, 20), session(2, 60, 40), session(5, 200, 90)]);
  const p = getGoalProgress({ ledger, goals: { dailyMinutes: 30, weeklyPages: 100 }, now: NOW });
  assert.equal(p.daily.value, 35);
  assert.equal(p.daily.status, 'done');
  assert.equal(p.weekly.value, 75, 'segunda a hoje; o dia 5 atrás (sábado) é da semana passada');
  assert.equal(p.weekly.status, 'in-progress');
  assert.equal(p.weekly.remaining, 25);
  assert.equal(p.weekly.daysLeft, 3, 'sexta, sábado e domingo');
  assert.equal(p.daily.history.length, 7);
  assert.equal(p.daily.metDays, 3, 'hoje (35), há 2 dias (40) e há 5 dias (90)');
  assert.equal(p.weekly.history.at(-2).met, true, 'semana passada: 200 páginas');
  assert.equal(p.weekly.metWeeks, 1);
});

test('metas sem configuração e sem leitura', () => {
  const p = getGoalProgress({ ledger: new Map(), goals: { dailyMinutes: null, weeklyPages: 50 }, now: NOW });
  assert.equal(p.daily.status, 'not-configured');
  assert.equal(p.weekly.status, 'not-started');
});

test('conquistas: datas de desbloqueio vêm do momento real', () => {
  const sessions = [session(9, 60, 300, 8, 'a'), session(8, 60, 300, 8, 'b'), session(7, 500, 300, 8, 'c')];
  const books = [{ id: 'b', status: 'finished', finishedAt: sessions[2].finishedAt }];
  const result = evaluateAchievements({ books, sessions, now: NOW });
  const byId = Object.fromEntries(result.map((a) => [a.id, a]));
  assert.equal(byId['first-session'].unlockedAt, sessions[0].finishedAt);
  assert.equal(byId['pages-50'].unlockedAt, sessions[0].finishedAt, '60 páginas já na 1ª sessão');
  assert.equal(byId['pages-150'].unlockedAt, sessions[2].finishedAt, '60 + 60 = 120 não chega a 150; a 3ª sessão passa');
  assert.equal(byId['pages-400'].unlockedAt, sessions[2].finishedAt);
  assert.equal(byId['pages-1000'].unlocked, false);
  assert.equal(byId['pages-1000'].remaining, 380);
  assert.equal(byId['time-5h'].unlockedAt, sessions[0].finishedAt);
  assert.equal(byId['time-15h'].unlockedAt, sessions[2].finishedAt, '5 h + 5 h + 5 h = 15 h na 3ª sessão');
});

test('conquista de horas', () => {
  const sessions = [session(9, 1, 300, 8, 'a'), session(8, 1, 300, 8, 'b')];
  const byId = Object.fromEntries(evaluateAchievements({ books: [], sessions, now: NOW }).map((a) => [a.id, a]));
  assert.equal(byId['time-5h'].unlockedAt, sessions[0].finishedAt);
  assert.equal(byId['time-15h'].unlocked, false);
  assert.equal(byId['time-15h'].remaining, 5 * 3600, '10 h de 15 h');
});

test('sequência de 10 dias: só dias com leitura de fato; hoje sem leitura não conta', () => {
  // 9 dias seguidos até ontem; hoje ainda não leu.
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => session(d, 5, 10, 8, `d${d}`));
  let byId = Object.fromEntries(evaluateAchievements({ books: [], sessions: nine, now: NOW }).map((a) => [a.id, a]));
  assert.equal(byId['streak-4'].unlocked, true);
  assert.equal(byId['streak-10'].unlocked, false);
  assert.equal(byId['streak-10'].value, 9);
  assert.equal(byId['streak-10'].remaining, 1);
  // Lendo hoje completa 10.
  const ten = [...nine, session(0, 5, 10, 8, 'today')];
  byId = Object.fromEntries(evaluateAchievements({ books: [], sessions: ten, now: NOW }).map((a) => [a.id, a]));
  assert.equal(byId['streak-10'].unlocked, true);
  assert.equal(new Date(byId['streak-10'].unlockedAt).getDate(), 15);
});

test('conquista salva sem os dados que a sustentavam: volta a "em andamento" (1.5)', () => {
  const stored = [{ id: 'first-session', unlockedAt: '2026-01-01T10:00:00.000Z' }];
  const result = evaluateAchievements({ books: [], sessions: [], stored, now: NOW });
  assert.equal(result.find((a) => a.id === 'first-session').unlocked, false);
  assert.deepEqual(findStaleAchievements(result, stored), ['first-session']);
  assert.deepEqual(findNewAchievements(result, stored), []);
  // Com a sessão, continua desbloqueada e mantém a data salva.
  const withSession = evaluateAchievements({ books: [], sessions: [session(1, 5, 10)], stored, now: NOW });
  assert.equal(withSession.find((a) => a.id === 'first-session').unlockedAt, '2026-01-01T10:00:00.000Z');
  assert.deepEqual(findStaleAchievements(withSession, stored), []);
  const fresh = evaluateAchievements({ books: [], sessions: [session(1, 5, 10)], now: NOW });
  assert.deepEqual(findNewAchievements(fresh, []).map((a) => a.id).sort(), ['days-1', 'first-session']);
});

test('1.6.0: metas predefinidas mais longas, mesma quantidade de níveis por categoria', () => {
  const count = (category) => ACHIEVEMENTS.filter((a) => a.category === category).length;
  assert.deepEqual(
    ['pages', 'time', 'sessions', 'days', 'streak', 'weekly', 'books'].map(count),
    [8, 7, 7, 7, 6, 6, 5],
    'mesma quantidade da 1.5.0',
  );
  assert.equal(ACHIEVEMENTS.length, 46);
  // Primeiros níveis continuam acessíveis; os últimos são de longo prazo.
  assert.deepEqual(LEVEL_TARGETS.pages.slice(0, 2), [10, 50]);
  assert.equal(LEVEL_TARGETS.pages.at(-1), 15000);
  assert.equal(LEVEL_TARGETS.time.at(-1), 250 * 3600);
  assert.equal(LEVEL_TARGETS.weekly.at(-1), 52);
  // Progressão crescente e sem saltos desproporcionais (no máximo 5× do nível anterior).
  for (const [category, targets] of Object.entries(LEVEL_TARGETS)) {
    for (let i = 1; i < targets.length; i += 1) {
      assert.ok(targets[i] > targets[i - 1], `${category}: crescente`);
      assert.ok(targets[i] / targets[i - 1] <= 5, `${category}: ${targets[i - 1]} → ${targets[i]}`);
    }
  }
  // Ids únicos.
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 46);
});

test('1.6.0: ids de alvos antigos saem da lista salva, sem perder meta semanal já cumprida', () => {
  // Conta da 1.5.0: tinha 'pages-100' e 'weekly-goal-4' (4 semanas cumpridas com a meta da época).
  const stored = [
    { id: 'first-session', unlockedAt: '2026-09-01T10:00:00.000Z' },
    { id: 'pages-100', unlockedAt: '2026-09-02T10:00:00.000Z' },
    { id: 'weekly-goal-4', unlockedAt: '2026-09-20T23:59:59.000Z' },
  ];
  const sessions = [session(40, 120, 60, 8, 'a')];
  const evaluated = evaluateAchievements({ books: [], sessions, stored, now: NOW, goals: { weeklyPages: 500 } });
  const byId = Object.fromEntries(evaluated.map((a) => [a.id, a]));
  assert.equal(byId['weekly-goal-3'].unlocked, true, '4 semanas cumpridas valem para o nível de 3');
  assert.equal(byId['weekly-goal-3'].unlockedAt, '2026-09-20T23:59:59.000Z');
  assert.equal(byId['weekly-goal-6'].unlocked, false);
  // Primeiro salva os níveis novos; só depois retira os ids antigos.
  const fresh = findNewAchievements(evaluated, stored).map((a) => a.id);
  assert.ok(fresh.includes('weekly-goal-1') && fresh.includes('weekly-goal-3'));
  assert.deepEqual(findStaleAchievements(evaluated, stored), [], 'nada sai enquanto há níveis novos a salvar');
  const saved = [...stored, ...findNewAchievements(evaluated, stored)];
  const again = evaluateAchievements({ books: [], sessions, stored: saved, now: NOW, goals: { weeklyPages: 500 } });
  assert.deepEqual(findStaleAchievements(again, saved).sort(), ['pages-100', 'weekly-goal-4']);
  const cleaned = saved.filter((a) => !['pages-100', 'weekly-goal-4'].includes(a.id));
  const final = Object.fromEntries(evaluateAchievements({ books: [], sessions, stored: cleaned, now: NOW, goals: { weeklyPages: 500 } }).map((a) => [a.id, a]));
  assert.equal(final['weekly-goal-3'].unlocked, true, 'continua desbloqueada depois da limpeza');
  assert.equal(final['pages-50'].unlocked, true);
  assert.equal(final['pages-150'].unlocked, false, '120 páginas não chegam ao novo nível de 150');
});
