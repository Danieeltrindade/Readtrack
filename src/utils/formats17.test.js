// 1.7.0 — formatos (físico, e-book/PDF, audiobook) e caderno de anotações.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeBookPosition,
  formatAudioPosition,
  getProgressKind,
  parseAudioPosition,
  parseHoursMinutes,
  reachesEnd,
  sumSecondsByFormat,
} from './formats.js';
import { validateBookForm, validateManualSession, validateSessionEdit, validateSessionForm } from './validation.js';
import { applyAddedSessions, applySessionChange, applySessionToBook, buildManualSession, buildSession } from './sessions.js';
import { createBook } from './books.js';
import { getBookProgress } from './stats.js';
import { buildLedger, summarizeRange } from './ledger.js';
import { buildNotebookEntry, collectNotebook, countByType, filterNotebook, notebookToMarkdown, parseAnchorText, toggleQuestionResolved } from './annotations.js';
import { flushNotebookPending } from '../components/notebook/notebookPending.js';
import { createActiveSession, reviewActiveSession } from './timer.js';
import { normalizeData } from '../services/storage/schema.js';

const NOW = new Date('2026-11-10T22:00:00Z');

test('posição no áudio: h:mm:ss, mm:ss e minutos', () => {
  assert.equal(parseAudioPosition('1:02:05'), 3725);
  assert.equal(parseAudioPosition('83:20'), 5000);
  assert.equal(parseAudioPosition('45'), 2700);
  assert.equal(parseAudioPosition(''), null);
  assert.ok(Number.isNaN(parseAudioPosition('1:75')));
  assert.ok(Number.isNaN(parseAudioPosition('abc')));
  assert.equal(formatAudioPosition(3725), '1:02:05');
  assert.equal(formatAudioPosition(125), '2:05');
  assert.equal(parseHoursMinutes('9', '30'), 34200);
  assert.equal(parseHoursMinutes('', ''), null);
  assert.ok(Number.isNaN(parseHoursMinutes('9', '75')));
});

test('livro: formato, tipo de progresso e livros antigos (padrão = físico por páginas)', () => {
  assert.equal(getProgressKind({}), 'pages');
  assert.equal(getProgressKind({ format: 'digital' }), 'pages');
  assert.equal(getProgressKind({ format: 'digital', progressMode: 'percent' }), 'percent');
  assert.equal(getProgressKind({ format: 'audio', progressMode: 'percent' }), 'audio');
  const { data } = normalizeData({ books: [{ id: 'b', title: 'Antigo', totalPages: 100, currentPage: 10, status: 'reading' }] });
  assert.equal(data.books[0].format, 'print');
  assert.equal(data.books[0].progressMode, 'pages');
  // Porcentagem só existe para e-book.
  assert.equal(normalizeData({ books: [{ id: 'b', title: 'X', format: 'print', progressMode: 'percent' }] }).data.books[0].progressMode, 'pages');
});

test('cadastro de audiobook: duração obrigatória; posição até a duração; sem páginas', () => {
  const base = { title: 'O Guarani', author: 'Alencar', status: 'reading', format: 'audio' };
  assert.ok(validateBookForm(base, NOW).errors.audioDuration, 'sem duração');
  const ok = validateBookForm({ ...base, audioHours: '14', audioMinutes: '20', audioPosition: '2:00:00', audioSpeed: '1.25', narrator: 'Ana' }, NOW);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.totalPages, null, 'total de páginas não é exigido nem inventado');
  assert.equal(ok.data.audioDurationSeconds, 51600);
  assert.equal(ok.data.audioPositionSeconds, 7200);
  assert.equal(ok.data.audioSpeed, 1.25);
  assert.ok(validateBookForm({ ...base, audioHours: '1', audioMinutes: '0', audioPosition: '2:00:00' }, NOW).errors.audioPosition);
  const book = createBook(ok.data, { id: 'a1', now: NOW });
  assert.equal(getBookProgress(book), 14);
  assert.equal(describeBookPosition(book), '2:00:00 de 14:20:00');
  // Concluído: posição vai para o fim.
  const done = validateBookForm({ ...base, status: 'finished', finishedAt: '2026-11-01', audioHours: '1', audioMinutes: '30' }, NOW);
  assert.equal(done.data.audioPositionSeconds, 5400);
});

