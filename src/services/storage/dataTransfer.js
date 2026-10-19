/**
 * Exportação e importação em JSON — funções puras (sem localStorage).
 *
 * Arquivo exportado:
 *   {
 *     "format": "readtrack-backup", "formatVersion": 1,
 *     "app": "ReadTrack", "exportedAt": "...", "schemaVersion": 2,
 *     "data": { ...mesmo formato salvo no navegador... }
 *   }
 *
 * IMPORTAÇÃO É TUDO OU NADA. O arquivo é rejeitado — e os dados atuais
 * ficam intactos — se:
 * - não for JSON, estiver vazio ou passar de 5 MB;
 * - não for um backup do ReadTrack (sem listas de livros e sessões);
 * - vier de uma versão mais nova do site;
 * - tiver ids repetidos;
 * - QUALQUER livro, sessão ou cronômetro for inválido (nada é descartado
 *   em silêncio: o usuário recebe a contagem do que está errado).
 */
import { SCHEMA_VERSION, findDuplicateIds, migrate, normalizeData } from './schema.js';
import { toDateKey } from '../../utils/date.js';
import { normalizeText } from '../../utils/books.js';
import { isSameSessionRecord } from '../../utils/validation.js';
import { DEMO_WORKSPACE, isDemoRecordId } from '../../demo/demoIds.js';

export const EXPORT_FORMAT = 'readtrack-backup';
export const EXPORT_FORMAT_VERSION = 1;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function createExportPayload(data, now = new Date()) {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    app: 'ReadTrack',
    exportedAt: new Date(now).toISOString(),
    schemaVersion: SCHEMA_VERSION,
    data: { ...data, version: SCHEMA_VERSION },
  };
}

export function exportFileName(now = new Date()) {
  return `readtrack-backup-${toDateKey(now)}.json`;
}

const reject = (error, details = []) => ({ ok: false, error, details });

/** Valida o texto de um arquivo de backup e devolve os dados prontos para uso. */
export function parseImportText(text) {
  if (typeof text !== 'string' || !text.trim()) return reject('O arquivo está vazio.');
  if (text.length > MAX_IMPORT_BYTES) return reject('O arquivo passa de 5 MB e não parece ser um backup do ReadTrack.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return reject('O arquivo não é um JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reject('O arquivo não é um backup do ReadTrack.');

  // Arquivo de histórico anotado (Histórico → Importar histórico): não é backup,
  // mas o site sabe o que fazer com ele — a tela de Configurações encaminha.
  if (parsed.format === 'readtrack-history-import') {
    return { ...reject('Este é um arquivo de histórico anotado, não um backup. Ele é importado por “Histórico → Importar histórico”, que acrescenta as sessões sem apagar nada.'), kind: 'history' };
  }
  const isWrapped = parsed.format === EXPORT_FORMAT;
  if (parsed.format && !isWrapped) return reject('O arquivo não é um backup do ReadTrack.');
  if (isWrapped && Number(parsed.formatVersion) > EXPORT_FORMAT_VERSION) {
    return reject('Este backup foi criado por uma versão mais nova do ReadTrack.');
  }
  const payload = isWrapped ? parsed.data : parsed;

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.books) || !Array.isArray(payload.sessions)) {
    return reject('O arquivo não é um backup do ReadTrack: faltam as listas de livros e sessões.');
  }
  const version = Number(payload.version ?? parsed.schemaVersion ?? 1);
  if (!Number.isInteger(version) || version < 1) return reject('A versão dos dados no arquivo é inválida.');
  if (version > SCHEMA_VERSION) return reject('Estes dados foram criados por uma versão mais nova do ReadTrack.');

  const duplicateBooks = findDuplicateIds(payload.books);
  const duplicateSessions = findDuplicateIds(payload.sessions);
  if (duplicateBooks.length || duplicateSessions.length) {
    return reject('O arquivo tem registros repetidos.', [
      duplicateBooks.length && `${duplicateBooks.length} livro(s) com id repetido`,
      duplicateSessions.length && `${duplicateSessions.length} sessão(ões) com id repetido`,
    ].filter(Boolean));
  }

  let result;
  try {
    result = normalizeData(migrate({ ...payload, version }));
  } catch (error) {
    return reject(`Não foi possível ler os dados: ${error.message}`);
  }

  const { books, sessions, activeSession } = result.report.dropped;
  if (books || sessions || activeSession) {
    return reject('O arquivo tem registros inválidos. Nada foi importado.', [
      books && `${books} livro(s) inválido(s)`,
      sessions && `${sessions} sessão(ões) inválida(s) ou de livros inexistentes`,
      activeSession && 'cronômetro em andamento inválido',
    ].filter(Boolean));
  }

  const { data } = result;
  return {
    ok: true,
    data,
    summary: {
      books: data.books.length,
      sessions: data.sessions.length,
      reading: data.books.filter((b) => b.status === 'reading').length,
      finished: data.books.filter((b) => b.status === 'finished').length,
      hasActiveSession: Boolean(data.activeSession),
      exportedAt: isWrapped ? parsed.exportedAt ?? null : null,
      fromVersion: version,
    },
  };
}

