import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildImportPlan, parseHistoryFile } from './historyImport.js';
import { createEmptyData } from '../storage/schema.js';
import { dataReducer, ACTIONS } from '../../context/dataReducer.js';
import { buildLedger, summarizeRange } from '../../utils/ledger.js';
import { getDashboardSummary } from '../../utils/stats.js';
import { evaluateAchievements } from '../../utils/achievements.js';
import { calculateElapsedSeconds } from '../../utils/duration.js';
import { formatSessionPeriod } from '../../utils/format.js';

// Histórico FICTÍCIO (mesmos casos que importam: meia-noite, duração anotada
// divergente, sessão fora de ordem, vocabulário, sem total de páginas).
const TEXT = readFileSync(new URL('./fixtures/historico-exemplo.json', import.meta.url), 'utf8');
const NOW = new Date('2026-10-17T12:00:00-03:00');
const GUARANI = 'O Guarani';
const SENHORA = 'Senhora';
// Testes de dia/horário de exibição dependem do fuso local da máquina.
const BRASILIA = new Date('2026-08-16T12:00:00Z').getTimezoneOffset() === 180;
const choices = { 0: { mode: 'new', totalPages: '300' }, 1: { mode: 'new', totalPages: '250' } };

function importInto(state, year = 2026) {
  const file = parseHistoryFile(TEXT).data;
  const plan = buildImportPlan(file, { year, books: state.books, sessions: state.sessions, choices, now: NOW });
  assert.equal(plan.ready, true, plan.errors.join('\n'));
  const next = dataReducer(state, { type: ACTIONS.ADD_SESSIONS, payload: { books: plan.newBooks, sessions: plan.sessions, now: NOW } });
  return { plan, next };
}

test('arquivo do histórico: 2 livros, 8 sessões', () => {
  const parsed = parseHistoryFile(TEXT);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.books[0].sessions.length, 6);
  assert.equal(parsed.data.books[1].sessions.length, 2);
  assert.equal(parseHistoryFile('{"format":"outro"}').ok, false);
  assert.equal(parseHistoryFile('não é json').ok, false);
});

test('pré-visualização: contagens, divergências e nada gravado (cancelar)', () => {
  const state = createEmptyData();
  const file = parseHistoryFile(TEXT).data;
  const plan = buildImportPlan(file, { year: 2026, books: [], sessions: [], choices, now: NOW });
  assert.equal(plan.ready, true);
  assert.equal(plan.counts.booksToCreate, 2);
  assert.equal(plan.counts.sessions, 8);
  assert.equal(plan.counts.sessionsWithNotes, 5);
  assert.equal(plan.counts.vocabularyEntries, 6);
  assert.equal(plan.counts.duplicates, 0);
  // Construir o plano não altera o estado: cancelar = simplesmente não confirmar.
  assert.deepEqual(state.sessions, []);
  // Sem total de páginas (não está nas anotações): pronto, com o total "não informado".
  const missing = buildImportPlan(file, { year: 2026, books: [], sessions: [], now: NOW });
  assert.equal(missing.ready, true, missing.errors.join('\n'));
  assert.equal(missing.counts.sessions, 8);
  assert.equal(missing.counts.booksToCreate, 2);
  assert.deepEqual(missing.newBooks.map((b) => b.totalPages), [null, null], 'nenhum total inventado');
  // Total inválido bloqueia (só o livro com erro fica fora de newBooks).
  const bad = buildImportPlan(file, { year: 2026, books: [], sessions: [], choices: { 0: { mode: 'new', totalPages: 'abc' } }, now: NOW });
  assert.equal(bad.ready, false);
  assert.equal(bad.newBooks.length, 1);
  // Total menor que a última página anotada é recusado.
  const small = buildImportPlan(file, { year: 2026, books: [], sessions: [], choices: { 0: { mode: 'new', totalPages: '50' }, 1: { mode: 'new', totalPages: '250' } }, now: NOW });
  assert.match(small.errors[0], /pelo menos 80/);
  // Ano no futuro (datas depois de hoje) também é recusado.
  assert.equal(buildImportPlan(file, { year: 2027, books: [], sessions: [], choices, now: NOW }).ready, false);
});