test('cadastro de e-book por %: progresso 0–100, páginas impressas opcionais', () => {
  const base = { title: 'Senhora', author: 'Alencar', status: 'reading', format: 'digital', progressMode: 'percent' };
  const ok = validateBookForm({ ...base, progressPercent: '35' }, NOW);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.equal(ok.data.progressPercent, 35);
  assert.equal(ok.data.totalPages, null);
  assert.ok(validateBookForm({ ...base, progressPercent: '120' }, NOW).errors.progressPercent);
  assert.equal(getBookProgress(createBook(ok.data, { id: 'e', now: NOW })), 35);
  // PDF por páginas continua com as regras de páginas.
  assert.ok(validateBookForm({ title: 'PDF', author: 'X', status: 'reading', format: 'digital', progressMode: 'pages' }, NOW).errors.totalPages);
});

const audioBook = {
  id: 'a1', title: 'O Guarani', author: 'Alencar', format: 'audio', progressMode: 'pages', audioDurationSeconds: 3600,
  audioPositionSeconds: 600, totalPages: null, currentPage: 0, status: 'reading', startedAt: '2026-11-01T10:00:00Z',
};

test('sessão de audiobook pelo cronômetro: posição avança, sem páginas; fim do áudio conclui', () => {
  const active = reviewActiveSession(
    { ...createActiveSession({ id: 's1', bookId: 'a1', startPage: 0, now: new Date('2026-11-10T21:00:00Z') }), progressKind: 'audio', startPositionSeconds: 600 },
    new Date('2026-11-10T21:40:00Z'),
  );
  const bad = validateSessionForm({ startPosition: '10:00', endPosition: '5:00' }, { book: audioBook, measuredSeconds: 2400 });
  assert.ok(bad.errors.endPosition);
  assert.ok(validateSessionForm({ startPosition: '10:00', endPosition: '1:10:00' }, { book: audioBook, measuredSeconds: 2400 }).errors.endPosition, 'passa da duração');
  const form = validateSessionForm({ startPosition: '10:00', endPosition: '1:00:00', speed: '1.5', markFinished: true }, { book: audioBook, measuredSeconds: 2400 });
  assert.equal(form.valid, true, JSON.stringify(form.errors));
  assert.equal(form.data.markFinished, true, 'chegou ao fim do áudio');
  const session = buildSession(active, form.data, { book: audioBook, now: NOW });
  assert.equal(session.progressKind, 'audio');
  assert.deepEqual([session.startPage, session.endPage, session.pagesRead, session.newPages], [0, 0, 0, 0]);
  assert.equal(session.endPositionSeconds, 3600);
  const book = applySessionToBook(audioBook, session, { markFinished: true });
  assert.equal(book.status, 'finished');
  assert.equal(book.audioPositionSeconds, 3600);
  // Conta tempo, não páginas.
  const ledger = buildLedger([session]);
  const range = summarizeRange(ledger, new Date('2026-11-01'), new Date('2026-11-30'));
  assert.equal(range.pages, 0);
  assert.equal(range.seconds, 2400);
  assert.deepEqual(sumSecondsByFormat([session], [audioBook]), { print: 0, digital: 0, audio: 2400 });
});

