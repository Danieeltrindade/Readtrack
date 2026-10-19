import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoWorkspaceData, DEMO_DATASET_VERSION, DEMO_ID_PREFIX, DEMO_WORKSPACE } from './demoDataset.js';
import { normalizeData } from '../services/storage/schema.js';
import { buildLedger, summarizeRange } from '../utils/ledger.js';
import { addDays, startOfDay } from '../utils/date.js';
import { evaluateAchievements, groupAchievements } from '../utils/achievements.js';
import { getWeeklyGoalHistory } from '../utils/goals.js';
import { calculateElapsedSeconds } from '../utils/duration.js';

// Vários "agora": meio do dia, madrugada (sem sessão hoje), fim de noite e outro mês.
const NOWS = [
  new Date(2026, 9, 19, 12, 40),
  new Date(2026, 9, 19, 0, 20),
  new Date(2026, 9, 25, 23, 50),
  new Date(2027, 2, 1, 9, 5),
];

test('demonstração: dados válidos para o app, nenhum descartado e nada no futuro', () => {
  for (const now of NOWS) {
    const data = createDemoWorkspaceData(now);
    const { data: normalized, report } = normalizeData(data);
    assert.deepEqual(report.dropped, { books: 0, sessions: 0, activeSession: 0 }, now.toString());
    assert.equal(normalized.sessions.length, data.sessions.length);
    for (const s of data.sessions) {
      assert.ok(new Date(s.finishedAt ?? s.startedAt) <= now, `sessão no futuro: ${s.id}`);
      assert.ok(s.pagesRead > 0);
    }
  }
});

test('demonstração: identificada como fictícia (ids, espaço e versão)', () => {
  const data = createDemoWorkspaceData(NOWS[0]);
  assert.equal(data.meta.workspace, DEMO_WORKSPACE);
  assert.equal(data.meta.demoDatasetVersion, DEMO_DATASET_VERSION);
  assert.ok(data.books.every((b) => b.id.startsWith(DEMO_ID_PREFIX)));
  assert.ok(data.sessions.every((s) => s.id.startsWith(DEMO_ID_PREFIX)));
  // Determinística: o mesmo "agora" gera exatamente os mesmos dados.
  assert.deepEqual(createDemoWorkspaceData(NOWS[0]), data);
});

test('demonstração: livros em todos os estados, observações, vocabulário e registros manuais', () => {
  const data = createDemoWorkspaceData(NOWS[0]);
  const statuses = new Set(data.books.map((b) => b.status));
  assert.deepEqual([...statuses].sort(), ['finished', 'reading', 'want-to-read']);
  assert.ok(data.books.some((b) => b.addedAsRead), 'um livro "já lido antes do ReadTrack"');
  assert.ok(data.books.some((b) => b.contentStartPage === 9), 'um livro com página inicial da leitura');
  assert.ok(data.books.filter((b) => b.status === 'finished' && b.rating).length >= 3, 'comentários finais com avaliação');
  assert.ok(data.sessions.filter((s) => s.notes).length >= 5);
  assert.ok(data.sessions.some((s) => s.vocabulary.length > 0));
  assert.ok(data.sessions.some((s) => s.source === 'manual'));
  assert.ok(data.sessions.some((s) => s.source === 'manual' && s.durationSeconds === null), 'registro manual sem duração (nada inventado)');
  assert.ok(data.sessions.some((s) => s.pauseCount > 0), 'sessões com pausa');
  const midnight = data.sessions.find((s) => s.finishedAt && new Date(s.startedAt).getDate() !== new Date(s.finishedAt).getDate());
  assert.ok(midnight, 'uma leitura atravessa a meia-noite');
  assert.ok(calculateElapsedSeconds(midnight.startedAt, midnight.finishedAt) > 0);
  // O livro em andamento não chega ao fim.
  const reading = data.books.find((b) => b.status === 'reading');
  assert.ok(reading.currentPage < reading.totalPages);
});

test('demonstração: há dados para mês, 3 meses, histórico total e os últimos 7 dias', () => {
  for (const now of NOWS) {
    const data = createDemoWorkspaceData(now);
    const ledger = buildLedger(data.sessions);
    const today = startOfDay(now);
    const pages = (from, to) => summarizeRange(ledger, from, to).pages;
    assert.ok(pages(addDays(today, -6), addDays(today, 1)) > 0, 'últimos 7 dias');
    assert.ok(pages(addDays(today, -30), addDays(today, 1)) > 0, 'último mês');
    assert.ok(pages(addDays(today, -91), addDays(today, 1)) > pages(addDays(today, -30), addDays(today, 1)), '3 meses > 1 mês');
    assert.ok(pages(addDays(today, -400), addDays(today, 1)) > pages(addDays(today, -91), addDays(today, 1)), 'histórico total > 3 meses');
  }
});

test('demonstração: conquistas desbloqueadas e em andamento, metas com progresso', () => {
  const now = NOWS[0];
  const data = createDemoWorkspaceData(now);
  const evaluated = evaluateAchievements({ books: data.books, sessions: data.sessions, stored: data.achievements, now, goals: data.goals });
  const groups = groupAchievements(evaluated);
  assert.ok(groups.every((g) => g.unlockedCount >= 1), 'todas as categorias com pelo menos um nível');
  assert.ok(groups.every((g) => !g.complete), 'nenhuma categoria completa: sempre há próximo nível');
  assert.ok(groups.some((g) => g.ratio > 0.8), 'alguma conquista perto de desbloquear');
  // As conquistas salvas são exatamente as que os registros sustentam.
  assert.deepEqual(data.achievements.map((a) => a.id).sort(), evaluated.filter((a) => a.unlocked).map((a) => a.id).sort());
  const weeks = getWeeklyGoalHistory({ ledger: buildLedger(data.sessions), weeklyPages: data.goals.weeklyPages, now });
  assert.ok(weeks.length >= 3, 'meta semanal cumprida em algumas semanas');
});
