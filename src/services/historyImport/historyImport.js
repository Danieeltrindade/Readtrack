/**
 * Importação de histórico de leitura anotado à mão (formato
 * "readtrack-history-import"; exemplo fictício em
 * src/services/historyImport/fixtures/historico-exemplo.json).
 *
 * Etapas: parseHistoryFile (valida o arquivo) → buildImportPlan (pré-
 * visualização: ano, livros, duplicatas, divergências) → o usuário confirma
 * → DataProvider.importHistory grava tudo numa única atualização.
 *
 * Garantias:
 * - Nada é gravado antes da confirmação (cancelar não muda nada).
 * - Cada sessão vira um registro independente, com id determinístico
 *   (livro + início + páginas): importar de novo não duplica.
 * - Sessões iguais já existentes (mesmo livro, início e páginas) são puladas.
 * - Datas, horários, páginas, duração anotada e notas são preservados como
 *   vieram. A duração calculada pelos horários é só mostrada ao lado.
 * - Sessão que passa da meia-noite precisa trazer "endDate": o término nunca
 *   é deduzido só porque o horário final é menor que o inicial.
 * - Livros só são criados se não existirem; nenhum é marcado como concluído
 *   e nenhuma data de conclusão é criada.
 */
import { normalizeText } from '../../utils/books.js';
import { calculateElapsedSeconds, getDurationDivergence, parseDurationText } from '../../utils/duration.js';
import { isSameSessionRecord, LIMITS, validateVocabulary } from '../../utils/validation.js';
import { pickCoverColor } from '../../utils/books.js';

export const HISTORY_IMPORT_FORMAT = 'readtrack-history-import';
export const DEFAULT_IMPORT_YEAR = 2026;

/** Fuso das anotações: horário de Brasília (sem horário de verão desde 2019). */
const BRASILIA_OFFSET = '-03:00';

const DAY_MONTH = /^(\d{1,2})\/(\d{1,2})$/;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/* ---------- Ids determinísticos ---------- */

function fnv1a(text, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const stableHash = (text) => `${fnv1a(text, 2166136261)}${fnv1a(text, 3141592653)}`;
export const importedBookId = (title) => `book_imp_${stableHash(normalizeText(title))}`;
export const importedSessionId = (title, startedAt, first, last) =>
  `session_imp_${stableHash(`${normalizeText(title)}|${new Date(startedAt).toISOString()}|${first}|${last}`)}`;

/* ---------- Leitura do arquivo ---------- */

export function parseHistoryFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' };
  }
  if (data?.format !== HISTORY_IMPORT_FORMAT) {
    return { ok: false, error: 'Este arquivo não é um histórico de leitura do ReadTrack (formato "readtrack-history-import").' };
  }
  if (!Array.isArray(data.books) || data.books.length === 0) return { ok: false, error: 'O arquivo não tem livros.' };
  for (const [i, book] of data.books.entries()) {
    if (typeof book?.title !== 'string' || !book.title.trim()) return { ok: false, error: `O livro ${i + 1} não tem título.` };
    if (!Array.isArray(book.sessions)) return { ok: false, error: `“${book.title}” não tem a lista de sessões.` };
  }
  return { ok: true, data };
}

/* ---------- Datas ---------- */