test('importa as 8 sessões preservando datas, páginas, duração anotada e notas', () => {
  const { plan, next } = importInto(createEmptyData());
  assert.equal(next.books.length, 2);
  assert.equal(next.sessions.length, 8);
  const guarani = next.books.find((b) => b.title === GUARANI);
  const senhora = next.books.find((b) => b.title === SENHORA);
  assert.equal(next.sessions.filter((s) => s.bookId === guarani.id).length, 6);
  assert.equal(next.sessions.filter((s) => s.bookId === senhora.id).length, 2);
  assert.ok(next.sessions.every((s) => s.source === 'manual'));

  // Livros: "Lendo", página atual = maior página anotada, sem conclusão inventada.
  assert.equal(guarani.status, 'reading');
  assert.equal(guarani.currentPage, 80);
  assert.equal(guarani.finishedAt, null);
  assert.equal(senhora.status, 'reading', 'o segundo livro NÃO é marcado como concluído');
  assert.equal(senhora.currentPage, 100);
  assert.equal(new Date(guarani.startedAt).toISOString(), new Date('2026-05-03T19:00:00-03:00').toISOString());

  // Sessão 1: 03/05 19:00–19:15, p. 1–10, 15:00.
  const s1 = next.sessions.find((s) => s.bookId === guarani.id && s.startPage === 1);
  assert.equal(s1.startedAt, new Date('2026-05-03T19:00:00-03:00').toISOString());
  assert.equal(s1.finishedAt, new Date('2026-05-03T19:15:00-03:00').toISOString());
  assert.equal(s1.durationSeconds, 900);
  assert.equal(s1.pagesRead, 10, 'p. 1–10 = 10 páginas (intervalo inclusivo)');
  assert.equal(s1.notes, '');
  assert.deepEqual(s1.vocabulary, []);

  // Duração anotada preservada mesmo divergindo dos horários (19:10–19:22 = 12 min; anotado 13:40).
  const s2 = next.sessions.find((s) => s.bookId === guarani.id && s.startPage === 11);
  assert.equal(s2.durationSeconds, 13 * 60 + 40);
  assert.equal(calculateElapsedSeconds(s2.startedAt, s2.finishedAt), 12 * 60);
  assert.equal(s2.vocabulary.length, 2);
  assert.equal(s2.vocabulary[1].term, 'Paquete');
  assert.equal(s2.vocabulary[1].meaning, 'Navio que levava passageiros e correspondência.');
  assert.ok(plan.divergences.some((d) => d.label === '04/05 · p. 11–20'));

  // Meia-noite: 04/05 23:30 → 05/05 00:25 (55 min calculados; 55:10 anotado).
  const s5 = next.sessions.find((s) => s.bookId === guarani.id && s.startPage === 37);
  assert.equal(calculateElapsedSeconds(s5.startedAt, s5.finishedAt), 55 * 60);
  assert.equal(s5.durationSeconds, 55 * 60 + 10);
  assert.equal(s5.vocabulary.length, 3);

  // Senhora, sessão 2: 11/05 23:10 → 12/05 01:20 (2h10min) — data final explícita.
  const m2 = next.sessions.find((s) => s.bookId === senhora.id && s.startPage === 41);
  assert.equal(calculateElapsedSeconds(m2.startedAt, m2.finishedAt), 2 * 3600 + 10 * 60);
  assert.equal(m2.durationSeconds, 2 * 3600 + 10 * 60, 'valor anotado (2:10:00) preservado');
  assert.ok(m2.finishedAt > m2.startedAt, 'nunca duração negativa');
});

test('importar de novo não duplica nada', () => {
  const { next } = importInto(createEmptyData());
  const file = parseHistoryFile(TEXT).data;
  const again = buildImportPlan(file, { year: 2026, books: next.books, sessions: next.sessions, now: NOW });
  assert.equal(again.ready, true, 'livros encontrados pelo título, sem pedir total de novo');
  assert.equal(again.counts.booksToCreate, 0);
  assert.equal(again.counts.sessions, 0);
  assert.equal(again.counts.duplicates, 8);
  const after = dataReducer(next, { type: ACTIONS.ADD_SESSIONS, payload: { books: again.newBooks, sessions: again.sessions, now: NOW } });
  assert.equal(after, next, 'estado idêntico');
  // Outro ano é outra leitura (instantes diferentes) — não é tratado como duplicata.
  const otherYear = buildImportPlan(file, { year: 2025, books: next.books, sessions: next.sessions, now: NOW });
  assert.equal(otherYear.counts.sessions, 8);
});

