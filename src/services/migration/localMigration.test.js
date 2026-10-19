import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMigrationPayload, migrateLocalData, summarizeLocalData } from './localMigration.js';
import { createRepository } from '../supabase/repository.js';
import { createFakeSupabase } from '../supabase/fakeSupabase.test-helper.js';
import { createEmptyData } from '../storage/schema.js';
import { createDemoData } from '../../data/demoData.js';

const USER = 'user-a';

function localData() {
  const data = { ...createEmptyData(), ...createDemoData(new Date('2026-10-01T12:00:00Z')) };
  data.books.push({
    id: 'book_real',
    title: 'Meu livro',
    author: 'Eu',
    totalPages: 200,
    currentPage: 40,
    status: 'reading',
    startedAt: '2026-09-01T10:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    isDemo: false,
  });
  data.sessions.push({
    id: 'session_real',
    bookId: 'book_real',
    startedAt: '2026-09-02T09:00:00.000Z',
    finishedAt: '2026-09-02T10:00:00.000Z',
    durationSeconds: 3600,
    pausedSeconds: 0,
    pauseCount: 0,
    segments: [],
    startPage: 0,
    endPage: 40,
    pagesRead: 40,
    newPages: 40,
    notes: 'ótimo começo',
    isDemo: false,
  });
  data.goals = { dailyMinutes: 45, weeklyPages: 150 };
  return data;
}

test('demonstração não é migrada; registros reais sim', () => {
  const payload = buildMigrationPayload(localData());
  assert.deepEqual(payload.books.map((b) => b.id), ['book_real']);
  assert.deepEqual(payload.sessions.map((s) => s.id), ['session_real']);
  const summary = summarizeLocalData(localData());
  assert.equal(summary.books, 1);
  assert.ok(summary.demoItems > 0);
  assert.equal(summary.hasCustomPreferences, true);
  assert.equal(summary.isEmpty, false);
  assert.equal(summarizeLocalData(null).isEmpty, true);
  assert.equal(summarizeLocalData({ ...createEmptyData(), ...createDemoData() }).isEmpty, true, 'só demonstração = nada a migrar');
});

test('migra, confere no banco e não duplica ao repetir', async () => {
  const client = createFakeSupabase();
  const repo = createRepository(client);

  const first = await migrateLocalData({ repository: repo, userId: USER, localData: localData(), includePreferences: true });
  assert.equal(first.ok, true);
  assert.equal(first.verified, true);
  assert.deepEqual(first.counts.books, { total: 1, inserted: 1, alreadyExisted: 0 });
  assert.deepEqual(first.counts.sessions, { total: 1, inserted: 1, alreadyExisted: 0 });
  assert.equal(client.rows('reading_sessions')[0].notes, 'ótimo começo');
  assert.equal(client.rows('profiles')[0].daily_minutes_goal, 45);

  const second = await migrateLocalData({ repository: repo, userId: USER, localData: localData() });
  assert.equal(second.ok, true);
  assert.deepEqual(second.counts.books, { total: 1, inserted: 0, alreadyExisted: 1 });
  assert.equal(client.rows('books').length, 1, 'nenhum livro duplicado');
  assert.equal(client.rows('reading_sessions').length, 1, 'nenhuma sessão duplicada');
});

test('falha num livro: as sessões dele não são enviadas e a migração não é dada como concluída', async () => {
  const client = createFakeSupabase();
  const repo = createRepository(client);
  client.setFailure((state) =>
    state.op === 'upsert' && state.table === 'books' ? { code: '23514', message: 'violates check constraint' } : null,
  );
  const result = await migrateLocalData({ repository: repo, userId: USER, localData: localData() });
  assert.equal(result.ok, false);
  assert.ok(result.failed.some((f) => f.id === 'book_real'));
  assert.ok(result.failed.some((f) => f.id === 'session_real'));
  assert.equal(client.rows('reading_sessions').length, 0);
});

test('sem conexão: a migração lança erro (nada é marcado como concluído)', async () => {
  const client = createFakeSupabase();
  const repo = createRepository(client);
  client.setFailure({ message: 'Failed to fetch' });
  await assert.rejects(() => migrateLocalData({ repository: repo, userId: USER, localData: localData() }), /conexão/);
});
