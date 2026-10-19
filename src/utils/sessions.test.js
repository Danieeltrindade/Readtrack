import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySessionToBook, buildSession, calculateSessionPages } from './sessions.js';
import { createActiveSession, pauseActiveSession, resumeActiveSession, reviewActiveSession } from './timer.js';
import { validateSessionForm } from './validation.js';

const T0 = new Date('2026-10-15T20:00:00Z').getTime();
const at = (s) => new Date(T0 + s * 1000);
const book = (overrides = {}) => ({
  id: 'b1',
  title: 'Livro',
  totalPages: 200,
  currentPage: 50,
  status: 'reading',
  startedAt: '2026-10-01T12:00:00.000Z',
  finishedAt: null,
  ...overrides,
});

test('sessões consecutivas não contam a mesma página duas vezes', () => {
  const a = calculateSessionPages({ startPage: 0, endPage: 30, previousProgress: 0 });
  const b = calculateSessionPages({ startPage: 30, endPage: 50, previousProgress: 30 });
  assert.equal(a.pagesRead + b.pagesRead, 50);
  assert.equal(a.newPages + b.newPages, 50);
});

test('releitura conta como esforço mas não avança o progresso', () => {
  const r = calculateSessionPages({ startPage: 20, endPage: 60, previousProgress: 50 });
  assert.equal(r.pagesRead, 40);
  assert.equal(r.newPages, 10);
  assert.equal(r.overlap, 30);
});

test('validação de páginas e duração', () => {
  const ctx = { book: book(), measuredSeconds: 1200 };
  assert.ok(validateSessionForm({ startPage: '50', endPage: '70' }, ctx).valid);
  assert.match(validateSessionForm({ startPage: '50', endPage: '50' }, ctx).errors.endPage, /maior/);
  assert.match(validateSessionForm({ startPage: '50', endPage: '201' }, ctx).errors.endPage, /200/);
  assert.match(validateSessionForm({ startPage: '', endPage: '70' }, ctx).errors.startPage, /página/);
  assert.match(validateSessionForm({ startPage: '1', endPage: '2' }, { book: book(), measuredSeconds: 0 }).errors.durationMinutes, /não registrou/);
  // Duração editada: pode reduzir, não pode aumentar.
  const reduced = validateSessionForm({ startPage: '50', endPage: '70', durationEdited: true, durationMinutes: '15' }, ctx);
  assert.equal(reduced.data.durationSeconds, 900);
  assert.match(
    validateSessionForm({ startPage: '50', endPage: '70', durationEdited: true, durationMinutes: '45' }, ctx).errors.durationMinutes,
    /20 min/,
  );
  // Valor arredondado para cima mantém os segundos exatos.
  const exact = validateSessionForm({ startPage: '50', endPage: '70', durationEdited: true, durationMinutes: '1' }, { book: book(), measuredSeconds: 40 });
  assert.equal(exact.data.durationSeconds, 40);
  assert.match(validateSessionForm({ startPage: '1', endPage: '2' }, { book: book(), measuredSeconds: 90000 }).errors.durationMinutes, /24 horas/);
});

test('sessão guarda intervalos, pausas e duração efetiva', () => {
  let active = createActiveSession({ id: 's1', bookId: 'b1', startPage: 50, now: at(0) });
  active = pauseActiveSession(active, at(600));
  active = resumeActiveSession(active, at(900));
  active = reviewActiveSession(active, at(1500));
  const { data } = validateSessionForm({ startPage: '50', endPage: '80', notes: '  ok ' }, { book: book(), measuredSeconds: 1200 });
  const session = buildSession(active, data, { book: book(), now: at(1600) });
  assert.equal(session.id, 's1', 'mesmo id da sessão ativa');
  assert.equal(session.durationSeconds, 1200);
  assert.equal(session.pausedSeconds, 300);
  assert.equal(session.pauseCount, 1);
  assert.equal(session.segments.length, 2);
  assert.equal(session.finishedAt, at(1500).toISOString());
  assert.equal(session.pagesRead, 30);
  assert.equal(session.newPages, 30);
  assert.equal(session.notes, 'ok');
});

test('livro: página atual avança, nunca recua', () => {
  const s = { startPage: 10, endPage: 30, startedAt: at(0).toISOString(), finishedAt: at(60).toISOString() };
  assert.equal(applySessionToBook(book(), s).currentPage, 50);
  assert.equal(applySessionToBook(book(), { ...s, endPage: 90 }).currentPage, 90);
});

test('livro "Quero ler" vira "Lendo" com data de início da sessão', () => {
  const s = { startPage: 0, endPage: 12, startedAt: at(0).toISOString(), finishedAt: at(60).toISOString() };
  const updated = applySessionToBook(book({ status: 'want-to-read', currentPage: 0, startedAt: null }), s);
  assert.equal(updated.status, 'reading');
  assert.equal(updated.startedAt, s.startedAt);
});

test('concluir pela sessão: status, 100% e data de conclusão consistentes', () => {
  const s = { startPage: 180, endPage: 200, startedAt: at(0).toISOString(), finishedAt: at(60).toISOString() };
  const done = applySessionToBook(book({ currentPage: 180 }), s, { markFinished: true });
  assert.equal(done.status, 'finished');
  assert.equal(done.currentPage, 200);
  assert.equal(done.finishedAt, s.finishedAt);
  const notConfirmed = applySessionToBook(book({ currentPage: 180 }), s, { markFinished: false });
  assert.equal(notConfirmed.status, 'reading');
  // "Concluir" só vale quando a página final é a última do livro.
  const { data } = validateSessionForm({ startPage: '10', endPage: '20', markFinished: true }, { book: book(), measuredSeconds: 60 });
  assert.equal(data.markFinished, false);
});
