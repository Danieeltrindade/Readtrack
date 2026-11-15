/**
 * Formato dos dados persistidos e regras de normalização/migração.
 *
 * Princípios:
 * - Nunca descartar silenciosamente o arquivo inteiro: itens inválidos são
 *   removidos individualmente e contados em `report.dropped`.
 * - Campos desconhecidos são preservados (compatibilidade com versões futuras).
 * - Cada mudança de formato ganha uma nova versão e uma função em MIGRATIONS.
 *
 * Histórico de versões:
 * - v1: formato inicial (etapa 1).
 * - v2: sessões trocam `endedAt` por `finishedAt` e ganham intervalos de
 *       leitura (segments), tempo pausado e páginas novas; livros ganham
 *       `description`; surge `activeSession` (cronômetro em andamento).
 *
 * Campos acrescentados depois, sempre com valor padrão (dados antigos
 * continuam válidos sem mudar a versão):
 * - 1.7.0: formato do livro (físico, e-book/PDF, audiobook) e progresso por
 *   porcentagem ou posição no áudio; anotações da sessão (citações, ideias,
 *   dúvidas), âncora nas palavras do vocabulário e "como foi" a sessão.
 */
import { BOOK_STATUSES, SESSION_MOODS } from '../../utils/validation.js';
import { toDate } from '../../utils/date.js';
import { isValidActiveSession } from '../../utils/timer.js';
import { DEFAULT_GOALS, normalizeGoals } from '../../utils/goals.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../utils/settings.js';
import { SESSION_SOURCES, countSessionPages } from '../../utils/pages.js';
import {
  MAX_AUDIO_SECONDS,
  PROGRESS_KINDS,
  clampPercent,
  getProgressKind,
  getSessionKind,
  normalizeFormat,
  normalizeSpeed,
} from '../../utils/formats.js';
import { normalizeAnchor, normalizeAnnotations } from '../../utils/annotations.js';

export { DEFAULT_GOALS, DEFAULT_SETTINGS };

export const SCHEMA_VERSION = 2;

export function createEmptyData() {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    books: [],
    sessions: [],
    activeSession: null,
    goals: { ...DEFAULT_GOALS },
    settings: { ...DEFAULT_SETTINGS },
    achievements: [],
    meta: { createdAt: now, updatedAt: now, demoLoadedAt: null },
  };
}

/**
 * Migrações: chave = versão de ORIGEM. Cada função recebe os dados nessa
 * versão e devolve na versão seguinte.
 */
const MIGRATIONS = {
  1: (data) => ({
    ...data,
    version: 2,
    activeSession: null,
    books: (Array.isArray(data.books) ? data.books : []).map((book) => ({
      description: '',
      ...book,
    })),
    sessions: (Array.isArray(data.sessions) ? data.sessions : []).map((session) => {
      const { endedAt, ...rest } = session ?? {};
      const finishedAt = rest.finishedAt ?? endedAt ?? null;
      return {
        ...rest,
        finishedAt,
        pausedSeconds: rest.pausedSeconds ?? 0,
        pauseCount: rest.pauseCount ?? 0,
        segments: rest.segments ?? (rest.startedAt && finishedAt ? [{ start: rest.startedAt, end: finishedAt }] : []),
      };
    }),
  }),
};

export function migrate(raw) {
  let data = raw;
  let version = Number(data.version) || 1;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`Migração ausente para a versão ${version}.`);
    data = step(data);
    version = data.version;
  }
  return data;
}

const isString = (v) => typeof v === 'string';
const toInt = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const toIsoOrNull = (v) => toDate(v)?.toISOString() ?? null;

function normalizeContentStart(value, totalPages) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isInteger(n) || n < 1) return null;
  return totalPages && n > totalPages ? null : n;
}

