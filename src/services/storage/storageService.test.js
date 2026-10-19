import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_PREFIX,
  LOAD_STATUS,
  STORAGE_KEY,
  __setStorageForTests,
  listBackups,
  loadData,
  saveData,
} from './storageService.js';
import { createEmptyData, SCHEMA_VERSION } from './schema.js';

/** localStorage falso, em memória. */
function createMemoryStorage({ failWrites = false } = {}) {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (failWrites && k === STORAGE_KEY) {
        const error = new Error('cheio');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

let storage;
beforeEach(() => {
  storage = createMemoryStorage();
  __setStorageForTests(storage);
});

test('primeira visita retorna status EMPTY', () => {
  assert.equal(loadData().status, LOAD_STATUS.EMPTY);
});

test('salva e lê os mesmos dados', () => {
  const data = createEmptyData();
  data.books.push({ id: 'b1', title: 'Livro', author: 'A', totalPages: 100, currentPage: 10, status: 'reading' });
  assert.deepEqual(saveData(data), { ok: true });
  const result = loadData();
  assert.equal(result.status, LOAD_STATUS.OK);
  assert.equal(result.data.books[0].title, 'Livro');
});

test('JSON corrompido gera backup e não é perdido', () => {
  storage.setItem(STORAGE_KEY, '{quebrado');
  const result = loadData();
  assert.equal(result.status, LOAD_STATUS.CORRUPTED);
  assert.equal(listBackups().length, 1);
  assert.equal(storage.getItem(listBackups()[0]), '{quebrado');
  assert.ok(listBackups()[0].startsWith(BACKUP_PREFIX));
});

test('itens inválidos são descartados individualmente', () => {
  const data = createEmptyData();
  data.books = [
    { id: 'ok', title: 'Válido', author: 'X', totalPages: 50, currentPage: 0, status: 'reading' },
    { id: 'sem-titulo', title: '   ', totalPages: 10 },
  ];
  data.sessions = [
    { id: 's1', bookId: 'ok', startedAt: '2026-10-01T20:00:00Z', startPage: 0, endPage: 10, durationSeconds: 600 },
    { id: 's2', bookId: 'inexistente', startedAt: '2026-10-01T20:00:00Z', startPage: 0, endPage: 5 },
  ];
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
  const result = loadData();
  assert.equal(result.status, LOAD_STATUS.RECOVERED);
  assert.equal(result.data.books.length, 1);
  assert.equal(result.data.sessions.length, 1);
  assert.equal(result.data.sessions[0].pagesRead, 10);
  assert.equal(listBackups().length, 1);
});

test('dados de versão futura não são sobrescritos', () => {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION + 1, books: [] }));
  assert.equal(loadData().status, LOAD_STATUS.NEWER_VERSION);
});

test('campos desconhecidos são preservados', () => {
  const data = { ...createEmptyData(), campoFuturo: 'manter' };
  saveData(data);
  assert.equal(loadData().data.campoFuturo, 'manter');
});

test('falha de cota vira mensagem, não exceção', () => {
  __setStorageForTests(createMemoryStorage({ failWrites: true }));
  const result = saveData(createEmptyData());
  assert.equal(result.ok, false);
  assert.match(result.error, /espaço/);
});

test('armazenamento indisponível', () => {
  __setStorageForTests(null);
  assert.equal(loadData().status, LOAD_STATUS.UNAVAILABLE);
  assert.equal(saveData(createEmptyData()).ok, false);
});

test('cópia dos dados atuais antes de operações destrutivas', async () => {
  const { backupCurrentData, deleteBackups } = await import('./storageService.js');
  assert.equal(backupCurrentData(), null, 'nada salvo, nada copiado');
  saveData(createEmptyData());
  const key = backupCurrentData();
  assert.ok(key.startsWith(BACKUP_PREFIX));
  assert.equal(JSON.parse(storage.getItem(key)).version, SCHEMA_VERSION);
  assert.equal(deleteBackups(), 1);
  assert.equal(listBackups().length, 0);
});
