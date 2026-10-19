import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPastBook, pastBookToFormValues, updatePastBook } from './books.js';
import { validatePastBookForm } from './validation.js';
import { getBookProgress, getDashboardSummary, getPeriodStats } from './stats.js';
import { evaluateAchievements } from './achievements.js';
import { buildLedger } from './ledger.js';
import { getGoalProgress } from './goals.js';
import { normalizeData, createEmptyData } from '../services/storage/schema.js';
import { bookToRow, rowToBook } from '../services/supabase/mappers.js';
import { dataReducer, ACTIONS } from '../context/dataReducer.js';

const NOW = new Date(2026, 9, 16, 12, 0);

test('só o título é obrigatório; vazios ficam vazios (nada inventado)', () => {
  const r = validatePastBookForm({ title: '  Grande Sertão  ' }, NOW);
  assert.equal(r.valid, true);
  assert.deepEqual(r.data, { title: 'Grande Sertão', author: '', totalPages: null, finishedAt: null, rating: null, review: '', learnings: '' });
  assert.ok(validatePastBookForm({ title: '' }, NOW).errors.title);
  assert.ok(validatePastBookForm({ title: 'X', totalPages: '0' }, NOW).errors.totalPages);
  assert.ok(validatePastBookForm({ title: 'X', totalPages: '-3' }, NOW).errors.totalPages);
  assert.ok(validatePastBookForm({ title: 'X', finishedAt: '2026-12-01' }, NOW).errors.finishedAt, 'data no futuro');
  assert.ok(validatePastBookForm({ title: 'X', rating: '7' }, NOW).errors.rating);
});

test('livro já lido: concluído, sem início, sem sessões, com comentário', () => {
  const { data } = validatePastBookForm(
    { title: 'Vidas Secas', author: 'Graciliano', totalPages: '176', finishedAt: '2019-05-10', rating: '5', review: 'Seco.', learnings: 'Economia de palavras.' },
    NOW,
  );
  const book = createPastBook(data, { id: 'b_old', now: NOW });
  assert.equal(book.status, 'finished');
  assert.equal(book.addedAsRead, true);
  assert.equal(book.startedAt, null);
  assert.equal(book.currentPage, 176);
  assert.equal(new Date(book.finishedAt).getFullYear(), 2019);
  assert.equal(book.rating, 5);
  assert.equal(getBookProgress(book), 100);
  assert.equal(pastBookToFormValues(book).finishedAt, '2019-05-10');

  const edited = updatePastBook(book, { ...data, totalPages: null, finishedAt: null, rating: null }, NOW);
  assert.equal(edited.totalPages, null);
  assert.equal(edited.currentPage, 0);
  assert.equal(edited.finishedAt, null);
  assert.equal(edited.id, 'b_old');
});

test('total de páginas desconhecido sobrevive à normalização e ao banco', () => {
  const book = createPastBook(validatePastBookForm({ title: 'Sem páginas' }, NOW).data, { id: 'b1', now: NOW });
  const { data, report } = normalizeData({ ...createEmptyData(), books: [book] });
  assert.equal(report.dropped.books, 0);
  assert.equal(data.books[0].totalPages, null, 'não vira 1 página');
  const row = bookToRow(data.books[0], 'u1');
  assert.equal(row.total_pages, null);
  assert.equal(row.added_as_read, true);
  assert.deepEqual(rowToBook(row).totalPages, null);
  // v1.4: livro comum sem total (ex.: importado de anotações) também fica "não informado",
  // sem virar 1 página e sem perder a página atual.
  const normal = normalizeData({ ...createEmptyData(), books: [{ id: 'c', title: 'Comum', totalPages: null, currentPage: 387, status: 'reading' }] });
  assert.equal(normal.data.books[0].totalPages, null);
  assert.equal(normal.data.books[0].currentPage, 387);
});

test('estatísticas honestas: conta como concluído, mas sem tempo, páginas, dias ou metas', () => {
  const past = createPastBook(validatePastBookForm({ title: 'Antigo', totalPages: '300', finishedAt: '2026-10-16' }, NOW).data, { id: 'p1', now: NOW });
  const undated = createPastBook(validatePastBookForm({ title: 'Sem data' }, NOW).data, { id: 'p2', now: NOW });
  const books = [past, undated];
  const sessions = [];
  const ledger = buildLedger(sessions);

  const summary = getDashboardSummary({ books, sessions, goals: { dailyMinutes: 30, weeklyPages: 100 }, ledger }, NOW);
  assert.equal(summary.counts.finished, 2);
  assert.equal(summary.totals.finishedBooks, 2);
  assert.equal(summary.totals.finishedBeforeApp, 2);
  assert.equal(summary.totals.pages, 0, 'as 300 páginas do livro não viram páginas lidas em sessões');
  assert.equal(summary.totals.seconds, 0);
  assert.equal(summary.streak.current, 0, 'nenhum dia de sequência inventado');

  const goals = getGoalProgress({ ledger, goals: { dailyMinutes: 30, weeklyPages: 100 }, now: NOW });
  assert.notEqual(goals.daily.status, 'done');
  assert.notEqual(goals.weekly.status, 'done');

  const october = getPeriodStats({ ledger, sessions, books }, { start: new Date(2026, 9, 1), end: new Date(2026, 10, 1), type: 'month' }, NOW);
  assert.deepEqual(october.finishedBooks.map((b) => b.id), ['p1'], 'só o livro com data entra no período');
  assert.equal(october.pages, 0);

  const achievements = evaluateAchievements({ books, sessions, now: NOW });
  assert.equal(achievements.find((a) => a.id === 'first-book').unlocked, true);
  assert.equal(achievements.find((a) => a.id === 'first-session').unlocked, false);
  assert.equal(achievements.find((a) => a.id === 'pages-150').unlocked, false);
});

test('excluir um livro remove as sessões dele (regra de integridade)', () => {
  const state = {
    ...createEmptyData(),
    books: [{ id: 'b1', title: 'A', totalPages: 10, currentPage: 5, status: 'reading' }],
    sessions: [{ id: 's1', bookId: 'b1', startPage: 0, endPage: 5 }],
  };
  const next = dataReducer(state, { type: ACTIONS.DELETE_BOOK, payload: { id: 'b1' } });
  assert.equal(next.books.length, 0);
  assert.equal(next.sessions.length, 0);
});
