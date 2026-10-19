/**
 * Regras de negócio dos livros — funções puras.
 *
 * Regras de status (aplicadas em TODOS os caminhos: formulário, menu de
 * status e finalização de sessão):
 * - Lendo: data de início é preenchida se estiver vazia; sem data de conclusão.
 * - Concluído: página atual = total; data de conclusão preenchida;
 *   data de início preenchida se estiver vazia.
 * - Quero ler: sem data de conclusão; se ainda não houve progresso,
 *   a data de início também é limpa.
 */
import { toDate, toInputDate } from './date.js';
import { getBookProgress } from './stats.js';

/** Cores das capas geradas: tons de encadernação que contrastam com o texto claro. */
export const COVER_COLORS = ['#6B3A3A', '#3F5A4A', '#2F4468', '#5A4366', '#6A5130', '#36575C', '#4E4A6E', '#6B4A3A'];

export function pickCoverColor(seed = '') {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return COVER_COLORS[hash % COVER_COLORS.length];
}

const iso = (value) => new Date(value).toISOString();

export function applyStatusChange(book, status, now = new Date()) {
  if (book.status === status) return book;
  const base = { ...book, status, updatedAt: iso(now) };
  switch (status) {
    case 'reading':
      return { ...base, startedAt: book.startedAt ?? iso(now), finishedAt: null };
    case 'finished':
      return {
        ...base,
        startedAt: book.startedAt ?? iso(now),
        finishedAt: iso(now),
        currentPage: book.totalPages ?? book.currentPage,
      };
    case 'want-to-read':
      return { ...base, finishedAt: null, startedAt: book.currentPage > 0 ? book.startedAt : null };
    default:
      return book;
  }
}

/** Aplica as regras de status aos dados validados do formulário. */
function normalizeByStatus(data, now) {
  if (data.status === 'want-to-read') return { ...data, startedAt: null, finishedAt: null };
  if (data.status === 'reading') return { ...data, startedAt: data.startedAt ?? iso(now), finishedAt: null };
  return {
    ...data,
    currentPage: data.totalPages ?? data.currentPage,
    startedAt: data.startedAt ?? data.finishedAt ?? iso(now),
    finishedAt: data.finishedAt ?? iso(now),
  };
}

/** Cria um livro a partir dos dados JÁ validados (validateBookForm().data). */
export function createBook(data, { id, now = new Date() }) {
  const normalized = normalizeByStatus(data, now);
  return {
    id,
    title: normalized.title,
    author: normalized.author,
    coverUrl: normalized.coverUrl,
    coverColor: pickCoverColor(`${normalized.title}${normalized.author}`),
    totalPages: normalized.totalPages,
    currentPage: normalized.currentPage,
    description: normalized.description,
    status: normalized.status,
    startedAt: normalized.startedAt,
    finishedAt: normalized.finishedAt,
    rating: normalized.rating ?? null,
    review: normalized.review ?? '',
    learnings: normalized.learnings ?? '',
    contentStartPage: normalized.contentStartPage ?? null,
    createdAt: iso(now),
    updatedAt: iso(now),
    isDemo: false,
  };
}

/** Atualiza um livro preservando id, data de cadastro e campos extras. */
export function updateBook(book, data, now = new Date()) {
  const normalized = normalizeByStatus(data, now);
  return {
    ...book,
    title: normalized.title,
    author: normalized.author,
    coverUrl: normalized.coverUrl,
    totalPages: normalized.totalPages,
    currentPage: normalized.currentPage,
    description: normalized.description,
    status: normalized.status,
    startedAt: normalized.startedAt,
    finishedAt: normalized.finishedAt,
    rating: normalized.rating ?? null,
    review: normalized.review ?? '',
    learnings: normalized.learnings ?? '',
    contentStartPage: normalized.contentStartPage ?? null,
    updatedAt: iso(now),
  };
}

export const EMPTY_BOOK_FORM = Object.freeze({
  title: '',
  author: '',
  totalPages: '',
  currentPage: '0',
  status: 'want-to-read',
  startedAt: '',
  finishedAt: '',
  coverUrl: '',
  description: '',
  rating: '',
  review: '',
  learnings: '',
  contentStartPage: '',
});

/** Livro → valores de formulário (strings). */
export function bookToFormValues(book) {
  if (!book) return { ...EMPTY_BOOK_FORM };
  return {
    title: book.title ?? '',
    author: book.author ?? '',
    totalPages: String(book.totalPages ?? ''),
    currentPage: String(book.currentPage ?? 0),
    status: book.status,
    startedAt: toInputDate(book.startedAt),
    finishedAt: toInputDate(book.finishedAt),
    coverUrl: book.coverUrl ?? '',
    description: book.description ?? '',
    rating: book.rating ? String(book.rating) : '',
    review: book.review ?? '',
    learnings: book.learnings ?? '',
    contentStartPage: book.contentStartPage ? String(book.contentStartPage) : '',
  };
}

