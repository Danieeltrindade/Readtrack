import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoPersistence } from './demoPersistence.js';
import { createStorageArea, DEMO_STORAGE_KEY, STORAGE_KEY, __setStorageForTests } from '../storage/storageService.js';

function memoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

const area = () => createStorageArea({ key: DEMO_STORAGE_KEY, backupPrefix: 'readtrack:demo-backup:' });
const DAY1 = new Date(2026, 9, 19, 12, 0);
const DAY2 = new Date(2026, 9, 21, 12, 0);

test('primeira visita: cria os dados fictícios e grava só na área da demonstração', () => {
  const storage = memoryStorage();
  __setStorageForTests(storage);
  storage.setItem(STORAGE_KEY, '{"pessoal":true}');
  const p = createDemoPersistence({ area: area(), now: () => DAY1 });
  const boot = p.boot();
  assert.equal(boot.canPersist, true);
  assert.ok(boot.data.books.length > 0);
  assert.equal(p.save(boot.data).ok, true);
  assert.equal(storage.getItem(STORAGE_KEY), '{"pessoal":true}', 'dados pessoais intactos');
  assert.equal(JSON.parse(storage.getItem(DEMO_STORAGE_KEY)).meta.demoModified, false);
  assert.equal(p.backup(), null, 'a demonstração não cria cópias de segurança');
});

test('alterações do visitante ficam até restaurar; sem alterações, a demonstração é recriada no dia seguinte', () => {
  const storage = memoryStorage();
  __setStorageForTests(storage);
  const p1 = createDemoPersistence({ area: area(), now: () => DAY1 });
  const original = p1.boot().data;
  p1.save(original);
  // Outro dia, sem alterações: recriada com datas novas.
  const p2 = createDemoPersistence({ area: area(), now: () => DAY2 });
  const fresh = p2.boot().data;
  assert.notEqual(fresh.meta.demoLoadedAt, original.meta.demoLoadedAt);
  // O visitante altera algo (novo objeto de estado): fica marcado como alterado.
  const changed = { ...fresh, books: [...fresh.books, { id: 'book_x', title: 'Meu teste', status: 'reading', currentPage: 0, totalPages: 10 }] };
  p2.save(changed);
  assert.equal(JSON.parse(storage.getItem(DEMO_STORAGE_KEY)).meta.demoModified, true);
  // Volta em outro dia: as alterações continuam.
  const p3 = createDemoPersistence({ area: area(), now: () => new Date(2026, 9, 25, 9) });
  assert.ok(p3.boot().data.books.some((b) => b.id === 'book_x'));
  assert.equal(p3.isModified(), true);
  // Restaurar: dados originais, com datas de hoje, e de novo "sem alterações".
  const reset = p3.resetDemo();
  assert.ok(!reset.books.some((b) => b.id === 'book_x'));
  p3.save(reset);
  assert.equal(p3.isModified(), false);
  assert.equal(JSON.parse(storage.getItem(DEMO_STORAGE_KEY)).meta.demoModified, false);
});

test('armazenamento bloqueado: a demonstração funciona em memória e avisa', () => {
  __setStorageForTests(null);
  const p = createDemoPersistence({ area: area(), now: () => DAY1 });
  const boot = p.boot();
  assert.equal(boot.canPersist, false);
  assert.match(boot.message, /só até fechar a aba/);
  assert.ok(boot.data.sessions.length > 0);
});

test('arquivo da demonstração ilegível ou de outra versão: recriado, sem tocar no resto', () => {
  const storage = memoryStorage();
  __setStorageForTests(storage);
  storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ version: 2, books: [], sessions: [], meta: { workspace: 'demo', demoDatasetVersion: 0 } }));
  const p = createDemoPersistence({ area: area(), now: () => DAY1 });
  assert.ok(p.boot().data.books.length > 0);
});
