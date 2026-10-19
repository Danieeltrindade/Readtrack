import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuthLinkError } from './linkErrors.js';

test('link de e-mail expirado vira mensagem clara', () => {
  const error = readAuthLinkError({ search: '', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' });
  assert.equal(error.code, 'otp_expired');
  assert.match(error.message, /expirou ou já foi usado/);
  assert.equal(readAuthLinkError({ search: '?next=/app', hash: '' }), null);
  assert.equal(readAuthLinkError({ search: '', hash: '#access_token=abc&type=recovery' }), null);
});