function toInstant(dayMonth, time, year) {
  const dm = DAY_MONTH.exec(String(dayMonth ?? '').trim());
  const tm = TIME.exec(String(time ?? '').trim());
  if (!dm || !tm) return null;
  const [day, month] = [Number(dm[1]), Number(dm[2])];
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(Number(tm[1]))}:${tm[2]}:00${BRASILIA_OFFSET}`;
  const date = new Date(iso);
  // Rejeita 31/02 etc.: o dia precisa sobreviver à conversão (no fuso de Brasília).
  const check = new Date(date.getTime() - 3 * 3600 * 1000);
  if (Number.isNaN(date.getTime()) || check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) return null;
  return date;
}

export const sessionLabel = (raw) => `${raw.date}${raw.endDate && raw.endDate !== raw.date ? `→${raw.endDate}` : ''} · p. ${raw.firstPage}–${raw.lastPage}`;

/**
 * Converte uma sessão do arquivo. Devolve { session, issues } — issues são
 * erros que impedem importar ESTA sessão (o plano todo fica bloqueado).
 */
function convertSession(raw, { title, bookId, year, now }) {
  const issues = [];
  const first = Number(raw.firstPage);
  const last = Number(raw.lastPage);
  if (!Number.isInteger(first) || first < 1) issues.push('página inicial inválida');
  if (!Number.isInteger(last) || last < 1) issues.push('página final inválida');
  if (Number.isInteger(first) && Number.isInteger(last) && last < first) issues.push('a última página é menor que a primeira');

  const startedAt = toInstant(raw.date, raw.start, year);
  if (!startedAt) issues.push('data ou horário de início inválido');
  let finishedAt = null;
  if (raw.end) {
    finishedAt = toInstant(raw.endDate || raw.date, raw.end, year);
    if (!finishedAt) issues.push('data ou horário de término inválido');
    else if (startedAt && finishedAt <= startedAt) {
      issues.push(
        raw.endDate
          ? 'o término é antes do início'
          : 'o término é antes do início no mesmo dia; se passou da meia-noite, informe "endDate" no arquivo',
      );
    }
  }
  if (startedAt && startedAt > now) issues.push(`a data fica no futuro em ${year}`);

  const duration = parseDurationText(raw.duration);
  if (duration.error) issues.push(`duração "${raw.duration}" inválida`);

  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
  if (notes.length > LIMITS.notes) issues.push(`observação com mais de ${LIMITS.notes} caracteres`);
  const vocabulary = (Array.isArray(raw.vocabulary) ? raw.vocabulary : [])
    .filter((v) => v && typeof v.term === 'string' && v.term.trim())
    .map((v) => ({ term: v.term.trim(), meaning: typeof v.meaning === 'string' ? v.meaning.trim() : '' }));
  const vocabularyError = validateVocabulary(vocabulary);
  if (vocabularyError) issues.push(vocabularyError);

  if (issues.length) return { issues };
  const pagesRead = last - first + 1;
  const session = {
    id: importedSessionId(title, startedAt, first, last),
    bookId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt ? finishedAt.toISOString() : null,
    durationSeconds: duration.seconds ?? null,
    pausedSeconds: 0,
    pauseCount: 0,
    segments: [],
    startPage: first,
    endPage: last,
    pagesRead,
    newPages: pagesRead,
    notes,
    vocabulary,
    source: 'manual',
    createdAt: new Date(now).toISOString(),
    isDemo: false,
  };
  return { session, issues: [] };
}

/* ---------- Plano de importação (pré-visualização) ---------- */

/** Livro existente com o mesmo título (sem acentos/maiúsculas). */
export function findBookByTitle(books, title) {
  const key = normalizeText(title);
  return books.find((b) => normalizeText(b.title) === key) ?? null;
}

/**
 * @param file   dados de parseHistoryFile
 * @param options.year      ano das datas (as anotações não têm ano)
 * @param options.books     livros atuais
 * @param options.sessions  sessões atuais
 * @param options.choices   por índice do livro no arquivo:
 *   { mode: 'existing', bookId } | { mode: 'new', totalPages, contentStartPage }
 */
export function buildImportPlan(file, { year, books, sessions, choices = {}, now = new Date() }) {
  const errors = [];
  const yearNumber = Number(year);
  const currentYear = new Date(now).getFullYear();
  if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > currentYear) {
    errors.push(`Informe um ano entre 1900 e ${currentYear}.`);
  }

  const plan = {
    year: yearNumber,
    books: [],
    newBooks: [],
    sessions: [],
    duplicates: [],
    divergences: [],
    counts: { booksToCreate: 0, booksExisting: 0, sessions: 0, duplicates: 0, sessionsWithNotes: 0, vocabularyEntries: 0, sessionsWithoutDuration: 0 },
    errors,
  };
  if (errors.length) return { ...plan, ready: false };

  const seenIds = new Set();
  file.books.forEach((rawBook, index) => {
    const match = findBookByTitle(books, rawBook.title);
    const choice = choices[index] ?? (match ? { mode: 'existing', bookId: match.id } : { mode: 'new' });
    const maxPage = Math.max(0, ...rawBook.sessions.map((s) => Number(s.lastPage) || 0));
    const minPage = Math.min(...rawBook.sessions.map((s) => Number(s.firstPage) || 1));
    const entry = { index, title: rawBook.title.trim(), match, choice, sessionCount: rawBook.sessions.length, maxPage, minPage, errors: [] };

    let target = null;
    if (choice.mode === 'existing') {
      target = books.find((b) => b.id === choice.bookId) ?? null;
      if (!target) entry.errors.push('Escolha um livro da sua biblioteca.');
      else if (target.addedAsRead) entry.errors.push('Livros marcados como lidos antes do ReadTrack não recebem sessões.');
      else if (target.totalPages && maxPage > target.totalPages)
        entry.errors.push(`As sessões vão até a página ${maxPage}, mas “${target.title}” tem ${target.totalPages}.`);
    } else {
      // O total não está nas anotações: é opcional e, em branco, fica "não informado".
      const blank = (v) => v === '' || v === undefined || v === null || String(v).trim() === '';
      const total = blank(choice.totalPages) ? null : Number(choice.totalPages);
      const start = blank(choice.contentStartPage) ? null : Number(choice.contentStartPage);
      if (total !== null && (!Number.isInteger(total) || total < 1 || total > 20000)) entry.errors.push('Total de páginas inválido (use um número inteiro ou deixe em branco).');
      else if (total !== null && total < maxPage) entry.errors.push(`O total precisa ser pelo menos ${maxPage}, a última página anotada.`);
      if (start !== null && (!Number.isInteger(start) || start < 1 || (total !== null && start > total)))
        entry.errors.push('Página inicial da leitura inválida.');
      if (entry.errors.length === 0) {
        target = {
          id: importedBookId(rawBook.title),
          title: rawBook.title.trim(),
          author: '',
          coverUrl: '',
          coverColor: pickCoverColor(rawBook.title.trim()),
          totalPages: total,
          currentPage: 0,
          contentStartPage: start,
          description: '',
          status: 'want-to-read', // vira "Lendo" ao receber as sessões; nunca "Concluído"
          startedAt: null,
          finishedAt: null,
          rating: null,
          review: '',
          learnings: '',
          addedAsRead: false,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          isDemo: false,
        };
        plan.newBooks.push(target);
      } else {
        // Ainda faltam dados do livro: as sessões entram só na pré-visualização
        // (contagens, duplicatas, divergências). O plano não fica pronto.
        target = { id: importedBookId(rawBook.title), provisional: true };
      }
    }

    entry.bookId = target && !target.provisional ? target.id : null;
    entry.newSessions = 0;
    entry.duplicateSessions = 0;
    entry.sessionIssues = [];
    if (!target) {
      plan.books.push(entry);
      return;
    }

    for (const raw of rawBook.sessions) {
      const { session, issues } = convertSession(raw, { title: rawBook.title, bookId: target.id, year: yearNumber, now });
      if (issues.length) {
        entry.sessionIssues.push(`${sessionLabel(raw)}: ${issues.join('; ')}`);
        continue;
      }
      const alreadyThere =
        seenIds.has(session.id) || sessions.some((s) => s.id === session.id || isSameSessionRecord(s, session));
      if (alreadyThere) {
        entry.duplicateSessions += 1;
        plan.duplicates.push({ book: entry.title, label: sessionLabel(raw) });
        continue;
      }
      seenIds.add(session.id);
      plan.sessions.push(session);
      entry.newSessions += 1;
      if (session.notes || session.vocabulary.length) plan.counts.sessionsWithNotes += 1;
      plan.counts.vocabularyEntries += session.vocabulary.length;
      if (session.durationSeconds === null) plan.counts.sessionsWithoutDuration += 1;
      const divergence = getDurationDivergence(session);
      if (divergence) plan.divergences.push({ book: entry.title, label: sessionLabel(raw), ...divergence });
    }
    if (entry.sessionIssues.length) entry.errors.push(...entry.sessionIssues);
    plan.books.push(entry);
  });

  plan.counts.booksToCreate = plan.books.filter((b) => b.choice.mode !== 'existing').length;
  plan.counts.booksExisting = plan.books.filter((b) => b.choice.mode === 'existing' && b.bookId).length;
  plan.counts.sessions = plan.sessions.length;
  plan.counts.duplicates = plan.duplicates.length;
  const blocking = plan.books.flatMap((b) => b.errors);
  return { ...plan, errors: [...errors, ...blocking], ready: blocking.length === 0 && errors.length === 0 };
}

/** Para mostrar ao lado da duração anotada. */
export const elapsedOf = (session) => calculateElapsedSeconds(session.startedAt, session.finishedAt);