/* ---------- Pesquisa, filtro e ordenação ---------- */

/** "Memórias Póstumas" → "memorias postumas" (sem acentos, minúsculas). */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Cada palavra da busca precisa aparecer no título ou no autor. */
export function searchBooks(books, query) {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return books;
  return books.filter((book) => {
    const haystack = normalizeText(`${book.title} ${book.author}`);
    return terms.every((term) => haystack.includes(term));
  });
}

export const SORT_OPTIONS = [
  { value: 'recentes', label: 'Atividade recente' },
  { value: 'adicionados', label: 'Adicionados recentemente' },
  { value: 'titulo', label: 'Título (A–Z)' },
  { value: 'autor', label: 'Autor (A–Z)' },
  { value: 'progresso', label: 'Maior progresso' },
];

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const time = (value) => toDate(value)?.getTime() ?? 0;

const COMPARATORS = {
  recentes: (a, b) => time(b.updatedAt) - time(a.updatedAt),
  adicionados: (a, b) => time(b.createdAt) - time(a.createdAt),
  titulo: (a, b) => collator.compare(a.title, b.title),
  autor: (a, b) => collator.compare(a.author, b.author) || collator.compare(a.title, b.title),
  progresso: (a, b) => getBookProgress(b) - getBookProgress(a),
};

export function sortBooks(books, sortKey = 'recentes') {
  const compare = COMPARATORS[sortKey] ?? COMPARATORS.recentes;
  return [...books].sort((a, b) => compare(a, b) || collator.compare(a.title, b.title));
}

/** Pesquisa → filtro de status → ordenação. Também devolve a contagem por status. */
export function queryLibrary(books, { query = '', status = 'all', sort = 'recentes' } = {}) {
  const searched = searchBooks(books, query);
  const counts = { all: searched.length, reading: 0, finished: 0, 'want-to-read': 0 };
  for (const book of searched) if (counts[book.status] !== undefined) counts[book.status] += 1;
  const filtered = status === 'all' ? searched : searched.filter((b) => b.status === status);
  return { books: sortBooks(filtered, sort), counts };
}

/** Aplica o comentário final (já validado por validateFinalReview). */
export function applyFinalReview(book, review, now = new Date()) {
  return { ...book, rating: review.rating, review: review.review, learnings: review.learnings, updatedAt: iso(now) };
}

/** O livro tem algum comentário final registrado? */
export const hasFinalReview = (book) => Boolean(book?.rating || book?.review || book?.learnings);

/* ---------- Livros lidos antes do ReadTrack ---------- */

export const EMPTY_PAST_BOOK_FORM = Object.freeze({
  title: '',
  author: '',
  totalPages: '',
  finishedAt: '',
  rating: '',
  review: '',
  learnings: '',
});

export function pastBookToFormValues(book) {
  if (!book) return { ...EMPTY_PAST_BOOK_FORM };
  return {
    title: book.title ?? '',
    author: book.author ?? '',
    totalPages: book.totalPages ? String(book.totalPages) : '',
    finishedAt: toInputDate(book.finishedAt),
    rating: book.rating ? String(book.rating) : '',
    review: book.review ?? '',
    learnings: book.learnings ?? '',
  };
}

/**
 * Livro já concluído antes do ReadTrack (dados de validatePastBookForm).
 * Sempre "Concluído"; sem data de início, sem sessões e sem tempo de leitura.
 */
export function createPastBook(data, { id, now = new Date() }) {
  return {
    id,
    title: data.title,
    author: data.author,
    coverUrl: '',
    coverColor: pickCoverColor(`${data.title}${data.author}`),
    totalPages: data.totalPages,
    currentPage: data.totalPages ?? 0,
    description: '',
    status: 'finished',
    startedAt: null,
    finishedAt: data.finishedAt,
    rating: data.rating,
    review: data.review,
    learnings: data.learnings,
    addedAsRead: true,
    createdAt: iso(now),
    updatedAt: iso(now),
    isDemo: false,
  };
}

/** Edita um livro já lido preservando id, capa, descrição e data de cadastro. */
export function updatePastBook(book, data, now = new Date()) {
  return {
    ...book,
    title: data.title,
    author: data.author,
    totalPages: data.totalPages,
    currentPage: data.totalPages ?? 0,
    status: 'finished',
    finishedAt: data.finishedAt,
    rating: data.rating,
    review: data.review,
    learnings: data.learnings,
    addedAsRead: true,
    updatedAt: iso(now),
  };
}