/* ---------- Dados de demonstração nunca entram na área pessoal ---------- */

const isDemoBook = (book) => Boolean(book.isDemo) || isDemoRecordId(book.id);

/**
 * Prepara um backup JÁ validado para a área pessoal (conta ou modo local):
 * - arquivo salvo pela demonstração pública → recusado;
 * - livros/sessões de demonstração (isDemo ou id "demo_…") → retirados e
 *   contados, para o usuário saber (versões antigas exportavam junto).
 * @returns {{ ok: true, data, demoSkipped } | { ok: false, error }}
 */
export function prepareForPersonalArea(data) {
  if (data?.meta?.workspace === DEMO_WORKSPACE) {
    return { ok: false, error: 'Este arquivo é da demonstração (dados fictícios) e não pode ser importado para a sua área pessoal.' };
  }
  const books = data.books.filter((b) => !isDemoBook(b));
  const bookIds = new Set(books.map((b) => b.id));
  const sessions = data.sessions.filter((s) => !s.isDemo && !isDemoRecordId(s.id) && bookIds.has(s.bookId));
  const activeSession = data.activeSession && bookIds.has(data.activeSession.bookId) ? data.activeSession : null;
  const demoSkipped = data.books.length - books.length + (data.sessions.length - sessions.length);
  return { ok: true, data: { ...data, books, sessions, activeSession }, demoSkipped };
}

/* ---------- Importar ACRESCENTANDO (sem apagar nada) ---------- */

const titleKey = (title) => normalizeText(String(title ?? '').trim());

/**
 * Plano para acrescentar um backup aos dados atuais, sem apagar nem alterar
 * nada do que já existe:
 * - livro com o mesmo id: já existe, fica como está;
 * - livro com o mesmo título (sem acentos/maiúsculas) e outro id: as sessões
 *   do arquivo vão para o livro que você já tem (não cria um livro repetido);
 * - sessão com o mesmo id, ou mesmo livro + início + páginas: já existe, é pulada;
 * - metas, preferências, conquistas e cronômetro do arquivo são ignorados.
 * @returns {{ books, sessions, summary }} só o que é NOVO.
 */
export function planBackupMerge(current, incoming) {
  const books = [];
  const bookIdMap = new Map();
  const currentIds = new Set(current.books.map((b) => b.id));
  for (const book of incoming.books) {
    if (currentIds.has(book.id)) {
      bookIdMap.set(book.id, book.id);
      continue;
    }
    const sameTitle = !book.addedAsRead && current.books.find((b) => !b.addedAsRead && titleKey(b.title) === titleKey(book.title));
    if (sameTitle) {
      bookIdMap.set(book.id, sameTitle.id);
      continue;
    }
    bookIdMap.set(book.id, book.id);
    books.push(book);
  }

  const sessions = [];
  let skipped = 0;
  const known = [...current.sessions];
  const knownIds = new Set(current.sessions.map((s) => s.id));
  for (const raw of incoming.sessions) {
    const session = { ...raw, bookId: bookIdMap.get(raw.bookId) ?? raw.bookId };
    if (knownIds.has(session.id) || known.some((s) => isSameSessionRecord(s, session))) {
      skipped += 1;
      continue;
    }
    knownIds.add(session.id);
    known.push(session);
    sessions.push(session);
  }

  return {
    books,
    sessions,
    summary: {
      booksAdded: books.length,
      booksExisting: incoming.books.length - books.length,
      sessionsAdded: sessions.length,
      sessionsSkipped: skipped,
    },
  };
}
