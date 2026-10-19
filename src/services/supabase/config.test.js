import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSupabaseConfig } from './config.js';

const jwt = (payload) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'assinatura'].join('.');

const URL_OK = 'https://abcd.supabase.co';

test('sem variáveis: modo local, sem erro', () => {
  assert.deepEqual(readSupabaseConfig({}), { configured: false, url: null, key: null, problem: null });
});

test('aceita a chave publishable e a anon (JWT com role anon)', () => {
  const a = readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123' });
  assert.equal(a.configured, true);
  assert.equal(a.url, URL_OK);
  const b = readSupabaseConfig({ VITE_SUPABASE_URL: `${URL_OK}/`, VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) });
  assert.equal(b.configured, true);
  assert.equal(b.url, URL_OK, 'barra final removida');
});

test('recusa a chave service_role e a secret, mesmo informadas por engano', () => {
  const serviceRole = readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) });
  assert.equal(serviceRole.configured, false);
  assert.match(serviceRole.problem, /secreta/);
  const secret = readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_xyz' });
  assert.equal(secret.configured, false);
  assert.match(secret.problem, /secreta/);
});

test('recusa chave que não parece pública', () => {
  const r = readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'qualquer-coisa' });
  assert.equal(r.configured, false);
  assert.ok(r.problem);
});

test('exige https, exceto em localhost', () => {
  const key = 'sb_publishable_abc';
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://abcd.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key }).configured, false);
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: key }).configured, true);
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'não é url', VITE_SUPABASE_PUBLISHABLE_KEY: key }).configured, false);
});

test('variável faltando gera mensagem específica', () => {
  assert.match(readSupabaseConfig({ VITE_SUPABASE_URL: URL_OK }).problem, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(readSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).problem, /VITE_SUPABASE_URL/);
});
