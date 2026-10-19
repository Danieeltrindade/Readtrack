import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManualSession, getTimerStartPage } from './sessions.js';
import { formatVocabularyText, parseVocabularyText, validateBookForm, validateManualSession } from './validation.js';
import { calculateElapsedSeconds, formatDurationText, getDurationDivergence, parseDurationText } from './duration.js';
import { computeNewPagesByUnion, getContentPagesDone, getReadablePages } from './pages.js';
import { getBookProgress, getDashboardSummary } from './stats.js';
import { buildLedger } from './ledger.js';
import { createBook, updateBook } from './books.js';
import { dataReducer, ACTIONS } from '../context/dataReducer.js';
import { createEmptyData, normalizeData } from '../services/storage/schema.js';
import { rowToSession, sessionToRow } from '../services/supabase/mappers.js';

const NOW = new Date(2026, 9, 17, 12, 0);
const book = (extra = {}) => ({ id: 'b1', title: 'Livro', author: 'A', totalPages: 400, currentPage: 0, status: 'reading', ...extra });
const values = (extra = {}) => ({
  bookId: 'b1',
  startDate: '2026-09-24',
  startTime: '23:21',
  endDate: '2026-09-25',
  endTime: '01:47',
  startPage: '56',
  endPage: '145',
  duration: '2:10:02',
  notes: 'Leitura longa.',
  vocabularyText: 'Prestimosa: Que presta bons serviços.\nAlforge: Bolsa dupla de couro.',
  ...extra,
});

/* ---------- 1–2. Página inicial da leitura ---------- */

test('página inicial diferente de 1: progresso conta só o conteúdo', () => {
  const b = book({ contentStartPage: 9, currentPage: 8 });
  assert.equal(getReadablePages(b), 392);
  assert.equal(getContentPagesDone(b), 0, 'páginas 1–8 não contam');
  assert.equal(getBookProgress(b), 0);
  assert.equal(getBookProgress({ ...b, currentPage: 204 }), 50, '(204 − 8) / 392 = 50%');
  assert.equal(getTimerStartPage({ ...b, currentPage: 0 }), 8, 'o cronômetro começa no início do conteúdo');
  // Sem a configuração: comportamento anterior.
  assert.equal(getBookProgress(book({ currentPage: 200 })), 50);

  const ok = validateBookForm({ title: 'X', author: 'Y', totalPages: '400', currentPage: '0', status: 'reading', contentStartPage: '9' }, NOW);
  assert.equal(ok.data.contentStartPage, 9);
  assert.ok(validateBookForm({ title: 'X', author: 'Y', totalPages: '400', status: 'reading', contentStartPage: '0' }, NOW).errors.contentStartPage);
  assert.ok(validateBookForm({ title: 'X', author: 'Y', totalPages: '400', status: 'reading', contentStartPage: '401' }, NOW).errors.contentStartPage);
  assert.equal(validateBookForm({ title: 'X', author: 'Y', totalPages: '400', status: 'reading', contentStartPage: '' }, NOW).data.contentStartPage, null);
  assert.equal(createBook(ok.data, { id: 'n', now: NOW }).contentStartPage, 9);
});

test('editar a página inicial não perde nem altera sessões; só as páginas novas são recalculadas', () => {
  const s1 = buildManualSession(validateManualSession(values({ startPage: '1', endPage: '20', endDate: '', endTime: '', vocabularyText: '' }), { book: book(), now: NOW }).data, { id: 's1', now: NOW });
  let state = { ...createEmptyData(), books: [book()], sessions: [] };
  state = dataReducer(state, { type: ACTIONS.ADD_SESSIONS, payload: { sessions: [s1], now: NOW } });
  assert.equal(state.sessions[0].newPages, 20);
  const edited = updateBook(state.books[0], { ...state.books[0], contentStartPage: 9, status: 'reading' }, NOW);
  const next = dataReducer(state, { type: ACTIONS.UPDATE_BOOK, payload: edited });
  assert.equal(next.sessions.length, 1);
  assert.equal(next.sessions[0].startPage, 1, 'intervalo anotado preservado');
  assert.equal(next.sessions[0].endPage, 20);
  assert.equal(next.sessions[0].pagesRead, 20, 'páginas registradas da sessão não mudam');
  assert.equal(next.sessions[0].newPages, 12, 'páginas 9–20 são as novas do conteúdo');
  assert.equal(next.sessions[0].notes, s1.notes);
});

/* ---------- 3–8. Sessão manual ---------- */