test('sessão de e-book por %: avança a porcentagem; editar e excluir recalculam sem recuar demais', () => {
  const ebook = { id: 'e1', title: 'Senhora', format: 'digital', progressMode: 'percent', progressPercent: 20, totalPages: null, currentPage: 0, status: 'reading' };
  const form = validateManualSession(
    { bookId: 'e1', startDate: '2026-11-09', startTime: '13:00', endTime: '13:30', startPercent: '20', endPercent: '35', duration: '30' },
    { book: ebook, now: NOW },
  );
  assert.equal(form.valid, true, JSON.stringify(form.errors));
  const s1 = buildManualSession(form.data, { id: 'm1', now: NOW });
  assert.equal(s1.pagesRead, 0);
  let state = applyAddedSessions({ books: [ebook], sessions: [], added: [s1], now: NOW });
  assert.equal(state.books[0].progressPercent, 35);
  // Editar: 35 → 30.
  const edit = validateManualSession(
    { bookId: 'e1', startDate: '2026-11-09', startTime: '13:00', endTime: '13:30', startPercent: '20', endPercent: '30', duration: '30' },
    { book: state.books[0], sessions: state.sessions, editingId: 'm1', now: NOW },
  );
  const changed = applySessionChange({ book: state.books[0], sessions: state.sessions, change: { session: { ...s1, ...edit.data } }, now: NOW });
  assert.equal(changed.book.progressPercent, 30);
  // Excluir: volta para o início da sessão (20%), nunca para 0.
  const removed = applySessionChange({ book: changed.book, sessions: changed.sessions, change: { deleteId: 'm1' }, now: NOW });
  assert.equal(removed.book.progressPercent, 20);
  // % final menor que a inicial é recusada.
  assert.ok(validateSessionEdit({ startPercent: '50', endPercent: '40', durationMinutes: '30' }, { book: ebook, session: { ...s1, durationSeconds: 1800 }, measuredSeconds: 1800 }).errors.endPercent);
});

test('sessão de páginas continua igual (regras antigas preservadas)', () => {
  const book = { id: 'b', title: 'X', totalPages: 100, currentPage: 10, status: 'reading' };
  const form = validateSessionForm({ startPage: '10', endPage: '30' }, { book, measuredSeconds: 1200 });
  assert.equal(form.valid, true);
  assert.equal(form.data.progressKind, 'pages');
  assert.equal(form.data.pagesRead, 20);
  assert.equal(reachesEnd(book, { endPage: 100 }), true);
});

