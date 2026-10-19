import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absoluteUrl, buildPaths, joinPath, routePath, routerBasename, safeNextPath } from './paths.js';

test('caminhos das telas dentro de /app e /demo', () => {
  const app = buildPaths('/app');
  assert.equal(app.dashboard, '/app');
  assert.equal(app.library, '/app/biblioteca');
  assert.equal(app.book('b1'), '/app/livros/b1');
  assert.equal(app.editBook('b1'), '/app/livros/b1/editar');
  assert.equal(buildPaths('/demo').statistics, '/demo/estatisticas');
  assert.equal(joinPath('', '/metas'), '/metas');
  assert.equal(routePath('/livros/:bookId'), 'livros/:bookId');
});

test('?next= só volta para dentro da área pessoal (sem redirecionamento aberto)', () => {
  assert.equal(safeNextPath('/app/metas'), '/app/metas');
  assert.equal(safeNextPath('/app?x=1'), '/app?x=1');
  assert.equal(safeNextPath('/app'), '/app');
  for (const bad of ['https://evil.example', '//evil.example', '/application', '/demo', '/app\\evil', null, undefined, '/app/https://x']) {
    assert.equal(safeNextPath(bad), '/app', String(bad));
  }
});

test('endereços absolutos para os links de e-mail respeitam o caminho de publicação', () => {
  assert.equal(absoluteUrl('/reset-password', { origin: 'https://ana.github.io', base: '/readtrack/' }), 'https://ana.github.io/readtrack/reset-password');
  assert.equal(absoluteUrl('/app', { origin: 'https://readtrack.example', base: '/' }), 'https://readtrack.example/app');
  assert.equal(routerBasename('/readtrack/'), '/readtrack');
  assert.equal(routerBasename('/'), '/');
});
