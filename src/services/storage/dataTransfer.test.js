import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExportPayload, exportFileName, parseImportText } from './dataTransfer.js';
import { createEmptyData, SCHEMA_VERSION } from './schema.js';
import { createDemoData } from '../../data/demoData.js';

const NOW = new Date(2026, 9, 15, 10);

function demoState() {
  return { ...createEmptyData(), ...createDemoData(NOW) };
}

test('exportar e importar de volta preserva tudo', () => {
  const state = demoState();
  const text = JSON.stringify(createExportPayload(state, NOW));
  const result = parseImportText(text);
  assert.equal(result.ok, true);
  assert.equal(result.data.books.length, 3);
  assert.equal(result.data.sessions.length, 25);
  assert.deepEqual(result.data.sessions[0], state.sessions[0]);
  assert.equal(result.summary.finished, 2);
  assert.equal(exportFileName(NOW), 'readtrack-backup-2026-10-15.json');
});

test('aceita a cópia crua do armazenamento (sem envelope)', () => {
  assert.equal(parseImportText(JSON.stringify(demoState())).ok, true);
});

test('dados da etapa 1 (v1) são migrados na importação', () => {
  const v1 = {
    version: 1,
    books: [{ id: 'b', title: 'Antigo', author: 'A', totalPages: 100, currentPage: 30, status: 'reading' }],
    sessions: [{ id: 's', bookId: 'b', startedAt: '2026-10-01T20:00:00Z', endedAt: '2026-10-01T20:30:00Z', startPage: 0, endPage: 30, durationSeconds: 1800 }],
  };
  const result = parseImportText(JSON.stringify(v1));
  assert.equal(result.ok, true);
  assert.equal(result.data.version, SCHEMA_VERSION);
  assert.equal(result.data.sessions[0].finishedAt, '2026-10-01T20:30:00.000Z');
});

test('rejeita arquivos inválidos com mensagem clara', () => {
  const cases = [
    ['', /vazio/],
    ['{oops', /JSON válido/],
    ['[1,2,3]', /não é um backup/],
    ['{"format":"outro-app","data":{}}', /não é um backup/],
    ['{"books":"x","sessions":[]}', /faltam as listas/],
    [JSON.stringify({ ...demoState(), version: SCHEMA_VERSION + 1 }), /versão mais nova/],
    ['x'.repeat(5 * 1024 * 1024 + 1), /5 MB/],
  ];
  for (const [text, message] of cases) {
    const result = parseImportText(text);
    assert.equal(result.ok, false, text.slice(0, 30));
    assert.match(result.error, message);
  }
});

test('rejeita tudo se houver um único registro inválido (nada é descartado em silêncio)', () => {
  const state = demoState();
  state.sessions.push({ id: 'orfa', bookId: 'nao-existe', startedAt: NOW.toISOString(), startPage: 0, endPage: 5 });
  const result = parseImportText(JSON.stringify(state));
  assert.equal(result.ok, false);
  assert.match(result.details.join(' '), /1 sessão/);

  const noTitle = demoState();
  noTitle.books[0] = { ...noTitle.books[0], title: '' };
  assert.equal(parseImportText(JSON.stringify(noTitle)).ok, false);
});

test('rejeita ids repetidos', () => {
  const state = demoState();
  state.books.push({ ...state.books[0] });
  const result = parseImportText(JSON.stringify(state));
  assert.equal(result.ok, false);
  assert.match(result.details[0], /id repetido/);
});

/* ---------- 1.4: backup do histórico anotado e importação que só acrescenta ---------- */
// Usa o histórico FICTÍCIO de exemplo (nenhum dado pessoal no repositório).
import { readFileSync as readText } from 'node:fs';
import { planBackupMerge } from './dataTransfer.js';
import { dataReducer as reduceData, ACTIONS as DATA_ACTIONS } from '../../context/dataReducer.js';
import { buildImportPlan, parseHistoryFile } from '../historyImport/historyImport.js';

const HISTORY_TEXT = readText(new URL('../historyImport/fixtures/historico-exemplo.json', import.meta.url), 'utf8');
const HISTORY_SOURCE = JSON.parse(HISTORY_TEXT);

/** Mesmo caminho do script scripts/build-history-backup.mjs: histórico → backup. */
function historyBackupText() {
  const now = new Date('2026-10-17T12:00:00-03:00');
  const plan = buildImportPlan(parseHistoryFile(HISTORY_TEXT).data, { year: 2026, books: [], sessions: [], now });
  const state = reduceData(createEmptyData(), { type: DATA_ACTIONS.ADD_SESSIONS, payload: { books: plan.newBooks, sessions: plan.sessions, now } });
  return JSON.stringify(createExportPayload(state, now));
}
const HISTORY_BACKUP = historyBackupText();