test('estatísticas depois da importação: sem dupla contagem, sem somar duração calculada', () => {
  const { next } = importInto(createEmptyData());
  const ledger = buildLedger(next.sessions);
  const summary = getDashboardSummary({ books: next.books, sessions: next.sessions, goals: null, ledger }, NOW);
  // Páginas: 1–80 contínuas + 5–100 contínuas = 80 + 96.
  assert.equal(summary.totals.pages, 80 + 96);
  assert.equal(summary.totals.newPages, 80 + 96, 'nenhuma página contada duas vezes (sessão 4 fora de ordem incluída)');
  const recorded = next.sessions.reduce((t, s) => t + s.durationSeconds, 0);
  assert.equal(summary.totals.seconds, recorded, 'tempo = soma das durações ANOTADAS');
  assert.equal(summary.totals.sessions, 8);
  assert.equal(summary.counts.finished, 0, 'nenhum livro concluído inventado');

  // Meia-noite: a duração é repartida pelo relógio real, sem duplicar.
  // (Dias no fuso local da máquina; as asserções por dia valem no horário de Brasília.)
  const may4 = summarizeRange(ledger, new Date(2026, 4, 4), new Date(2026, 4, 5));
  const may5 = summarizeRange(ledger, new Date(2026, 4, 5), new Date(2026, 4, 6));
  const s5 = next.sessions.find((s) => s.startPage === 37);
  const session6 = 12 * 60;
  const day4Own = 13 * 60 + 40 + 14 * 60 + 10 * 60;
  if (BRASILIA) {
    assert.equal(may4.seconds + may5.seconds, day4Own + s5.durationSeconds + session6, 'soma dos dois dias = durações anotadas');
    assert.equal(may4.sessions, 4, 'a sessão da meia-noite conta no dia em que começou');
    assert.ok(may5.seconds > session6, 'parte depois da meia-noite fica em 05/05 (regra existente: tempo pelo relógio real)');
  }

  // Conquistas: nenhuma de livro concluído; datas reais das leituras.
  const achievements = evaluateAchievements({ books: next.books, sessions: next.sessions, now: NOW });
  assert.equal(achievements.find((a) => a.id === 'first-book').unlocked, false);
  assert.equal(achievements.find((a) => a.id === 'first-session').unlockedAt, new Date('2026-05-03T19:15:00-03:00').toISOString());
});

test('exibição: sessões que passam da meia-noite mostram as duas datas', { skip: !BRASILIA && 'máquina fora do horário de Brasília' }, () => {
  const { next } = importInto(createEmptyData());
  const s5 = next.sessions.find((s) => s.startPage === 37);
  assert.match(formatSessionPeriod(s5), /^23:30 → 05\/05 00:25$/);
  const s1 = next.sessions.find((s) => s.startPage === 1);
  assert.equal(formatSessionPeriod(s1), '19:00–19:15');
});

test('importação sem informar totais: livros com total "não informado", página atual preservada, normalização e banco', async () => {
  const { dataReducer: reduce, ACTIONS: A } = await import('../../context/dataReducer.js');
  const { normalizeData } = await import('../storage/schema.js');
  const { bookToRow, rowToBook } = await import('../supabase/mappers.js');
  const { getBookProgress } = await import('../../utils/stats.js');
  const file = parseHistoryFile(TEXT).data;
  const plan = buildImportPlan(file, { year: 2026, books: [], sessions: [], now: NOW });
  const next = reduce(createEmptyData(), { type: A.ADD_SESSIONS, payload: { books: plan.newBooks, sessions: plan.sessions, now: NOW } });
  const { data } = normalizeData(next);
  const guarani = data.books.find((b) => b.title === GUARANI);
  const senhora = data.books.find((b) => b.title === SENHORA);
  assert.equal(guarani.totalPages, null);
  assert.equal(guarani.currentPage, 80, 'não vira página 1 nem 0');
  assert.equal(senhora.currentPage, 100);
  assert.equal(senhora.status, 'reading');
  assert.equal(getBookProgress(guarani), 0, 'sem total, sem percentual inventado');
  assert.equal(data.sessions.length, 8);
  const row = bookToRow(guarani, 'u1');
  assert.equal(row.total_pages, null);
  assert.equal(rowToBook(row).currentPage, 80);
});
