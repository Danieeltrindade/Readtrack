/**
 * Migração dos dados do localStorage para a conta no Supabase.
 *
 * Garantias:
 * - Nada é apagado aqui. Os dados locais continuam no navegador; apagar é
 *   uma ação separada, oferecida só depois de a verificação passar.
 * - Repetir a migração não duplica: cada registro mantém seu id e o banco
 *   ignora os que já existem (ON CONFLICT DO NOTHING).
 * - Registros já existentes na conta NÃO são sobrescritos pelos locais.
 * - Ao final, os ids são relidos do banco e comparados com os locais.
 * - Dados de demonstração não são enviados (podem ser restaurados depois).
 */
import { DEFAULT_GOALS } from '../../utils/goals.js';
import { DEFAULT_SETTINGS } from '../../utils/settings.js';

const isReal = (item) => !item.isDemo;

/** O que existe no navegador e seria enviado. */
export function buildMigrationPayload(localData) {
  if (!localData) return null;
  const books = (localData.books ?? []).filter(isReal);
  const bookIds = new Set(books.map((b) => b.id));
  const sessions = (localData.sessions ?? []).filter((s) => isReal(s) && bookIds.has(s.bookId));
  const active = localData.activeSession && bookIds.has(localData.activeSession.bookId) ? localData.activeSession : null;
  return {
    books,
    sessions,
    achievements: localData.achievements ?? [],
    activeSession: active,
    settings: localData.settings ?? { ...DEFAULT_SETTINGS },
    goals: localData.goals ?? { ...DEFAULT_GOALS },
  };
}

function differsFromDefaults(settings, goals) {
  const s = settings ?? {};
  const g = goals ?? {};
  return (
    Object.keys(DEFAULT_SETTINGS).some((key) => (s[key] ?? DEFAULT_SETTINGS[key]) !== DEFAULT_SETTINGS[key]) ||
    Object.keys(DEFAULT_GOALS).some((key) => (key in g ? g[key] : DEFAULT_GOALS[key]) !== DEFAULT_GOALS[key])
  );
}

/** Contagens para mostrar ao usuário antes de migrar. */
export function summarizeLocalData(localData) {
  const payload = buildMigrationPayload(localData);
  if (!payload) return { isEmpty: true, books: 0, sessions: 0, achievements: 0, demoItems: 0, hasActiveSession: false };
  const demoItems = (localData.books ?? []).filter((b) => b.isDemo).length + (localData.sessions ?? []).filter((s) => s.isDemo).length;
  const summary = {
    books: payload.books.length,
    sessions: payload.sessions.length,
    achievements: payload.achievements.length,
    hasActiveSession: Boolean(payload.activeSession),
    hasCustomPreferences: differsFromDefaults(payload.settings, payload.goals),
    demoItems,
  };
  summary.isEmpty = summary.books === 0 && summary.sessions === 0 && !summary.hasCustomPreferences;
  return summary;
}

/**
 * Envia os dados locais para a conta.
 * @returns {Promise<{ ok, verified, counts, failed, missing }>}
 */
export async function migrateLocalData({ repository, userId, localData, includePreferences = false }) {
  const payload = buildMigrationPayload(localData);
  if (!payload) return { ok: true, verified: true, counts: {}, failed: [], missing: [] };

  const before = await repository.listIds(userId);
  const failed = [];
  const note = (kind) => (result) => failed.push(...result.failed.map((f) => ({ kind, ...f })));

  note('livro')(await repository.insertMissing('books', userId, payload.books));
  const failedBooks = new Set(failed.filter((f) => f.kind === 'livro').map((f) => f.id));
  const sessions = payload.sessions.filter((s) => !failedBooks.has(s.bookId));
  for (const s of payload.sessions) {
    if (failedBooks.has(s.bookId)) failed.push({ kind: 'sessão', id: s.id, message: 'O livro desta sessão não foi enviado.' });
  }
  note('sessão')(await repository.insertMissing('sessions', userId, sessions));
  note('conquista')(await repository.insertMissing('achievements', userId, payload.achievements));

  if (payload.activeSession && !failedBooks.has(payload.activeSession.bookId)) {
    await repository.insertActiveSessionIfAbsent(userId, payload.activeSession);
  }
  if (includePreferences) {
    await repository.saveProfile(userId, { settings: payload.settings, goals: payload.goals });
  }

  // Verificação: tudo o que deveria estar no banco está?
  const after = await repository.listIds(userId);
  const failedIds = new Set(failed.map((f) => f.id));
  const groups = [
    ['livro', 'books', payload.books.map((b) => b.id)],
    ['sessão', 'sessions', sessions.map((s) => s.id)],
    ['conquista', 'achievements', payload.achievements.map((a) => a.id)],
  ];
  const counts = {};
  const missing = [];
  for (const [kind, key, ids] of groups) {
    const relevant = ids.filter((id) => !failedIds.has(id));
    counts[key] = {
      total: ids.length,
      inserted: relevant.filter((id) => !before[key].has(id) && after[key].has(id)).length,
      alreadyExisted: relevant.filter((id) => before[key].has(id)).length,
    };
    for (const id of relevant) if (!after[key].has(id)) missing.push({ kind, id });
  }

  const verified = missing.length === 0;
  return { ok: verified && failed.length === 0, verified, counts, failed, missing };
}
