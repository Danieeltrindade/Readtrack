/**
 * Conversão entre os objetos do app (camelCase, como no localStorage) e as
 * linhas das tabelas do Supabase (snake_case). Funções puras.
 *
 * O formato do app não muda: reducer, estatísticas e telas continuam
 * trabalhando exatamente com os mesmos objetos de antes.
 */
import { DEFAULT_GOALS, normalizeGoals } from '../../utils/goals.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../utils/settings.js';

export const TABLES = Object.freeze({
  profiles: 'profiles',
  books: 'books',
  sessions: 'reading_sessions',
  activeSessions: 'active_sessions',
  achievements: 'achievements',
});

const orNull = (value) => (value === undefined || value === '' ? null : value);

/**
 * Datas de criação/atualização só são enviadas quando existem; se faltarem,
 * o banco usa o padrão (now()). O repositório grava com defaultToNull: false.
 */
function timestamps({ createdAt, updatedAt }) {
  const out = {};
  if (createdAt) out.created_at = createdAt;
  if (updatedAt) out.updated_at = updatedAt;
  return out;
}

/* ---------- Livros ---------- */

export function bookToRow(book, userId) {
  return {
    user_id: userId,
    id: book.id,
    title: book.title,
    author: book.author ?? '',
    description: book.description ?? '',
    cover_url: book.coverUrl ?? '',
    cover_color: orNull(book.coverColor),
    total_pages: book.totalPages ?? null,
    added_as_read: Boolean(book.addedAsRead),
    content_start_page: book.contentStartPage ?? null,
    current_page: book.currentPage,
    status: book.status,
    started_at: orNull(book.startedAt),
    finished_at: orNull(book.finishedAt),
    rating: book.rating ?? null,
    review: book.review ?? '',
    learnings: book.learnings ?? '',
    is_demo: Boolean(book.isDemo),
    ...timestamps(book),
  };
}

export function rowToBook(row) {
  const book = {
    id: row.id,
    title: row.title,
    author: row.author ?? '',
    description: row.description ?? '',
    coverUrl: row.cover_url ?? '',
    totalPages: row.total_pages ?? null,
    addedAsRead: Boolean(row.added_as_read),
    contentStartPage: row.content_start_page ?? null,
    currentPage: row.current_page,
    status: row.status,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    rating: row.rating ?? null,
    review: row.review ?? '',
    learnings: row.learnings ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDemo: Boolean(row.is_demo),
  };
  if (row.cover_color) book.coverColor = row.cover_color;
  return book;
}

/* ---------- Sessões ---------- */

export function sessionToRow(session, userId) {
  return {
    user_id: userId,
    id: session.id,
    book_id: session.bookId,
    started_at: session.startedAt,
    finished_at: session.finishedAt ?? null,
    duration_seconds: session.durationSeconds ?? null,
    source: session.source === 'manual' ? 'manual' : 'timer',
    vocabulary: Array.isArray(session.vocabulary) ? session.vocabulary : [],
    paused_seconds: session.pausedSeconds ?? 0,
    pause_count: session.pauseCount ?? 0,
    segments: Array.isArray(session.segments) ? session.segments : [],
    start_page: session.startPage,
    end_page: session.endPage,
    pages_read: session.pagesRead,
    new_pages: session.newPages ?? 0,
    notes: session.notes ?? '',
    is_demo: Boolean(session.isDemo),
    ...timestamps({ createdAt: session.createdAt }),
  };
}

export function rowToSession(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    durationSeconds: row.duration_seconds ?? null,
    source: row.source === 'manual' ? 'manual' : 'timer',
    vocabulary: Array.isArray(row.vocabulary) ? row.vocabulary : [],
    pausedSeconds: row.paused_seconds ?? 0,
    pauseCount: row.pause_count ?? 0,
    segments: Array.isArray(row.segments) ? row.segments : [],
    startPage: row.start_page,
    endPage: row.end_page,
    pagesRead: row.pages_read,
    newPages: row.new_pages ?? 0,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    isDemo: Boolean(row.is_demo),
  };
}

/* ---------- Cronômetro em andamento ---------- */

export function activeSessionToRow(active, userId) {
  return { user_id: userId, id: active.id, book_id: active.bookId, state: active };
}

export function rowToActiveSession(row) {
  if (!row?.state || typeof row.state !== 'object') return null;
  return { ...row.state, id: row.id, bookId: row.book_id };
}

/* ---------- Conquistas ---------- */

export const achievementToRow = (a, userId) => ({ user_id: userId, achievement_id: a.id, unlocked_at: a.unlockedAt });
export const rowToAchievement = (row) => ({ id: row.achievement_id, unlockedAt: row.unlocked_at });

/* ---------- Perfil: nome, preferências e metas ---------- */

export function profileToRow({ settings, goals }, userId) {
  const s = normalizeSettings(settings);
  const g = normalizeGoals(goals);
  return {
    id: userId,
    display_name: s.userName,
    week_starts_on: s.weekStartsOn,
    text_size: s.textSize,
    motion: s.motion,
    daily_minutes_goal: g.dailyMinutes,
    weekly_pages_goal: g.weeklyPages,
  };
}

export function rowToProfile(row) {
  if (!row) return { settings: { ...DEFAULT_SETTINGS }, goals: { ...DEFAULT_GOALS } };
  return {
    settings: normalizeSettings({
      userName: row.display_name,
      weekStartsOn: row.week_starts_on,
      textSize: row.text_size,
      motion: row.motion,
    }),
    goals: normalizeGoals({ dailyMinutes: row.daily_minutes_goal, weeklyPages: row.weekly_pages_goal }),
  };
}
