import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, dataReducer } from './dataReducer.js';
import { createEmptyData, migrate, normalizeData } from '../services/storage/schema.js';
import { createActiveSession } from '../utils/timer.js';
import { buildSession } from '../utils/sessions.js';
import { createDemoData } from '../data/demoData.js';

const userBook = {
  id: 'meu',
  title: 'Meu livro',
  author: 'Eu',
  totalPages: 100,
  currentPage: 0,
  status: 'want-to-read',
  startedAt: null,
  finishedAt: null,
};
const NOW = new Date('2026-10-15T20:00:00Z');

function stateWithUserBook() {
  return dataReducer(createEmptyData(), { type: ACTIONS.ADD_BOOK, payload: userBook });
}

function withActive(state, overrides = {}) {
  const active = { ...createActiveSession({ id: 's1', bookId: 'meu', startPage: 0, now: NOW }), ...overrides };
  return dataReducer(state, { type: ACTIONS.START_SESSION, payload: active });
}

function complete(state, endPage = 25, markFinished = false) {
  const reviewed = dataReducer(state, { type: ACTIONS.REVIEW_SESSION, payload: { now: new Date(NOW.getTime() + 1_200_000) } });
  const data = { startPage: 0, endPage, durationSeconds: 1200, notes: '' };
  const book = reviewed.books.find((b) => b.id === 'meu');
  const session = buildSession(reviewed.activeSession, data, { book, now: NOW });
  return { reviewed, action: { type: ACTIONS.COMPLETE_SESSION, payload: { session, markFinished } } };
}

/** Dados de demonstração gravados por versões antigas (isDemo: true) junto dos do usuário. */
function withLegacyDemo(state) {
  const demo = createDemoData(NOW);
  return { ...state, books: [...state.books, ...demo.books], sessions: [...state.sessions, ...demo.sessions] };
}

test('remover demonstração antiga mantém apenas dados reais', () => {
  let state = withLegacyDemo(stateWithUserBook());
  assert.equal(state.books.filter((b) => b.isDemo).length, 3);
  state = dataReducer(state, { type: ACTIONS.REMOVE_DEMO });
  assert.deepEqual(state.books.map((b) => b.id), ['meu']);
  assert.equal(state.sessions.length, 0);
});

test('só uma sessão ativa por vez', () => {
  const state = withActive(stateWithUserBook());
  const again = dataReducer(state, { type: ACTIONS.START_SESSION, payload: { id: 'outra' } });
  assert.equal(again.activeSession.id, 's1');
});

test('finalizar sessão: histórico, página atual e status atualizados juntos', () => {
  const { reviewed, action } = complete(withActive(stateWithUserBook()));
  const state = dataReducer(reviewed, action);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.activeSession, null);
  const book = state.books[0];
  assert.equal(book.currentPage, 25);
  assert.equal(book.status, 'reading', '"Quero ler" vira "Lendo"');
  assert.ok(book.startedAt);
});

test('clique repetido em salvar não duplica a sessão', () => {
  const { reviewed, action } = complete(withActive(stateWithUserBook()));
  let state = dataReducer(reviewed, action);
  state = dataReducer(state, action);
  state = dataReducer(state, action);
  assert.equal(state.sessions.length, 1);
  assert.equal(state.books[0].currentPage, 25);
});

test('concluir pela última página marca o livro como concluído', () => {
  const { reviewed, action } = complete(withActive(stateWithUserBook()), 100, true);
  const book = dataReducer(reviewed, action).books[0];
  assert.equal(book.status, 'finished');
  assert.equal(book.currentPage, 100);
  assert.ok(book.finishedAt);
});

test('cancelar descarta a sessão sem registrar nada', () => {
  let state = withActive(stateWithUserBook());
  state = dataReducer(state, { type: ACTIONS.CANCEL_SESSION, payload: { id: 's1' } });
  assert.equal(state.activeSession, null);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.books[0].currentPage, 0);
});

test('excluir livro remove suas sessões e o cronômetro dele', () => {
  const { reviewed, action } = complete(withActive(stateWithUserBook()));
  let state = dataReducer(reviewed, action);
  state = withActive(state, { id: 's2' });
  state = dataReducer(state, { type: ACTIONS.DELETE_BOOK, payload: { id: 'meu' } });
  assert.equal(state.books.length, 0);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.activeSession, null);
});

test('migração v1 → v2 converte sessões antigas sem perder dados', () => {
  const v1 = {
    version: 1,
    books: [{ id: 'b', title: 'Antigo', author: 'A', totalPages: 100, currentPage: 30, status: 'reading', extra: 'x' }],
    sessions: [{ id: 's', bookId: 'b', startedAt: '2026-10-01T20:00:00Z', endedAt: '2026-10-01T20:30:00Z', startPage: 0, endPage: 30, pagesRead: 30, durationSeconds: 1800 }],
    goals: { dailyMinutes: 45, weeklyPages: 200 },
  };
  const { data, report } = normalizeData(migrate(v1));
  assert.equal(data.version, 2);
  assert.equal(data.sessions[0].finishedAt, '2026-10-01T20:30:00.000Z');
  assert.equal('endedAt' in data.sessions[0], false);
  assert.equal(data.sessions[0].segments.length, 1);
  assert.equal(data.books[0].description, '');
  assert.equal(data.books[0].extra, 'x', 'campos desconhecidos preservados');
  assert.equal(data.goals.dailyMinutes, 45);
  assert.equal(data.activeSession, null);
  assert.equal(report.dropped.sessions, 0);
});

test('sessão ativa de livro inexistente é descartada ao carregar', () => {
  const raw = { ...createEmptyData(), activeSession: createActiveSession({ id: 'x', bookId: 'sumiu', startPage: 0, now: NOW }) };
  const { data, report } = normalizeData(raw);
  assert.equal(data.activeSession, null);
  assert.equal(report.dropped.activeSession, 1);
});

test('conquistas: sincronização só acrescenta, sem duplicar', () => {
  let state = createEmptyData();
  state = dataReducer(state, { type: ACTIONS.SYNC_ACHIEVEMENTS, payload: [{ id: 'first-session', unlockedAt: 'x' }] });
  state = dataReducer(state, { type: ACTIONS.SYNC_ACHIEVEMENTS, payload: [{ id: 'first-session', unlockedAt: 'y' }, { id: 'pages-100', unlockedAt: 'z' }] });
  assert.deepEqual(state.achievements.map((a) => a.unlockedAt), ['x', 'z']);
});

test('limpar dados volta ao estado vazio; substituir zera conquistas para recálculo', () => {
  let state = withLegacyDemo(stateWithUserBook());
  state = dataReducer(state, { type: ACTIONS.CLEAR_ALL });
  assert.equal(state.books.length, 0);
  assert.equal(state.sessions.length, 0);
  const replaced = dataReducer(state, { type: ACTIONS.REPLACE_ALL, payload: { ...createEmptyData(), books: [userBook], achievements: [{ id: 'x' }] } });
  assert.equal(replaced.books.length, 1);
  assert.deepEqual(replaced.achievements, []);
});
