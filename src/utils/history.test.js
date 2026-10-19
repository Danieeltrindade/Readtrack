import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterHistory, getRangeError, groupByDay, summarizeHistory } from './history.js';

const NOW = new Date(2026, 9, 16, 12, 0); // 16/10/2026, horário local
const books = new Map([
  ['b1', { id: 'b1', title: 'Memórias Póstumas de Brás Cubas', author: 'Machado de Assis' }],
  ['b2', { id: 'b2', title: 'O Cortiço', author: 'Aluísio Azevedo' }],
]);
const s = (id, bookId, date, extra = {}) => ({ id, bookId, startedAt: date.toISOString(), pagesRead: 10, durationSeconds: 600, notes: '', ...extra });
const sessions = [
  s('a', 'b1', new Date(2026, 9, 16, 8, 0)),
  s('b', 'b2', new Date(2026, 9, 15, 22, 0), { notes: 'palavra nova: estalagem' }),
  s('c', 'b1', new Date(2026, 8, 20, 21, 0)),
  s('d', 'b2', new Date(2025, 11, 31, 23, 30)),
  s('e', 'b2', new Date(2025, 11, 30, 0, 5)),
  s('orfa', 'b9', new Date(2026, 9, 16, 9, 0)),
];

test('ordena da mais recente para a mais antiga e ignora sessões sem livro', () => {
  assert.deepEqual(filterHistory(sessions, books, {}, NOW).map((x) => x.id), ['a', 'b', 'c', 'd', 'e']);
});

test('filtro por livro e busca por título (sem acentos)', () => {
  assert.deepEqual(filterHistory(sessions, books, { bookId: 'b2' }, NOW).map((x) => x.id), ['b', 'd', 'e']);
  assert.deepEqual(filterHistory(sessions, books, { query: 'memorias' }, NOW).map((x) => x.id), ['a', 'c']);
  assert.deepEqual(filterHistory(sessions, books, { query: 'cortico', bookId: 'b1' }, NOW), []);
});

test('filtros de período no fuso local', () => {
  assert.deepEqual(filterHistory(sessions, books, { period: '7d' }, NOW).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(filterHistory(sessions, books, { period: 'mes' }, NOW).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(filterHistory(sessions, books, { period: '30d' }, NOW).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(filterHistory(sessions, books, { period: 'ano' }, NOW).map((x) => x.id), ['a', 'b', 'c']);
  const custom = { period: 'personalizado', from: '2025-12-31', to: '2025-12-31' };
  assert.deepEqual(filterHistory(sessions, books, custom, NOW).map((x) => x.id), ['d'], 'data final é inclusiva');
  const early = { period: 'personalizado', from: '2025-12-30', to: '2025-12-30' };
  assert.deepEqual(filterHistory(sessions, books, early, NOW).map((x) => x.id), ['e'], 'dia inteiro, inclusive de madrugada');
});

test('datas invertidas geram aviso e não escondem tudo', () => {
  const bad = { period: 'personalizado', from: '2026-10-10', to: '2026-10-01' };
  assert.match(getRangeError(bad.period, bad), /depois/);
  assert.equal(filterHistory(sessions, books, bad, NOW).length, 5);
});

test('agrupa por dia e soma totais', () => {
  const list = filterHistory(sessions, books, {}, NOW);
  assert.deepEqual(groupByDay(list).map((g) => g.sessions.length), [1, 1, 1, 1, 1]);
  assert.deepEqual(summarizeHistory(list), { sessions: 5, pages: 50, seconds: 3000, withNotes: 1, withoutDuration: 0 });
});