function normalizeBook(book) {
  if (!book || !isString(book.id) || !isString(book.title) || !book.title.trim()) return null;
  // Livro cadastrado como já lido (antes do ReadTrack): o total de páginas
  // é opcional e fica null quando não informado — nunca inventamos um número.
  // v1.4: o mesmo vale para livros com sessões importadas cujo total não estava
  // nas anotações — o total fica "não informado" até você preencher.
  const addedAsRead = Boolean(book.addedAsRead);
  const pagesUnknown = book.totalPages === null || book.totalPages === undefined || book.totalPages === '';
  const totalPages = pagesUnknown ? null : Math.max(1, toInt(book.totalPages, 1));
  const status = addedAsRead ? 'finished' : BOOK_STATUSES.includes(book.status) ? book.status : 'want-to-read';
  const ownPage = Math.max(0, toInt(book.currentPage));
  return {
    ...book,
    title: book.title.trim(),
    author: isString(book.author) ? book.author.trim() : '',
    description: isString(book.description) ? book.description : '',
    coverUrl: isString(book.coverUrl) ? book.coverUrl : '',
    totalPages,
    currentPage:
      status === 'finished'
        ? (totalPages ?? (addedAsRead ? 0 : ownPage))
        : totalPages === null
          ? ownPage
          : Math.min(totalPages, ownPage),
    addedAsRead,
    // Página impressa em que o conteúdo começa (opcional, v1.4).
    contentStartPage: normalizeContentStart(book.contentStartPage, totalPages),
    status,
    startedAt: toIsoOrNull(book.startedAt),
    finishedAt: status === 'finished' ? toIsoOrNull(book.finishedAt) : null,
    // Avaliação e comentário finais (opcionais). Campos novos com valor
    // padrão: dados antigos continuam válidos sem mudar a versão do formato.
    rating: Number.isInteger(book.rating) && book.rating >= 1 && book.rating <= 5 ? book.rating : null,
    review: isString(book.review) ? book.review : '',
    learnings: isString(book.learnings) ? book.learnings : '',
    createdAt: toIsoOrNull(book.createdAt) ?? toIsoOrNull(book.startedAt) ?? new Date().toISOString(),
    isDemo: Boolean(book.isDemo),
    ...normalizeBookFormat(book, status),
  };
}

const intOrNull = (v, min, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

/** Formato e progresso por porcentagem/áudio (1.7.0). Padrão: livro físico por páginas. */
function normalizeBookFormat(book, status) {
  const format = normalizeFormat(book.format);
  const progressMode = format === 'digital' && book.progressMode === 'percent' ? 'percent' : 'pages';
  const kind = getProgressKind({ format, progressMode });
  const audio = kind === PROGRESS_KINDS.AUDIO;
  const audioDurationSeconds = audio ? intOrNull(book.audioDurationSeconds, 1, MAX_AUDIO_SECONDS) : null;
  let audioPositionSeconds = audio ? Math.max(0, toInt(book.audioPositionSeconds)) : 0;
  if (audioDurationSeconds) audioPositionSeconds = Math.min(audioDurationSeconds, audioPositionSeconds);
  if (audio && status === 'finished' && audioDurationSeconds) audioPositionSeconds = audioDurationSeconds;
  let progressPercent = kind === PROGRESS_KINDS.PERCENT ? clampPercent(book.progressPercent) : 0;
  if (kind === PROGRESS_KINDS.PERCENT && status === 'finished') progressPercent = 100;
  return {
    format,
    progressMode,
    progressPercent,
    audioDurationSeconds,
    audioPositionSeconds,
    narrator: audio && isString(book.narrator) ? book.narrator.trim().slice(0, 120) : '',
    audioSpeed: audio ? normalizeSpeed(book.audioSpeed) : null,
  };
}

/** Vocabulário da sessão: [{ term, meaning }] — texto preservado como digitado. */
export function normalizeVocabulary(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && isString(item.term) && item.term.trim())
    .map((item) => {
      const out = { term: item.term.trim(), meaning: isString(item.meaning) ? item.meaning.trim() : '' };
      const anchor = normalizeAnchor(item.anchor);
      if (anchor) out.anchor = anchor;
      return out;
    });
}


function normalizeSession(session, bookIds) {
  if (!session || !isString(session.id) || !bookIds.has(session.bookId)) return null;
  if (!toDate(session.startedAt)) return null;
  const source = session.source === SESSION_SOURCES.MANUAL ? SESSION_SOURCES.MANUAL : SESSION_SOURCES.TIMER;
  const manual = source === SESSION_SOURCES.MANUAL;
  const progressKind = getSessionKind(session);
  const byPages = progressKind === PROGRESS_KINDS.PAGES;
  // Sessões por porcentagem ou áudio não têm páginas (nada é deduzido).
  const startPage = byPages ? Math.max(manual ? 1 : 0, toInt(session.startPage)) : 0;
  const endPage = byPages ? Math.max(startPage, toInt(session.endPage, startPage)) : 0;
  const pagesRead = byPages ? countSessionPages(source, startPage, endPage) : 0;
  // Registro manual: término e duração podem ser desconhecidos (null) —
  // nada é inventado. No cronômetro eles sempre existem.
  const finishedAt = toIsoOrNull(session.finishedAt) ?? (manual ? null : session.startedAt);
  const rawDuration = session.durationSeconds;
  const durationSeconds =
    manual && (rawDuration === null || rawDuration === undefined || rawDuration === '') ? null : Math.max(0, toInt(rawDuration));
  return {
    ...session,
    source,
    finishedAt,
    startPage,
    endPage,
    pagesRead,
    newPages: Math.min(pagesRead, Math.max(0, toInt(session.newPages, pagesRead))),
    durationSeconds,
    pausedSeconds: Math.max(0, toInt(session.pausedSeconds)),
    pauseCount: Math.max(0, toInt(session.pauseCount)),
    segments: Array.isArray(session.segments) ? session.segments : [],
    notes: isString(session.notes) ? session.notes : '',
    vocabulary: normalizeVocabulary(session.vocabulary),
    annotations: normalizeAnnotations(session.annotations),
    mood: SESSION_MOODS.includes(session.mood) ? session.mood : null,
    isDemo: Boolean(session.isDemo),
    ...normalizeSessionProgress(session, progressKind),
  };
}