test('validação: meia-noite exige data final explícita; horários e páginas inválidos', () => {
  const ctx = { book: book(), sessions: [], now: NOW };
  const ok = validateManualSession(values(), ctx);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.pagesRead, 90, 'p. 56–145 = 90 páginas');

  const sameDay = validateManualSession(values({ endDate: '2026-09-24' }), ctx);
  assert.match(sameDay.errors.endTime, /passou da meia-noite/, 'não deduz a virada do dia');
  assert.ok(validateManualSession(values({ startPage: '0' }), ctx).errors.startPage);
  assert.ok(validateManualSession(values({ startPage: '-5' }), ctx).errors.startPage);
  assert.ok(validateManualSession(values({ startPage: '50', endPage: '40' }), ctx).errors.endPage);
  assert.ok(validateManualSession(values({ endPage: '401' }), ctx).errors.endPage);
  assert.ok(validateManualSession(values({ startTime: '25:00' }), ctx).errors.startTime);
  assert.ok(validateManualSession(values({ startDate: '2026-12-01', endDate: '2026-12-01', endTime: '23:59' }), ctx).errors.startDate, 'futuro');
  assert.ok(validateManualSession(values({ duration: 'abc' }), ctx).errors.duration);
  assert.ok(validateManualSession(values({ bookId: '' }), { ...ctx, book: null }).errors.bookId);
  assert.ok(validateManualSession(values(), { ...ctx, book: book({ addedAsRead: true }) }).errors.bookId);
  // Término e duração são opcionais.
  const minimal = validateManualSession(values({ endDate: '', endTime: '', duration: '', notes: '', vocabularyText: '' }), ctx);
  assert.equal(minimal.valid, true);
  assert.equal(minimal.data.finishedAt, null);
  assert.equal(minimal.data.durationSeconds, null, 'sem duração conhecida, nada é inventado');
});

test('diferença cronológica e duração registrada × calculada', () => {
  const start = new Date(2026, 8, 24, 23, 21);
  const end = new Date(2026, 8, 25, 1, 47);
  assert.equal(calculateElapsedSeconds(start, end), 2 * 3600 + 26 * 60);
  assert.equal(calculateElapsedSeconds(end, start), null, 'fim antes do início não vira duração negativa');
  assert.equal(parseDurationText('2:10:02').seconds, 7802);
  assert.equal(parseDurationText('53:09').seconds, 3189);
  assert.equal(parseDurationText('45').seconds, 2700);
  assert.equal(parseDurationText('').seconds, null);
  assert.ok(parseDurationText('1:75:00').error);
  assert.equal(formatDurationText(7802), '2:10:02');
  assert.equal(formatDurationText(719), '11:59');

  const { data } = validateManualSession(values(), { book: book(), now: NOW });
  const session = buildManualSession(data, { id: 'm1', now: NOW });
  assert.equal(session.durationSeconds, 7802, 'duração anotada preservada');
  const divergence = getDurationDivergence(session);
  assert.equal(divergence.calculated, 8760);
  assert.equal(divergence.recorded, 7802);
  assert.equal(getDurationDivergence({ ...session, durationSeconds: 8760 + 30 }), null, 'até 1 min de diferença é arredondamento');
  assert.equal(session.createdAt, NOW.toISOString(), 'data do cadastro ≠ data da leitura');
  assert.notEqual(session.startedAt, session.createdAt);
});

test('cadastrar, editar e excluir sessão manual atualiza histórico, livro e estatísticas', () => {
  const ctx = { book: book(), sessions: [], now: NOW };
  const s = buildManualSession(validateManualSession(values(), ctx).data, { id: 'm1', now: NOW });
  let state = { ...createEmptyData(), books: [book({ status: 'want-to-read' })], sessions: [] };
  state = dataReducer(state, { type: ACTIONS.ADD_SESSIONS, payload: { sessions: [s], now: NOW } });
  assert.equal(state.sessions.length, 1);
  assert.equal(state.books[0].status, 'reading');
  assert.equal(state.books[0].currentPage, 145);
  assert.equal(state.books[0].startedAt, s.startedAt, 'início do livro = data real da leitura');
  let totals = getDashboardSummary({ books: state.books, sessions: state.sessions, goals: null, ledger: buildLedger(state.sessions) }, NOW).totals;
  assert.equal(totals.pages, 90);
  assert.equal(totals.seconds, 7802, 'usa a duração anotada, não a calculada (8760)');

  // Duplicação acidental: mesmo livro, início e páginas.
  assert.match(validateManualSession(values(), { book: book(), sessions: state.sessions, now: NOW }).errors.form, /Já existe/);
  assert.equal(validateManualSession(values(), { book: book(), sessions: state.sessions, editingId: 'm1', now: NOW }).valid, true, 'editar a própria sessão não é duplicata');

  // Editar: páginas e vocabulário.
  const editData = validateManualSession(values({ endPage: '120', vocabularyText: 'Assentiu: Concordou.' }), { book: book(), sessions: state.sessions, editingId: 'm1', now: NOW }).data;
  state = dataReducer(state, { type: ACTIONS.UPDATE_SESSION, payload: { session: { ...s, ...editData }, now: NOW } });
  assert.equal(state.sessions[0].pagesRead, 65);
  assert.equal(state.books[0].currentPage, 120);
  assert.deepEqual(state.sessions[0].vocabulary, [{ term: 'Assentiu', meaning: 'Concordou.' }]);

  // Excluir: livro volta para antes da sessão; estatísticas zeram.
  state = dataReducer(state, { type: ACTIONS.DELETE_SESSION, payload: { deleteId: 'm1', now: NOW } });
  assert.equal(state.sessions.length, 0);
  assert.equal(state.books[0].currentPage, 55, 'marcador antes da p. 56');
  totals = getDashboardSummary({ books: state.books, sessions: state.sessions, goals: null, ledger: buildLedger(state.sessions) }, NOW).totals;
  assert.equal(totals.pages, 0);
  assert.equal(totals.seconds, 0);
});

