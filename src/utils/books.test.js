import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStatusChange, bookToFormValues, createBook, queryLibrary, updateBook } from './books.js';
import { validateBookForm } from './validation.js';

const NOW = new Date(2026, 9, 15, 10, 0);

function form(overrides = {}) {
  return {
    title: '  Vidas Secas ',
    author: 'Graciliano Ramos',
    totalPages: '176',
    currentPage: '0',
    status: 'want-to-read',
    startedAt: '',
    finishedAt: '',
    coverUrl: '',
    description: '',
    ...overrides,
  };
}

test('formulário válido gera livro com campos obrigatórios', () => {
  const { valid, data } = validateBookForm(form(), NOW);
  assert.ok(valid);
  const book = createBook(data, { id: 'b1', now: NOW });
  assert.equal(book.title, 'Vidas Secas');
  assert.equal(book.totalPages, 176);
  assert.equal(book.startedAt, null);
  assert.equal(book.finishedAt, null);
  assert.equal(book.createdAt, NOW.toISOString());
  assert.ok(book.coverColor.startsWith('#'));
});

test('valores inválidos são recusados com mensagem por campo', () => {
  const { valid, errors } = validateBookForm(
    form({ title: ' ', author: '', totalPages: '0', currentPage: '5.5', coverUrl: 'ftp://x' }),
    NOW,
  );
  assert.equal(valid, false);
  assert.deepEqual(Object.keys(errors).sort(), ['author', 'coverUrl', 'currentPage', 'title', 'totalPages']);
  assert.match(validateBookForm(form({ totalPages: '100', currentPage: '150' }), NOW).errors.currentPage, /100/);
  assert.match(validateBookForm(form({ totalPages: '-3' }), NOW).errors.totalPages, /maior que zero/);
});

test('datas: futuro e conclusão antes do início são recusados', () => {
  const future = validateBookForm(form({ status: 'reading', startedAt: '2026-12-01' }), NOW);
  assert.match(future.errors.startedAt, /futuro/);
  const reversed = validateBookForm(
    form({ status: 'finished', startedAt: '2026-10-10', finishedAt: '2026-10-01' }),
    NOW,
  );
  assert.match(reversed.errors.finishedAt, /antes do início/);
  assert.match(validateBookForm(form({ status: 'finished' }), NOW).errors.finishedAt, /terminou/);
  assert.match(validateBookForm(form({ status: 'reading', startedAt: '2026-02-30' }), NOW).errors.startedAt, /inválida/);
});

test('livro concluído fica com 100% e data de conclusão', () => {
  const { data } = validateBookForm(form({ status: 'finished', currentPage: '3', finishedAt: '2026-10-14' }), NOW);
  const book = createBook(data, { id: 'b1', now: NOW });
  assert.equal(book.currentPage, 176);
  assert.ok(book.finishedAt.startsWith('2026-10-14'));
  assert.ok(book.startedAt, 'início preenchido');
});

test('livro sem capa é aceito; capa por URL ou imagem enviada também', () => {
  assert.ok(validateBookForm(form({ coverUrl: '' }), NOW).valid);
  assert.ok(validateBookForm(form({ coverUrl: 'https://exemplo.com/capa.jpg' }), NOW).valid);
  assert.ok(validateBookForm(form({ coverUrl: 'data:image/jpeg;base64,AAAA' }), NOW).valid);
});

test('mudanças de status mantêm datas e páginas coerentes', () => {
  const base = createBook(validateBookForm(form({ status: 'reading', currentPage: '40' }), NOW).data, { id: 'b', now: NOW });
  const finished = applyStatusChange(base, 'finished', NOW);
  assert.equal(finished.currentPage, 176);
  assert.equal(finished.finishedAt, NOW.toISOString());
  const reopened = applyStatusChange(finished, 'reading', NOW);
  assert.equal(reopened.finishedAt, null);
  assert.equal(reopened.startedAt, base.startedAt, 'início preservado');
  const wish = applyStatusChange(createBook(validateBookForm(form(), NOW).data, { id: 'c', now: NOW }), 'reading', NOW);
  assert.equal(wish.startedAt, NOW.toISOString());
});

test('edição preserva id, data de cadastro e campos extras', () => {
  const book = { ...createBook(validateBookForm(form(), NOW).data, { id: 'b', now: NOW }), rating: 5 };
  const later = new Date(2026, 9, 16);
  const values = { ...bookToFormValues(book), title: 'Vidas Secas (ed. comentada)' };
  const updated = updateBook(book, validateBookForm(values, later).data, later);
  assert.equal(updated.id, 'b');
  assert.equal(updated.createdAt, book.createdAt);
  assert.equal(updated.rating, 5);
  assert.equal(updated.title, 'Vidas Secas (ed. comentada)');
});

test('pesquisa ignora acentos e maiúsculas, em título e autor', () => {
  const books = [
    { id: '1', title: 'Memórias Póstumas', author: 'Machado de Assis', status: 'reading' },
    { id: '2', title: 'O Cortiço', author: 'Aluísio Azevedo', status: 'finished' },
    { id: '3', title: 'Dom Casmurro', author: 'Machado de Assis', status: 'finished' },
  ];
  assert.deepEqual(queryLibrary(books, { query: 'MEMORIAS' }).books.map((b) => b.id), ['1']);
  assert.deepEqual(queryLibrary(books, { query: 'aluisio' }).books.map((b) => b.id), ['2']);
  const machado = queryLibrary(books, { query: 'machado', status: 'finished', sort: 'titulo' });
  assert.deepEqual(machado.books.map((b) => b.id), ['3']);
  assert.deepEqual(machado.counts, { all: 2, reading: 1, finished: 1, 'want-to-read': 0 });
  assert.deepEqual(queryLibrary(books, { sort: 'titulo' }).books.map((b) => b.id), ['3', '1', '2']);
});

test('avaliação final e comentário: opcionais, nota de 1 a 5 e ida e volta pelo formulário', () => {
  const base = { title: 'Livro', author: 'Autora', totalPages: '100', currentPage: '0', status: 'want-to-read' };
  const none = validateBookForm({ ...base, rating: '', review: '' });
  assert.equal(none.valid, true);
  assert.equal(none.data.rating, null);

  const rated = validateBookForm({ ...base, rating: '4', review: '  Gostei muito.  ' });
  assert.equal(rated.valid, true);
  assert.equal(rated.data.rating, 4);
  assert.equal(rated.data.review, 'Gostei muito.');

  assert.equal(validateBookForm({ ...base, rating: '6' }).errors.rating, 'Escolha uma nota de 1 a 5.');
  assert.ok(validateBookForm({ ...base, review: 'x'.repeat(2001) }).errors.review);

  const book = createBook(rated.data, { id: 'b1', now: new Date('2026-10-01T12:00:00Z') });
  assert.equal(book.rating, 4);
  assert.equal(bookToFormValues(book).rating, '4');
  const edited = updateBook(book, { ...rated.data, rating: null, review: '' }, new Date('2026-10-02T12:00:00Z'));
  assert.equal(edited.rating, null);
  assert.equal(edited.review, '');
});
