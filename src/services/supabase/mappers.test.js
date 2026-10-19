import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeSessionToRow,
  bookToRow,
  profileToRow,
  rowToActiveSession,
  rowToBook,
  rowToProfile,
  rowToSession,
  sessionToRow,
} from './mappers.js';
import { createActiveSession } from '../../utils/timer.js';

const USER = '11111111-1111-4111-8111-111111111111';

const book = {
  id: 'book_1',
  title: 'Vidas Secas',
  author: 'Graciliano Ramos',
  description: '',
  coverUrl: '',
  coverColor: '#36575C',
  totalPages: 176,
  currentPage: 176,
  status: 'finished',
  startedAt: '2026-09-01T12:00:00.000Z',
  finishedAt: '2026-09-20T12:00:00.000Z',
  rating: 5,
  review: 'Seco e enorme.',
  learnings: 'A linguagem também pode ser seca.',
  addedAsRead: false,
  contentStartPage: 9,
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-09-20T12:00:00.000Z',
  isDemo: false,
};

test('livro: ida e volta preserva todos os campos (inclusive avaliação e comentário)', () => {
  const row = bookToRow(book, USER);
  assert.equal(row.user_id, USER);
  assert.equal(row.total_pages, 176);
  assert.equal(row.rating, 5);
  assert.equal(row.review, 'Seco e enorme.');
  assert.deepEqual(rowToBook(row), book);
});

test('livro sem datas de criação/atualização não envia null (o banco usa o padrão)', () => {
  const row = bookToRow({ ...book, createdAt: undefined, updatedAt: undefined }, USER);
  assert.equal('created_at' in row, false);
  assert.equal('updated_at' in row, false);
});

test('sessão: ida e volta preserva páginas, duração, intervalos e observação', () => {
  const session = {
    id: 'session_1',
    bookId: 'book_1',
    startedAt: '2026-09-02T22:00:00.000Z',
    finishedAt: '2026-09-02T23:10:00.000Z',
    durationSeconds: 3600,
    pausedSeconds: 600,
    pauseCount: 1,
    segments: [
      { start: '2026-09-02T22:00:00.000Z', end: '2026-09-02T22:30:00.000Z' },
      { start: '2026-09-02T22:40:00.000Z', end: '2026-09-02T23:10:00.000Z' },
    ],
    startPage: 10,
    endPage: 42,
    pagesRead: 32,
    newPages: 32,
    notes: 'Capítulo da cachorra Baleia.',
    vocabulary: [{ term: 'Alpercata', meaning: 'Sandália de couro.' }],
    source: 'timer',
    createdAt: '2026-09-02T23:10:00.000Z',
    isDemo: false,
  };
  const row = sessionToRow(session, USER);
  assert.equal(row.pages_read, row.end_page - row.start_page);
  assert.equal(row.notes, 'Capítulo da cachorra Baleia.');
  assert.deepEqual(rowToSession(row), session);
});

test('cronômetro em andamento: o estado inteiro vai num jsonb', () => {
  const active = createActiveSession({ id: 'session_9', bookId: 'book_1', startPage: 3, now: new Date('2026-10-01T10:00:00Z') });
  const row = activeSessionToRow(active, USER);
  assert.equal(row.book_id, 'book_1');
  assert.deepEqual(rowToActiveSession(row), active);
  assert.equal(rowToActiveSession(null), null);
});

test('perfil: preferências e metas, com valores padrão se não houver linha', () => {
  const row = profileToRow(
    { settings: { userName: ' Ana ', weekStartsOn: 'sunday', textSize: 'large', motion: 'reduce' }, goals: { dailyMinutes: null, weeklyPages: 300 } },
    USER,
  );
  assert.deepEqual(row, {
    id: USER,
    display_name: 'Ana',
    week_starts_on: 'sunday',
    text_size: 'large',
    motion: 'reduce',
    daily_minutes_goal: null,
    weekly_pages_goal: 300,
  });
  const back = rowToProfile(row);
  assert.equal(back.settings.userName, 'Ana');
  assert.equal(back.goals.dailyMinutes, null, 'meta desligada continua desligada');
  assert.equal(rowToProfile(null).goals.weeklyPages, 150);
});

test('sessão manual: duração e término desconhecidos ficam null (nada inventado)', () => {
  const manual = {
    id: 'm1',
    bookId: 'book_1',
    startedAt: '2026-08-16T23:27:00.000-03:00',
    finishedAt: null,
    durationSeconds: null,
    pausedSeconds: 0,
    pauseCount: 0,
    segments: [],
    startPage: 34,
    endPage: 64,
    pagesRead: 31,
    newPages: 31,
    notes: '',
    vocabulary: [],
    source: 'manual',
    createdAt: '2026-10-17T10:00:00.000Z',
    isDemo: false,
  };
  const row = sessionToRow(manual, USER);
  assert.equal(row.duration_seconds, null);
  assert.equal(row.finished_at, null);
  assert.equal(row.source, 'manual');
  assert.equal(rowToSession(row).durationSeconds, null);
});