test('sessão sem duração conhecida: conta páginas, não inventa tempo nem ritmo', () => {
  const data = validateManualSession(values({ duration: '', endTime: '', endDate: '' }), { book: book(), now: NOW }).data;
  const s = buildManualSession(data, { id: 'm2', now: NOW });
  const summary = getDashboardSummary({ books: [book()], sessions: [s], goals: null, ledger: buildLedger([s]) }, NOW);
  assert.equal(summary.totals.pages, 90);
  assert.equal(summary.totals.seconds, 0);
  assert.equal(summary.totals.averageSessionSeconds, null, 'média sem sessões com duração = indisponível');
  assert.equal(summary.totals.sessionsWithoutDuration, 1);
  assert.equal(summary.pace.reliable, false);
});

test('notas e vocabulário persistem (localStorage e banco)', () => {
  const s = buildManualSession(validateManualSession(values(), { book: book(), now: NOW }).data, { id: 'm1', now: NOW });
  const stored = JSON.parse(JSON.stringify({ ...createEmptyData(), books: [book()], sessions: [s] }));
  const { data } = normalizeData(stored);
  assert.equal(data.sessions[0].notes, 'Leitura longa.');
  assert.deepEqual(data.sessions[0].vocabulary, [
    { term: 'Prestimosa', meaning: 'Que presta bons serviços.' },
    { term: 'Alforge', meaning: 'Bolsa dupla de couro.' },
  ]);
  assert.equal(data.sessions[0].durationSeconds, 7802);
  assert.equal(data.sessions[0].source, 'manual');
  const back = rowToSession(sessionToRow(data.sessions[0], 'u1'));
  assert.deepEqual(back.vocabulary, data.sessions[0].vocabulary);
  assert.equal(back.finishedAt, data.sessions[0].finishedAt);
  assert.equal(formatVocabularyText(back.vocabulary), 'Prestimosa: Que presta bons serviços.\nAlforge: Bolsa dupla de couro.');
  assert.deepEqual(parseVocabularyText('  Termo sem significado  \n\n Termo: com: dois-pontos'), [
    { term: 'Termo sem significado', meaning: '' },
    { term: 'Termo', meaning: 'com: dois-pontos' },
  ]);
});

test('páginas novas pela união: lacunas, ordem trocada e releitura', () => {
  const m = (id, day, a, b) => ({ id, startedAt: new Date(2026, 7, day).toISOString(), startPage: a, endPage: b, source: 'manual' });
  const fresh = computeNewPagesByUnion([m('a', 2, 9, 14), m('b', 1, 24, 33), m('c', 3, 10, 30), m('d', 4, 50, 60)]);
  assert.equal(fresh.get('b'), 10);
  assert.equal(fresh.get('a'), 6, 'antes da sessão b nas páginas, mas depois no tempo: ainda é nova');
  assert.equal(fresh.get('c'), 21 - 5 - 7, 'p. 10–30: 10–14 e 24–30 já cobertas');
  assert.equal(fresh.get('d'), 11, 'lacuna 34–49 não é preenchida');
  // Sessão do cronômetro (marcador) e manual cobrindo as mesmas páginas.
  const t = { id: 't', startedAt: new Date(2026, 7, 5).toISOString(), startPage: 8, endPage: 14 };
  assert.equal(computeNewPagesByUnion([m('a', 2, 9, 14), t]).get('t'), 0, 'mesmas páginas 9–14, escritas de jeitos diferentes');
});

test('cronômetro com pausa: sem aviso falso de divergência (as pausas não são leitura)', () => {
  const start = new Date('2026-10-01T21:00:00-03:00');
  const timer = {
    source: 'timer',
    startedAt: start.toISOString(),
    finishedAt: new Date(start.getTime() + 34 * 60_000).toISOString(), // 30 min lendo + 4 min de pausa
    durationSeconds: 30 * 60,
    pausedSeconds: 4 * 60,
  };
  assert.equal(getDurationDivergence(timer), null);
  // Registro manual com a mesma diferença continua avisando (a anotação é preservada).
  assert.notEqual(getDurationDivergence({ ...timer, source: 'manual', pausedSeconds: 0 }), null);
});