test('backup do histórico: passa no validador do "Importar JSON" e preserva tudo do arquivo original', () => {
  const result = parseImportText(HISTORY_BACKUP);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.summary.books, 2);
  assert.equal(result.summary.sessions, 8);
  const { books, sessions } = result.data;
  for (const book of books) {
    assert.equal(book.totalPages, null, 'total não inventado');
    assert.equal(book.author, '', 'autor não inventado');
    assert.equal(book.finishedAt, null, 'conclusão não inventada');
    assert.equal(book.status, 'reading');
  }
  const toSeconds = (t) => t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
  let compared = 0;
  for (const rawBook of HISTORY_SOURCE.books) {
    const book = books.find((b) => b.title === rawBook.title);
    for (const raw of rawBook.sessions) {
      const s = sessions.find((x) => x.bookId === book.id && x.startPage === raw.firstPage && x.endPage === raw.lastPage);
      assert.ok(s, `${rawBook.title} ${raw.date} p. ${raw.firstPage}–${raw.lastPage}`);
      assert.equal(s.durationSeconds, toSeconds(raw.duration), 'duração anotada');
      assert.equal(s.source, 'manual');
      assert.equal(s.notes, raw.notes);
      assert.deepEqual(s.vocabulary, raw.vocabulary);
      const [d, m] = raw.date.split('/');
      assert.equal(new Date(s.startedAt).toISOString(), new Date(`2026-${m}-${d}T${raw.start}:00-03:00`).toISOString());
      const [ed, em] = (raw.endDate ?? raw.date).split('/');
      assert.equal(new Date(s.finishedAt).toISOString(), new Date(`2026-${em}-${ed}T${raw.end}:00-03:00`).toISOString());
      compared += 1;
    }
  }
  assert.equal(compared, 8);
});

test('arquivo de histórico anotado no "Importar JSON": reconhecido e encaminhado (não é backup)', () => {
  const result = parseImportText(HISTORY_TEXT);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'history');
});

test('acrescentar backup: mantém tudo o que existe, entra só o novo e não duplica', () => {
  const current = createEmptyData();
  current.books = [{ id: 'meu', title: 'Meu livro', author: 'Eu', totalPages: 100, currentPage: 10, status: 'reading', createdAt: '2026-01-01T00:00:00Z' }];
  current.sessions = [{ id: 'minha', bookId: 'meu', startedAt: '2026-01-02T10:00:00Z', finishedAt: '2026-01-02T10:10:00Z', durationSeconds: 600, startPage: 0, endPage: 10, pagesRead: 10, newPages: 10 }];
  current.settings = { ...current.settings, userName: 'Ana' };
  const incoming = parseImportText(HISTORY_BACKUP).data;

  const plan = planBackupMerge(current, incoming);
  assert.deepEqual(plan.summary, { booksAdded: 2, booksExisting: 0, sessionsAdded: 8, sessionsSkipped: 0 });
  const NOW = new Date('2026-10-18T12:00:00-03:00');
  const next = reduceData(current, { type: DATA_ACTIONS.ADD_SESSIONS, payload: { books: plan.books, sessions: plan.sessions, now: NOW } });
  assert.equal(next.books.length, 3);
  assert.equal(next.sessions.length, 9);
  assert.deepEqual(next.books[0], current.books[0], 'livro atual intacto');
  assert.deepEqual(next.sessions.find((s) => s.id === 'minha'), current.sessions[0], 'sessão atual intacta');
  assert.equal(next.settings.userName, 'Ana', 'preferências não são trocadas');

  // De novo: nada novo.
  const again = planBackupMerge(next, incoming);
  assert.deepEqual(again.summary, { booksAdded: 0, booksExisting: 2, sessionsAdded: 0, sessionsSkipped: 8 });

  // Livro com o mesmo título criado à mão (outro id): as sessões vão para ele, sem livro repetido.
  const manual = createEmptyData();
  manual.books = [{ id: 'manual-guarani', title: 'o guarani', author: 'José de Alencar', totalPages: 300, currentPage: 0, status: 'want-to-read' }];
  const mapped = planBackupMerge(manual, incoming);
  assert.equal(mapped.summary.booksAdded, 1);
  assert.equal(mapped.sessions.filter((s) => s.bookId === 'manual-guarani').length, 6);
});

/* ---------- 1.6.0: a área pessoal nunca recebe dados de demonstração ---------- */
import { prepareForPersonalArea } from './dataTransfer.js';
import { createDemoWorkspaceData } from '../../demo/demoDataset.js';

test('backup com dados de exemplo antigos: os de demonstração são retirados e contados', () => {
  const state = demoState(); // 3 livros e 25 sessões com isDemo (versões antigas)
  state.books.push({ id: 'meu', title: 'Meu livro', author: 'Eu', totalPages: 100, currentPage: 10, status: 'reading' });
  state.sessions.push({ id: 'minha', bookId: 'meu', startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T10:10:00Z', durationSeconds: 600, startPage: 0, endPage: 10, pagesRead: 10, newPages: 10 });
  const parsed = parseImportText(JSON.stringify(createExportPayload(state, NOW)));
  const prepared = prepareForPersonalArea(parsed.data);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.data.books.map((b) => b.id), ['meu']);
  assert.deepEqual(prepared.data.sessions.map((s) => s.id), ['minha']);
  assert.equal(prepared.demoSkipped, 28);
});

test('arquivo salvo pela demonstração pública é recusado na área pessoal', () => {
  const demo = createDemoWorkspaceData(NOW);
  const parsed = parseImportText(JSON.stringify(createExportPayload(demo, NOW)));
  assert.equal(parsed.ok, true, 'é um arquivo válido...');
  const prepared = prepareForPersonalArea(parsed.data);
  assert.equal(prepared.ok, false, '...mas não entra na conta');
  assert.match(prepared.error, /demonstração/);
});
