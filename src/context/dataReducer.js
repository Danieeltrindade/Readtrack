/**
 * Reducer dos dados do ReadTrack. Puro: sem localStorage e sem ler o
 * relógio — o momento atual chega sempre no payload (`now`).
 * As regras de negócio vivem em utils/ (books, sessions, timer); aqui só
 * aplicamos as mudanças de forma atômica e consistente.
 */
import { createEmptyData } from '../services/storage/schema.js';
import { applyStatusChange } from '../utils/books.js';
import { applyAddedSessions, applySessionChange, applySessionToBook } from '../utils/sessions.js';
import { withRecomputedNewPages } from '../utils/pages.js';
import {
  backToTimer,
  pauseActiveSession,
  resumeActiveSession,
  reviewActiveSession,
} from '../utils/timer.js';

export const ACTIONS = Object.freeze({
  HYDRATE: 'data/hydrate',
  ADD_BOOK: 'books/add',
  UPDATE_BOOK: 'books/update',
  CHANGE_BOOK_STATUS: 'books/change-status',
  DELETE_BOOK: 'books/delete',
  START_SESSION: 'timer/start',
  PAUSE_SESSION: 'timer/pause',
  RESUME_SESSION: 'timer/resume',
  REVIEW_SESSION: 'timer/review',
  BACK_TO_TIMER: 'timer/back',
  SAVE_DRAFT: 'timer/save-draft',
  CANCEL_SESSION: 'timer/cancel',
  COMPLETE_SESSION: 'sessions/complete',
  UPDATE_SESSION: 'sessions/update',
  ADD_SESSIONS: 'sessions/add-many',
  DELETE_SESSION: 'sessions/delete',
  UPDATE_GOALS: 'goals/update',
  UPDATE_SETTINGS: 'settings/update',
  SYNC_ACHIEVEMENTS: 'achievements/sync',
  REPLACE_ALL: 'data/replace-all',
  CLEAR_ALL: 'data/clear-all',
  REMOVE_DEMO: 'demo/remove',
});

function withoutDemo(items) {
  return items.filter((item) => !item.isDemo);
}

function updateActive(state, updater) {
  if (!state.activeSession) return state;
  const next = updater(state.activeSession);
  return next === state.activeSession ? state : { ...state, activeSession: next };
}