test('caderno: âncoras, anotações, filtros, dúvidas resolvidas e Markdown', () => {
  assert.deepEqual(parseAnchorText('p. 124', 'page'), { anchor: { kind: 'page', value: 124 } });
  assert.deepEqual(parseAnchorText('1:02:30', 'time'), { anchor: { kind: 'time', value: 3750 } });
  assert.deepEqual(parseAnchorText('45%', 'percent'), { anchor: { kind: 'percent', value: 45 } });
  assert.ok(parseAnchorText('abc', 'page').error);
  assert.ok(buildNotebookEntry('quote', { text: '' }, { anchorKind: 'page', id: 'x' }).error);
  const quote = buildNotebookEntry('quote', { text: 'A vida é uma ópera.', extra: 'Marcolini', anchorText: '133' }, { anchorKind: 'page', id: 'q1', now: NOW }).item;
  const question = buildNotebookEntry('question', { text: 'O narrador é confiável?' }, { anchorKind: 'page', id: 'd1', now: NOW }).item;
  const word = buildNotebookEntry('word', { text: 'Agregado', extra: 'Quem vive com a família', anchorText: '127' }, { anchorKind: 'page', id: 'w' }).item;
  assert.deepEqual(word, { term: 'Agregado', meaning: 'Quem vive com a família', anchor: { kind: 'page', value: 127 } });
  const book = { id: 'b', title: 'Dom Casmurro', author: 'Machado', format: 'print' };
  const session = { id: 's', bookId: 'b', startedAt: '2026-11-09T21:00:00Z', startPage: 118, endPage: 140, notes: 'Bentinho volta.', vocabulary: [word], annotations: [quote, question] };
  const entries = collectNotebook({ books: [book], sessions: [session] });
  assert.equal(entries.length, 4);
  assert.deepEqual(countByType(entries), { all: 4, summary: 1, quote: 1, word: 1, idea: 0, question: 1, open: 1 });
  assert.equal(filterNotebook(entries, { type: 'quote' }).length, 1);
  assert.equal(filterNotebook(entries, { query: 'opera' }).length, 0, 'busca exige o texto como está');
  assert.equal(filterNotebook(entries, { query: 'ópera' }).length, 1);
  const resolved = toggleQuestionResolved(session, 'd1');
  assert.equal(resolved.annotations.find((a) => a.id === 'd1').resolved, true);
  assert.equal(filterNotebook(collectNotebook({ books: [book], sessions: [resolved] }), { onlyOpen: true }).length, 0);
  const md = notebookToMarkdown(entries, { now: NOW });
  assert.match(md, /## Dom Casmurro — Machado/);
  assert.match(md, /> A vida é uma ópera\./);
  assert.match(md, /p\. 118–140/);
});

test('caderno: o que ficou digitado sem "Adicionar" entra ao salvar', () => {
  const value = { annotations: [], vocabulary: [], pending: { type: 'idea', text: '  Uma ideia  ', anchorText: '12' } };
  const { patch } = flushNotebookPending(value, 'page');
  assert.equal(patch.annotations.length, 1);
  assert.equal(patch.annotations[0].text, 'Uma ideia');
  assert.deepEqual(patch.annotations[0].anchor, { kind: 'page', value: 12 });
  assert.deepEqual(flushNotebookPending({ pending: { type: 'quote', text: '', anchorText: '3' } }, 'page'), { patch: {} });
  assert.ok(flushNotebookPending({ pending: { type: 'quote', text: 'x', anchorText: 'abc' } }, 'page').error);
});

test('normalização: anotações inválidas descartadas, ids repetidos ajustados, sem perder as válidas', () => {
  const { data } = normalizeData({
    books: [{ id: 'b', title: 'X', totalPages: 10 }],
    sessions: [
      {
        id: 's', bookId: 'b', startedAt: '2026-11-01T10:00:00Z', finishedAt: '2026-11-01T10:10:00Z', durationSeconds: 600, startPage: 0, endPage: 5,
        annotations: [{ id: 'a', type: 'quote', text: 'ok' }, { id: 'a', type: 'idea', text: 'dois' }, { type: 'xx', text: 'tipo inválido' }, { type: 'idea', text: '   ' }],
        mood: 'feliz',
      },
    ],
  });
  const s = data.sessions[0];
  assert.deepEqual(s.annotations.map((a) => a.id), ['a', 'a_2']);
  assert.equal(s.mood, null);
  assert.equal(s.progressKind, 'pages');
  assert.equal(s.pagesRead, 5);
});

test('Caderno: palavras repetidas viram um cartão só, com o histórico', async () => {
  const { groupWordEntries, buildGlossary, wordKey, countByType } = await import('./annotations.js');
  const book = { id: 'b', title: 'Livro' };
  const w = (key, text, note, date) => ({ key, type: 'word', text, note, date, book, bookId: 'b' });
  const entries = [
    w('3', 'Enlevado', '', '2026-10-20T08:00:00'),
    { key: 's', type: 'summary', text: 'Resumo', note: '', date: '2026-10-19T08:00:00', book, bookId: 'b' },
    w('2', 'Fitar', 'olhar fixamente', '2026-10-15T08:00:00'),
    w('1', 'enlevado ', 'encantado', '2026-10-08T08:00:00'),
  ];
  assert.equal(wordKey('  Eriçarem '), 'ericarem');
  const grouped = groupWordEntries(entries);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].history.length, 2);
  assert.equal(grouped[0].text, 'Enlevado');
  assert.equal(grouped[0].note, 'encantado', 'usa o significado mais recente que não está vazio');
  assert.equal(countByType(grouped).word, 2);
  assert.deepEqual(buildGlossary(grouped).map((g) => `${g.letter}:${g.words.map((x) => x.text).join(',')}`), ['E:Enlevado', 'F:Fitar']);
  assert.equal(entries.length, 4, 'não altera a lista original');
});
