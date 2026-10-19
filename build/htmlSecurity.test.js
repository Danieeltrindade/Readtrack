import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContentSecurityPolicy, normalizeBasePath, supabaseOrigins } from './htmlSecurity.js';

test('CSP libera só o próprio site, as fontes do Google e o Supabase configurado', () => {
  const csp = buildContentSecurityPolicy({ supabaseUrl: 'https://abcd.supabase.co' });
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/, 'sem scripts de terceiros nem inline');
  assert.match(csp, /connect-src 'self' https:\/\/abcd\.supabase\.co wss:\/\/abcd\.supabase\.co/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(buildContentSecurityPolicy({}), /connect-src 'self' https:\/\/\*\.supabase\.co/);
  assert.equal(supabaseOrigins('não é url'), null);
});

test('caminho base da publicação', () => {
  assert.equal(normalizeBasePath(undefined), '/');
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('/readtrack'), '/readtrack/');
  assert.equal(normalizeBasePath('readtrack/'), '/readtrack/');
  assert.equal(normalizeBasePath('/'), '/');
});