function normalizeSessionProgress(session, progressKind) {
  const out = { progressKind, startPercent: null, endPercent: null, startPositionSeconds: null, endPositionSeconds: null, speed: null };
  if (progressKind === PROGRESS_KINDS.PERCENT) {
    out.startPercent = clampPercent(session.startPercent);
    out.endPercent = Math.max(out.startPercent, clampPercent(session.endPercent ?? out.startPercent));
  } else if (progressKind === PROGRESS_KINDS.AUDIO) {
    out.startPositionSeconds = Math.min(MAX_AUDIO_SECONDS, Math.max(0, toInt(session.startPositionSeconds)));
    out.endPositionSeconds = Math.min(MAX_AUDIO_SECONDS, Math.max(out.startPositionSeconds, toInt(session.endPositionSeconds, out.startPositionSeconds)));
    out.speed = normalizeSpeed(session.speed);
  }
  return out;
}

/**
 * Conquistas salvas: [{ id, unlockedAt }]. Ids que esta versão não conhece
 * (ex.: níveis da 1.5.0 cujo alvo mudou na 1.6.0) são MANTIDOS aqui: as
 * regras de conquistas usam essa informação (meta semanal cumprida) e depois
 * os retiram de forma controlada (findStaleAchievements), inclusive do banco.
 */
function normalizeAchievements(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.filter((a) => {
    if (!a || typeof a.id !== 'string' || !a.id || a.id.length > 60 || seen.has(a.id) || !toDate(a.unlockedAt)) return false;
    seen.add(a.id);
    return true;
  });
}

/** Ids repetidos em uma lista (usado na validação de importação). */
export function findDuplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (item && typeof item.id === 'string') {
      if (seen.has(item.id)) duplicates.add(item.id);
      seen.add(item.id);
    }
  }
  return [...duplicates];
}

/**
 * Garante que os dados tenham o formato esperado. Retorna os dados
 * normalizados e um relatório do que precisou ser corrigido.
 */
export function normalizeData(input) {
  const base = createEmptyData();
  const report = { dropped: { books: 0, sessions: 0, activeSession: 0 } };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Os dados salvos não estão no formato esperado.');
  }

  const rawBooks = Array.isArray(input.books) ? input.books : [];
  const books = rawBooks.map(normalizeBook).filter(Boolean);
  report.dropped.books = rawBooks.length - books.length;

  const bookIds = new Set(books.map((b) => b.id));
  const rawSessions = Array.isArray(input.sessions) ? input.sessions : [];
  const sessions = rawSessions.map((s) => normalizeSession(s, bookIds)).filter(Boolean);
  report.dropped.sessions = rawSessions.length - sessions.length;

  // Sessão ativa inválida ou de um livro que não existe mais é descartada.
  let activeSession = input.activeSession ?? null;
  if (activeSession && (!isValidActiveSession(activeSession) || !bookIds.has(activeSession.bookId))) {
    activeSession = null;
    report.dropped.activeSession = 1;
  }

  // O dicionário foi removido na v1.3: o histórico de buscas antigo não é
  // mais carregado nem gravado (arquivos e dados antigos continuam válidos).
  const { dictionaryHistory: _removedDictionary, ...rest } = input;

  const data = {
    ...rest,
    version: SCHEMA_VERSION,
    books,
    sessions,
    activeSession,
    goals: normalizeGoals(input.goals ?? base.goals),
    settings: normalizeSettings(input.settings),
    achievements: normalizeAchievements(input.achievements),
    meta: { ...base.meta, ...(input.meta && typeof input.meta === 'object' ? input.meta : {}) },
  };

  return { data, report };
}
