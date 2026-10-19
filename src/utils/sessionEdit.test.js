import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySessionChange, getMeasuredSeconds, recomputeNewPages } from './sessions.js';
import { validateFinalReview, validateSessionEdit } from './validation.js';
import { dataReducer, ACTIONS } from '../context/dataReducer.js';
import { createEmptyData } from '../services/storage/schema.js';
import { buildLedger, summarizeRange } from './ledger.js';

const NOW = new Date('2026-10-16T12:00:00Z');
const book = (extra = {}) => ({ id: 'b1', title: 'Livro', totalPages: 200, currentPage: 50, status: 'reading', ...extra });
const session = (id, day, startPage, endPage, extra = {}) => ({
  id,
  bookId: 'b1',
  startedAt: `2026-10-${day}T20:00:00.000Z`,
  finishedAt: `2026-10-${day}T20:30:00.000Z`,
  durationSeconds: 1800,
  segments: [{ start: `2026-10-${day}T20:00:00.000Z`, end: `2026-10-${day}T20:30:00.000Z` }],
  startPage,
  endPage,
  pagesRead: endPage - startPage,
  newPages: endPage - startPage,
  notes: '',
  ...extra,
});

test('páginas novas recalculadas em ordem cronológica, sem contar a mesma página duas vezes', () => {
  const fresh = recomputeNewPages([session('s2', 11, 20, 50), session('s1', 10, 0, 30)]);
  assert.equal(fresh.get('s1'), 30);
  assert.equal(fresh.get('s2'), 20, 'páginas 20–30 já tinham sido lidas');
});

test('excluir a última sessão: o marcador volta para onde ela começou', () => {
  const sessions = [session('s1', 10, 0, 30), session('s2', 11, 30, 50)];
  const r = applySessionChange({ book: book(), sessions, change: { deleteId: 's2' }, now: NOW });
  assert.equal(r.sessions.length, 1);
  assert.equal(r.book.currentPage, 30);
});

test('excluir a primeira sessão: a seguinte passa a contar as páginas como novas', () => {
  const sessions = [session('s1', 10, 0, 30), { ...session('s2', 11, 20, 50), newPages: 20 }];
  const r = applySessionChange({ book: book(), sessions, change: { deleteId: 's1' }, now: NOW });
  assert.equal(r.sessions[0].newPages, 30);
  assert.equal(r.book.currentPage, 50, 'progresso continua no fim da sessão restante');
});

test('editar a página final ajusta progresso e páginas novas', () => {
  const sessions = [session('s1', 10, 0, 30), session('s2', 11, 30, 50)];
  const lower = applySessionChange({ book: book(), sessions, change: { session: { id: 's2', endPage: 40, pagesRead: 10 } }, now: NOW });
  assert.equal(lower.book.currentPage, 40);
  assert.equal(lower.sessions.find((s) => s.id === 's2').newPages, 10);
  const higher = applySessionChange({ book: book(), sessions, change: { session: { id: 's2', endPage: 80, pagesRead: 50 } }, now: NOW });
  assert.equal(higher.book.currentPage, 80);
});

test('progresso registrado à mão além das sessões não é desfeito', () => {
  const sessions = [session('s1', 10, 0, 30)];
  const r = applySessionChange({ book: book({ currentPage: 120 }), sessions, change: { deleteId: 's1' }, now: NOW });
  assert.equal(r.book.currentPage, 120);
});

test('livro concluído continua concluído com todas as páginas', () => {
  const sessions = [session('s1', 10, 0, 200)];
  const r = applySessionChange({ book: book({ status: 'finished', currentPage: 200 }), sessions, change: { deleteId: 's1' }, now: NOW });
  assert.equal(r.book.currentPage, 200);
  assert.equal(r.book.status, 'finished');
});

test('outras sessões e livros não mudam', () => {
  const other = { ...session('x1', 10, 0, 10), bookId: 'b2' };
  const sessions = [session('s1', 10, 0, 30), other];
  const r = applySessionChange({ book: book(), sessions, change: { deleteId: 's1' }, now: NOW });
  assert.equal(r.sessions[0], other, 'mesma referência');
});

