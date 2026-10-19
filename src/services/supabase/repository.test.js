import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRepository, toRepositoryError } from './repository.js';
import { createFakeSupabase } from './fakeSupabase.test-helper.js';
import { diffData } from '../sync/diff.js';
import { createEmptyData } from '../storage/schema.js';

const USER = 'user-a';
const book = (id, extra = {}) => ({
  id,
  title: `Livro ${id}`,
  author: 'X',
  totalPages: 100,
  currentPage: 0,
  status: 'want-to-read',
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

test('applyChanges grava e exclui sempre filtrando pelo usuário', async () => {
  const client = createFakeSupabase();
  const repo = createRepository(client);
  const empty = createEmptyData();
  const withBooks = { ...empty, books: [book('b1'), book('b2')] };
  await repo.applyChanges(USER, diffData(empty, withBooks));
  assert.equal(client.rows('books').length, 2);
  assert.ok(client.rows('books').every((r) => r.user_id === USER));

  await repo.applyChanges(USER, diffData(withBooks, { ...withBooks, books: [withBooks.books[0]] }));
  assert.deepEqual(client.rows('books').map((r) => r.id), ['b1']);

  const del = client.log.find((c) => c.op === 'delete' && c.table === 'books');
  assert.deepEqual(del.eqs, ['user_id'], 'exclusão filtra por user_id');
  const up = client.log.find((c) => c.op === 'upsert' && c.table === 'books');
  assert.equal(up.options.onConflict, 'user_id,id');
  assert.equal(up.options.defaultToNull, false);
});

test('loadAll devolve os dados no formato do app e lê em páginas', async () => {
  const client = createFakeSupabase({ pageLimit: 1000 });
  const repo = createRepository(client);
  const many = Array.from({ length: 1205 }, (_, i) => book(`b${String(i).padStart(4, '0')}`));
  await repo.applyChanges(USER, diffData(createEmptyData(), { ...createEmptyData(), books: many }));
  // Linha de outro usuário no mesmo banco falso: não pode aparecer.
  client.rows('books').push({ ...client.rows('books')[0], user_id: 'user-b', id: 'intruso' });

  const loaded = await repo.loadAll(USER);
  assert.equal(loaded.books.length, 1205, 'passou do limite de 1000 linhas por página');
  assert.equal(loaded.books.some((b) => b.id === 'intruso'), false);
  assert.equal(loaded.books[0].totalPages, 100);
  assert.equal(loaded.settings.weekStartsOn, 'monday');
  assert.equal(loaded.activeSession, null);
  const selects = client.log.filter((c) => c.op === 'select' && c.table === 'books');
  assert.equal(selects.length, 2);
});

test('insertMissing não sobrescreve registros existentes (ON CONFLICT DO NOTHING)', async () => {
  const client = createFakeSupabase();
  const repo = createRepository(client);
  await repo.applyChanges(USER, diffData(createEmptyData(), { ...createEmptyData(), books: [book('b1', { title: 'Editado na conta' })] }));
  await repo.insertMissing('books', USER, [book('b1', { title: 'Versão antiga local' }), book('b2')]);
  const titles = Object.fromEntries(client.rows('books').map((r) => [r.id, r.title]));
  assert.equal(titles.b1, 'Editado na conta');
  assert.equal(titles.b2, 'Livro b2');
});

test('insertMissing identifica item a item o registro recusado pelo banco', async () => {
  const client = createFakeSupabase();
  const repo = createRepository(client);
  client.setFailure((state) =>
    state.op === 'upsert' && state.payload.some((r) => r.id === 'ruim') ? { code: '23514', message: 'violates check constraint' } : null,
  );
  const { failed } = await repo.insertMissing('books', USER, [book('ok1'), book('ruim'), book('ok2')]);
  assert.deepEqual(failed.map((f) => f.id), ['ruim']);
  assert.match(failed[0].message, /regras/);
  assert.deepEqual(client.rows('books').map((r) => r.id).sort(), ['ok1', 'ok2']);
});

test('erros viram mensagens claras por tipo', () => {
  assert.equal(toRepositoryError(new TypeError('Failed to fetch')).kind, 'network');
  assert.equal(toRepositoryError({ code: 'PGRST301', message: 'JWT expired' }).kind, 'auth');
  assert.equal(toRepositoryError({ code: '42P01', message: 'relation does not exist' }).kind, 'schema');
  assert.equal(toRepositoryError({ code: 'PGRST205', message: 'not in schema cache' }).kind, 'schema');
  assert.equal(toRepositoryError({ code: '42501', message: 'row-level security' }).kind, 'permission');
  assert.match(toRepositoryError({ code: '42P01' }).message, /schema\.sql/);
});

test('importBackup: uma única chamada à função import_backup, com as linhas no formato do banco', async () => {
  const calls = [];
  const client = {
    from() {
      throw new Error('não deveria usar tabelas diretamente');
    },
    rpc(name, params) {
      calls.push({ name, params });
      return Promise.resolve({ data: { mode: params.p_mode, books: 1, sessions: 1, activeSession: 0 }, error: null });
    },
  };
  const repo = createRepository(client);
  const book = { id: 'b1', title: 'Livro', author: 'A', totalPages: 100, currentPage: 10, status: 'reading' };
  const session = { id: 's1', bookId: 'b1', startedAt: '2026-10-01T10:00:00Z', finishedAt: '2026-10-01T10:10:00Z', durationSeconds: 600, startPage: 0, endPage: 10, pagesRead: 10, newPages: 10 };
  const counts = await repo.importBackup('u1', { mode: 'replace', books: [book], sessions: [session], settings: { userName: 'Ana' }, goals: { dailyMinutes: 20, weeklyPages: 100 } });
  assert.deepEqual(counts, { books: 1, sessions: 1, activeSession: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'import_backup');
  assert.equal(calls[0].params.p_mode, 'replace');
  assert.equal(calls[0].params.p_books[0].total_pages, 100);
  assert.equal(calls[0].params.p_sessions[0].book_id, 'b1');
  assert.equal(calls[0].params.p_profile.daily_minutes_goal, 20);
  assert.equal(calls[0].params.p_active_session, null);
  // Erro do banco vira mensagem clara e nada mais é chamado.
  const failing = createRepository({ rpc: () => Promise.resolve({ data: null, error: { code: '23514', message: 'violates check constraint' } }) });
  await assert.rejects(() => failing.importBackup('u1', { mode: 'merge' }), /recusou dados fora das regras/);
  const missing = createRepository({ rpc: () => Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) });
  await assert.rejects(() => missing.importBackup('u1', { mode: 'merge' }), /schema\.sql/);
});
