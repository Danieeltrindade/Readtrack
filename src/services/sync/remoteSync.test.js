import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_STATE, createRemoteSync } from './remoteSync.js';
import { createEmptyData } from '../storage/schema.js';

/** Relógio manual: os timers só disparam quando o teste manda. */
function createManualTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) {
      seq += 1;
      pending.set(seq, { fn, ms });
      return seq;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    async runAll() {
      const jobs = [...pending.entries()];
      pending.clear();
      for (const [, job] of jobs) job.fn();
      await new Promise((resolve) => setImmediate(resolve));
    },
    delays: () => [...pending.values()].map((j) => j.ms),
  };
}

/** Repositório falso: registra cada envio e pode falhar sob comando. */
function createFakeRepository() {
  const calls = [];
  let failures = [];
  return {
    calls,
    failNext(...errors) {
      failures = errors;
    },
    async applyChanges(userId, changes) {
      if (failures.length) throw failures.shift();
      calls.push({ userId, changes });
    },
  };
}

const withBook = (data, book) => ({ ...data, books: [...data.books, book] });
const book = (id, extra = {}) => ({ id, title: id, totalPages: 10, currentPage: 0, ...extra });

test('agrupa mudanças seguidas num único envio', async () => {
  const timers = createManualTimers();
  const repo = createFakeRepository();
  const initial = createEmptyData();
  const sync = createRemoteSync({ repository: repo, userId: 'u1', initialData: initial, timers });

  const a = withBook(initial, book('b1'));
  const b = withBook(a, book('b2'));
  sync.push(a);
  sync.push(b);
  assert.equal(sync.getStatus().state, SYNC_STATE.PENDING);
  await timers.runAll();

  assert.equal(repo.calls.length, 1);
  assert.deepEqual(repo.calls[0].changes.books.upsert.map((x) => x.id), ['b1', 'b2']);
  assert.equal(sync.getStatus().state, SYNC_STATE.IDLE);
  assert.equal(sync.hasPendingChanges(), false);
});

test('falha de rede: mantém as mudanças, tenta de novo e não duplica', async () => {
  const timers = createManualTimers();
  const repo = createFakeRepository();
  const initial = createEmptyData();
  const statuses = [];
  const sync = createRemoteSync({
    repository: repo,
    userId: 'u1',
    initialData: initial,
    timers,
    onStatusChange: (s) => statuses.push(s.state),
    retryDelays: [111, 222],
  });

  repo.failNext(Object.assign(new Error('offline'), { kind: 'network' }));
  sync.push(withBook(initial, book('b1')));
  await timers.runAll();
  assert.equal(sync.getStatus().state, SYNC_STATE.ERROR);
  assert.equal(sync.hasPendingChanges(), true);
  assert.deepEqual(timers.delays(), [111], 'agenda nova tentativa');

  await timers.runAll();
  assert.equal(repo.calls.length, 1, 'enviado uma única vez com sucesso');
  assert.equal(sync.getStatus().state, SYNC_STATE.IDLE);
  assert.ok(statuses.includes(SYNC_STATE.ERROR));
});

test('mudança durante o envio é enviada depois, calculada sobre o que foi confirmado', async () => {
  const timers = createManualTimers();
  const initial = createEmptyData();
  let release;
  const calls = [];
  const repo = {
    applyChanges: (_u, changes) => {
      calls.push(changes);
      if (calls.length === 1) return new Promise((resolve) => (release = resolve));
      return Promise.resolve();
    },
  };
  const sync = createRemoteSync({ repository: repo, userId: 'u1', initialData: initial, timers });
  const a = withBook(initial, book('b1'));
  sync.push(a);
  await timers.runAll(); // primeiro envio em andamento
  const b = { ...a, books: [{ ...a.books[0], currentPage: 4 }] };
  sync.push(b);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  await timers.runAll();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].books.upsert[0].currentPage, 4);
  assert.equal(calls[1].books.upsert.length, 1);
});

test('flushNow envia na hora; sessão expirada não fica tentando sozinha', async () => {
  const timers = createManualTimers();
  const repo = createFakeRepository();
  const initial = createEmptyData();
  const sync = createRemoteSync({ repository: repo, userId: 'u1', initialData: initial, timers });

  sync.push(withBook(initial, book('b1')));
  assert.equal(await sync.flushNow(), true);
  assert.equal(repo.calls.length, 1);

  repo.failNext(Object.assign(new Error('jwt expired'), { kind: 'auth' }));
  sync.push(withBook(sync.getLatest(), book('b2')));
  assert.equal(await sync.flushNow(), false);
  assert.equal(sync.getStatus().state, SYNC_STATE.ERROR);
  assert.deepEqual(timers.delays(), [], 'sem nova tentativa automática');
  assert.equal(await sync.retry(), true);
  assert.equal(repo.calls.length, 2);
});

test('reset (dados relidos do banco) não gera envio', async () => {
  const timers = createManualTimers();
  const repo = createFakeRepository();
  const sync = createRemoteSync({ repository: repo, userId: 'u1', initialData: createEmptyData(), timers });
  const fromServer = withBook(createEmptyData(), book('b9'));
  sync.reset(fromServer);
  sync.push(fromServer);
  await timers.runAll();
  assert.equal(repo.calls.length, 0);
});