test('edição: valida páginas e não aceita duração maior que a medida', () => {
  const s = session('s1', 10, 0, 30);
  const measured = getMeasuredSeconds(s);
  assert.equal(measured, 1800);
  const ctx = { book: book(), session: s, measuredSeconds: measured };
  const ok = validateSessionEdit({ startPage: '0', endPage: '25', durationMinutes: '30', notes: '  palavra: nonada  ' }, ctx);
  assert.equal(ok.valid, true);
  assert.equal(ok.data.durationSeconds, 1800, 'minutos inalterados mantêm os segundos exatos');
  assert.equal(ok.data.notes, 'palavra: nonada');
  assert.equal(ok.data.pagesRead, 25);
  assert.ok(validateSessionEdit({ startPage: '30', endPage: '10', durationMinutes: '30' }, ctx).errors.endPage);
  assert.ok(validateSessionEdit({ startPage: '-1', endPage: '10', durationMinutes: '30' }, ctx).errors.startPage, 'página negativa');
  assert.ok(validateSessionEdit({ startPage: '0', endPage: '201', durationMinutes: '30' }, ctx).errors.endPage);
  assert.match(validateSessionEdit({ startPage: '0', endPage: '10', durationMinutes: '45' }, ctx).errors.durationMinutes, /não pode ser maior/);
  assert.equal(validateSessionEdit({ startPage: '0', endPage: '10', durationMinutes: '20' }, ctx).data.durationSeconds, 1200);
  assert.ok(validateSessionEdit({ startPage: '0', endPage: '10', durationMinutes: '30', notes: 'x'.repeat(1001) }, ctx).errors.notes);
});

test('comentário final: tudo opcional; nota de 1 a 5', () => {
  assert.deepEqual(validateFinalReview({}).data, { rating: null, review: '', learnings: '' });
  const r = validateFinalReview({ rating: '5', review: ' Ótimo ', learnings: ' Paciência ' });
  assert.deepEqual(r.data, { rating: 5, review: 'Ótimo', learnings: 'Paciência' });
  assert.ok(validateFinalReview({ rating: '0' }).errors.rating);
  assert.ok(validateFinalReview({ learnings: 'x'.repeat(2001) }).errors.learnings);
});

test('reducer: excluir sessão atualiza livro e estatísticas (livro-razão)', () => {
  const state = { ...createEmptyData(), books: [book({ currentPage: 50 })], sessions: [session('s1', 10, 0, 30), session('s2', 11, 30, 50)] };
  const before = summarizeRange(buildLedger(state.sessions), new Date('2026-10-01T00:00:00'), new Date('2026-10-31T00:00:00'));
  assert.equal(before.pages, 50);
  const next = dataReducer(state, { type: ACTIONS.DELETE_SESSION, payload: { deleteId: 's2', now: NOW } });
  const after = summarizeRange(buildLedger(next.sessions), new Date('2026-10-01T00:00:00'), new Date('2026-10-31T00:00:00'));
  assert.equal(after.pages, 30);
  assert.equal(after.seconds, 1800);
  assert.equal(next.books[0].currentPage, 30);
  assert.equal(dataReducer(next, { type: ACTIONS.DELETE_SESSION, payload: { deleteId: 's2', now: NOW } }), next, 'excluir de novo não muda nada');
});

test('reducer: editar só a observação preserva páginas, duração e o livro', () => {
  const state = { ...createEmptyData(), books: [book({ currentPage: 30 })], sessions: [session('s1', 10, 0, 30, { notes: 'antes' })] };
  const next = dataReducer(state, { type: ACTIONS.UPDATE_SESSION, payload: { session: { ...state.sessions[0], notes: '' }, now: NOW } });
  assert.equal(next.sessions[0].notes, '');
  assert.equal(next.sessions[0].pagesRead, 30);
  assert.equal(next.sessions[0].durationSeconds, 1800);
  assert.equal(next.books[0], state.books[0], 'livro não muda');
});
