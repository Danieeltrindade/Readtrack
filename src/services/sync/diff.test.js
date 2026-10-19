import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffData, isEmptyDiff } from './diff.js';
import { createEmptyData } from '../storage/schema.js';

const base = () => {
  const data = createEmptyData();
  data.books = [
    { id: 'b1', title: 'A', totalPages: 10, currentPage: 0 },
    { id: 'b2', title: 'B', totalPages: 10, currentPage: 0 },
  ];
  data.sessions = [{ id: 's1', bookId: 'b1', startPage: 0, endPage: 5 }];
  return data;
};

test('estado igual não gera operações', () => {
  const a = base();
  assert.equal(isEmptyDiff(diffData(a, a)), true);
  // Objetos novos com o mesmo conteúdo (ex.: após recarregar) também não.
  assert.equal(isEmptyDiff(diffData(a, structuredClone(a))), true);
});

test('detecta inclusão, alteração e exclusão', () => {
  const a = base();
  const b = {
    ...a,
    books: [{ ...a.books[0], currentPage: 5 }, { id: 'b3', title: 'C', totalPages: 1, currentPage: 0 }],
    sessions: [],
  };
  const changes = diffData(a, b);
  assert.deepEqual(changes.books.upsert.map((x) => x.id), ['b1', 'b3']);
  assert.deepEqual(changes.books.remove, ['b2']);
  assert.deepEqual(changes.sessions.remove, ['s1']);
  assert.equal(changes.profile, undefined);
});

test('preferências ou metas alteradas atualizam o perfil', () => {
  const a = base();
  const b = { ...a, goals: { ...a.goals, dailyMinutes: 45 } };
  assert.deepEqual(diffData(a, b).profile.goals.dailyMinutes, 45);
});

test('cronômetro: undefined = sem mudança, objeto = gravar, null = apagar', () => {
  const a = base();
  assert.equal(diffData(a, { ...a }).activeSession, undefined);
  const active = { id: 's9', bookId: 'b1', status: 'running', segments: [] };
  const b = { ...a, activeSession: active };
  assert.equal(diffData(a, b).activeSession, active);
  assert.equal(diffData(b, a).activeSession, null);
});

test('sem estado anterior (primeiro envio), tudo é enviado', () => {
  const a = base();
  const changes = diffData(null, a);
  assert.equal(changes.books.upsert.length, 2);
  assert.ok(changes.profile);
});