export function dataReducer(state, action) {
  switch (action.type) {
    case ACTIONS.HYDRATE:
      return action.payload;

    /* ---------- Livros ---------- */

    case ACTIONS.ADD_BOOK:
      if (state.books.some((b) => b.id === action.payload.id)) return state;
      return { ...state, books: [...state.books, action.payload] };

    case ACTIONS.UPDATE_BOOK: {
      const previous = state.books.find((book) => book.id === action.payload.id);
      const next = {
        ...state,
        books: state.books.map((book) => (book.id === action.payload.id ? action.payload : book)),
      };
      // Mudou a página inicial da leitura: as sessões continuam iguais, só as
      // "páginas novas" (derivadas) são recalculadas.
      if (previous && (previous.contentStartPage ?? null) !== (action.payload.contentStartPage ?? null)) {
        next.sessions = withRecomputedNewPages(state.sessions, action.payload);
      }
      return next;
    }

    case ACTIONS.ADD_SESSIONS: {
      // Registro manual e importação: livros novos (se houver) + sessões, numa
      // única atualização — ou entra tudo, ou nada.
      const { books: newBooks = [], sessions: added, now } = action.payload;
      const knownBooks = new Set(state.books.map((b) => b.id));
      const books = [...state.books, ...newBooks.filter((b) => !knownBooks.has(b.id))];
      const result = applyAddedSessions({ books, sessions: state.sessions, added, now });
      if (result.added.length === 0 && books.length === state.books.length) return state;
      return { ...state, books: result.books, sessions: result.sessions };
    }

    case ACTIONS.CHANGE_BOOK_STATUS: {
      const { id, status, now } = action.payload;
      return {
        ...state,
        books: state.books.map((book) => (book.id === id ? applyStatusChange(book, status, now) : book)),
      };
    }

    case ACTIONS.DELETE_BOOK: {
      // Remove também as sessões do livro e o cronômetro dele, se houver.
      const { id } = action.payload;
      return {
        ...state,
        books: state.books.filter((b) => b.id !== id),
        sessions: state.sessions.filter((s) => s.bookId !== id),
        activeSession: state.activeSession?.bookId === id ? null : state.activeSession,
      };
    }

    /* ---------- Cronômetro ---------- */

    case ACTIONS.START_SESSION:
      // Só uma sessão por vez: um segundo "Iniciar" é ignorado.
      if (state.activeSession) return state;
      return { ...state, activeSession: action.payload };

    case ACTIONS.PAUSE_SESSION:
      return updateActive(state, (active) => pauseActiveSession(active, action.payload.now));

    case ACTIONS.RESUME_SESSION:
      return updateActive(state, (active) => resumeActiveSession(active, action.payload.now));

    case ACTIONS.REVIEW_SESSION:
      return updateActive(state, (active) => reviewActiveSession(active, action.payload.now));

    case ACTIONS.BACK_TO_TIMER:
      return updateActive(state, (active) => backToTimer(active));

    case ACTIONS.SAVE_DRAFT:
      return updateActive(state, (active) =>
        active.id === action.payload.id ? { ...active, draft: action.payload.draft } : active,
      );

    case ACTIONS.CANCEL_SESSION:
      if (!state.activeSession || state.activeSession.id !== action.payload.id) return state;
      return { ...state, activeSession: null };

    case ACTIONS.COMPLETE_SESSION: {
      const { session, markFinished } = action.payload;
      // Proteção contra duplicidade: a sessão precisa ser a ativa e ainda não salva.
      if (state.activeSession?.id !== session.id) return state;
      if (state.sessions.some((s) => s.id === session.id)) return { ...state, activeSession: null };
      return {
        ...state,
        sessions: [...state.sessions, session],
        books: state.books.map((book) =>
          book.id === session.bookId ? applySessionToBook(book, session, { markFinished }) : book,
        ),
        activeSession: null,
      };
    }

    case ACTIONS.UPDATE_SESSION:
    case ACTIONS.DELETE_SESSION: {
      // Edição/exclusão: livro e páginas novas recalculados juntos (utils/sessions.js).
      const { session, deleteId, now } = action.payload;
      const id = session?.id ?? deleteId;
      const target = state.sessions.find((s) => s.id === id);
      if (!target) return state;
      const book = state.books.find((b) => b.id === target.bookId);
      const change = action.type === ACTIONS.DELETE_SESSION ? { deleteId } : { session };
      const result = applySessionChange({ book, sessions: state.sessions, change, now });
      if (!result) return state;
      return {
        ...state,
        sessions: result.sessions,
        books: result.book === book ? state.books : state.books.map((b) => (b.id === book.id ? result.book : b)),
      };
    }

    /* ---------- Preferências e demonstração ---------- */

    case ACTIONS.UPDATE_GOALS:
      return { ...state, goals: { ...state.goals, ...action.payload } };

    case ACTIONS.SYNC_ACHIEVEMENTS: {
      // Acrescenta as recém-atingidas e retira as que os registros atuais não
      // sustentam mais (payload { add, remove }; um array = só acrescentar).
      const { add = [], remove = [] } = Array.isArray(action.payload) ? { add: action.payload } : action.payload;
      const removing = new Set(remove);
      const kept = state.achievements.filter((a) => !removing.has(a.id));
      const known = new Set(kept.map((a) => a.id));
      const fresh = add.filter((a) => !known.has(a.id));
      if (fresh.length === 0 && kept.length === state.achievements.length) return state;
      return { ...state, achievements: [...kept, ...fresh] };
    }

    case ACTIONS.REPLACE_ALL:
      // Dados já validados por parseImportText. As conquistas são recalculadas.
      return { ...action.payload, achievements: [] };

    case ACTIONS.CLEAR_ALL:
      return createEmptyData();

    case ACTIONS.UPDATE_SETTINGS:
      return { ...state, settings: { ...state.settings, ...action.payload } };

    // 1.6.0: a área pessoal não recebe mais dados de demonstração (eles vivem
    // só em /demo). REMOVE_DEMO continua para limpar os que versões antigas
    // gravaram no modo local (itens com isDemo: true).
    case ACTIONS.REMOVE_DEMO: {
      const books = withoutDemo(state.books);
      const ids = new Set(books.map((b) => b.id));
      return {
        ...state,
        books,
        sessions: withoutDemo(state.sessions),
        activeSession: state.activeSession && !ids.has(state.activeSession.bookId) ? null : state.activeSession,
        achievements: [],
        meta: { ...state.meta, demoLoadedAt: null },
      };
    }

    default:
      return state;
  }
}
