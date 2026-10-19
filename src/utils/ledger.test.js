import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateSession, buildLedger, largestRemainder, summarizeRange } from './ledger.js';
import {
  countElapsedDays,
  getComparableRange,
  getPeriodRange,
  shiftPeriod,
  startOfWeek,
  toDateKey,
} from './date.js';

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m); // outubro de 2026, horário local
const iso = (date) => date.toISOString();

function session({ id = 's', start, end, pages = 10, newPages, duration, segments }) {
  return {
    id,
    bookId: 'b',
    startedAt: iso(start),
    finishedAt: iso(end),
    durationSeconds: duration ?? Math.round((end - start) / 1000),
    pagesRead: pages,
    newPages: newPages ?? pages,
    segments: segments ?? [{ start: iso(start), end: iso(end) }],
  };
}

test('maior resto: partes inteiras que somam o total', () => {
  assert.deepEqual(largestRemainder(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(largestRemainder(7, [3, 1]), [5, 2]);
  assert.deepEqual(largestRemainder(0, [1, 2]), [0, 0]);
  assert.equal(largestRemainder(101, [3, 7, 11, 13]).reduce((a, b) => a + b), 101);
});

test('sessão que atravessa a meia-noite é dividida pelo tempo de cada dia', () => {
  // 23:40 → 00:20: 20 min no dia 14 e 20 min no dia 15.
  const parts = allocateSession(session({ start: at(14, 23, 40), end: at(15, 0, 20), pages: 10 }));
  assert.deepEqual(
    parts.map((p) => [p.dateKey, p.seconds, p.pages]),
    [
      ['2026-10-14', 1200, 5],
      ['2026-10-15', 1200, 5],
    ],
  );
});

test('pausas (lacunas entre intervalos) não entram em dia nenhum', () => {
  const s = session({
    start: at(14, 23, 0),
    end: at(15, 1, 0),
    pages: 12,
    duration: 1800,
    segments: [
      { start: iso(at(14, 23, 0)), end: iso(at(14, 23, 10)) }, // 10 min no dia 14
      { start: iso(at(15, 0, 40)), end: iso(at(15, 1, 0)) }, // 20 min no dia 15 (pausa de 1h30 no meio)
    ],
  });
  const parts = allocateSession(s);
  assert.deepEqual(parts.map((p) => [p.dateKey, p.seconds, p.pages]), [
    ['2026-10-14', 600, 4],
    ['2026-10-15', 1200, 8],
  ]);
});

test('duração reduzida ao salvar é aplicada proporcionalmente', () => {
  // Cronômetro marcou 60 min (30 + 30), usuário registrou 30 min.
  const s = session({ start: at(14, 23, 30), end: at(15, 0, 30), pages: 20, duration: 1800 });
  const parts = allocateSession(s);
  assert.deepEqual(parts.map((p) => p.seconds), [900, 900]);
  assert.equal(parts.reduce((t, p) => t + p.pages, 0), 20);
});

test('dados ausentes: sem intervalos usa início + duração; sem duração fica no dia do início', () => {
  const noSegments = { ...session({ start: at(14, 23, 50), end: at(15, 0, 10), pages: 4 }), segments: undefined };
  assert.deepEqual(allocateSession(noSegments).map((p) => [p.dateKey, p.seconds]), [
    ['2026-10-14', 600],
    ['2026-10-15', 600],
  ]);
  const zero = { ...session({ start: at(14, 22), end: at(14, 22), pages: 6, duration: 0 }), segments: [] };
  assert.deepEqual(allocateSession(zero), [{ dateKey: '2026-10-14', seconds: 0, pages: 6, newPages: 6 }]);
});

test('livro-razão: sessão conta no dia em que começou; totais batem', () => {
  const ledger = buildLedger([
    session({ id: 'a', start: at(14, 23, 40), end: at(15, 0, 20), pages: 10 }),
    session({ id: 'b', start: at(15, 8), end: at(15, 8, 30), pages: 15, newPages: 5 }),
  ]);
  assert.equal(ledger.get('2026-10-14').sessions, 1);
  assert.equal(ledger.get('2026-10-15').sessions, 1);
  assert.equal(ledger.get('2026-10-15').seconds, 1200 + 1800);
  const total = summarizeRange(ledger, at(14, 0), at(16, 0));
  assert.equal(total.pages, 25);
  assert.equal(total.newPages, 15, 'páginas novas (10 + 5) ≠ páginas registradas (25)');
  assert.equal(total.days.length, 2);
});

test('períodos: limites meio-abertos e semana configurável', () => {
  const wed = at(14, 15); // quarta-feira
  const week = getPeriodRange('week', wed);
  assert.equal(toDateKey(week.start), '2026-10-12', 'segunda');
  assert.equal(toDateKey(week.end), '2026-10-19', 'fim exclusivo');
  assert.equal(toDateKey(startOfWeek(wed, 'sunday')), '2026-10-11');
  const month = getPeriodRange('month', wed);
  assert.equal(toDateKey(month.start), '2026-10-01');
  assert.equal(toDateKey(month.end), '2026-11-01');
  assert.equal(toDateKey(shiftPeriod(month, -1).start), '2026-09-01');
  // Sessão às 00:00 do dia 1 pertence ao novo mês, não ao anterior.
  const ledger = buildLedger([session({ start: new Date(2026, 10, 1, 0, 0), end: new Date(2026, 10, 1, 0, 30), pages: 3 })]);
  assert.equal(summarizeRange(ledger, month.start, month.end).pages, 0);
});

test('comparação justa: mesmo número de dias decorridos', () => {
  const now = at(15, 10);
  const month = getPeriodRange('month', now);
  assert.equal(countElapsedDays(month, now), 15);
  const previous = getComparableRange(month, now);
  assert.equal(toDateKey(previous.start), '2026-09-01');
  assert.equal(toDateKey(previous.end), '2026-09-16', '1–15 de setembro');
  assert.equal(previous.partial, true);
  const closed = getComparableRange(getPeriodRange('month', new Date(2026, 8, 10)), now);
  assert.equal(closed.partial, false);
  assert.equal(toDateKey(closed.end), '2026-09-01', 'agosto inteiro');
  // Março (31 dias) × fevereiro (28): corta no tamanho do mês anterior.
  const march = getPeriodRange('month', new Date(2027, 2, 31, 12));
  const feb = getComparableRange(march, new Date(2027, 2, 31, 12));
  assert.equal(toDateKey(feb.end), '2027-03-01');
});
