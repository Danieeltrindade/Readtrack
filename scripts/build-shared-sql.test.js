import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSharedSchema, staleSharedFiles, toSharedSchema } from './build-shared-sql.mjs';

const schemaSql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('versão compartilhada não toca no schema public', () => {
  const sql = buildSharedSchema(schemaSql);
  assert.doesNotMatch(sql, /\bpublic\./, 'nenhuma referência a public.<objeto>');
  assert.match(sql, /create schema if not exists readtrack;/);
  assert.match(sql, /create table if not exists readtrack\.books/);
  assert.match(sql, /create or replace function readtrack\.import_backup\(/);
});

test('gatilho de cadastro com nome próprio (não substitui o do outro app)', () => {
  const sql = buildSharedSchema(schemaSql);
  assert.doesNotMatch(sql, /drop trigger if exists on_auth_user_created\b/);
  assert.doesNotMatch(sql, /create trigger on_auth_user_created\b/);
  assert.match(sql, /drop trigger if exists readtrack_on_auth_user_created on auth\.users;/);
  assert.match(sql, /create trigger readtrack_on_auth_user_created\s+after insert on auth\.users\s+for each row execute function readtrack\.handle_new_user\(\);/);
});

test('o papel PUBLIC do Postgres não é confundido com o schema', () => {
  const out = toSharedSchema('revoke all on function public.f() from public, anon;');
  assert.equal(out, 'revoke all on function readtrack.f() from public, anon;');
});

test('arquivos de supabase/compartilhado estão atualizados', () => {
  assert.deepEqual(staleSharedFiles(), [], 'rode npm run sql:compartilhado');
});
