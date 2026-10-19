/**
 * Repositório remoto: ÚNICO módulo que monta consultas ao banco do Supabase.
 * Componentes e contextos nunca chamam `supabase.from(...)` diretamente.
 *
 * Toda consulta filtra por user_id explicitamente, além da RLS no banco
 * (defesa em profundidade e uso dos índices).
 */
import {
  TABLES,
  achievementToRow,
  activeSessionToRow,
  bookToRow,
  profileToRow,
  rowToAchievement,
  rowToActiveSession,
  rowToBook,
  rowToProfile,
  rowToSession,
  sessionToRow,
} from './mappers.js';

const PAGE_SIZE = 1000; // limite padrão de linhas por resposta no Supabase
const DELETE_CHUNK = 100; // ids por requisição (tamanho da URL)
const UPSERT_CHUNK = { books: 50, default: 500 }; // capas podem ser imagens grandes

export class RepositoryError extends Error {
  constructor(message, { kind = 'unknown', code = null, cause = null } = {}) {
    super(message);
    this.name = 'RepositoryError';
    this.kind = kind;
    this.code = code;
    this.cause = cause;
  }
}

/** Traduz erros do Supabase/PostgREST/rede para mensagens úteis em português. */
export function toRepositoryError(error, action = 'acessar o banco') {
  if (error instanceof RepositoryError) return error;
  const code = error?.code ?? null;
  const status = Number(error?.status ?? 0);
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`;

  if (error?.name === 'TypeError' || /fetch|network|Failed to fetch|Load failed/i.test(text)) {
    return new RepositoryError(`Sem conexão com o servidor ao ${action}. Verifique sua internet.`, { kind: 'network', code, cause: error });
  }
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /JWT/i.test(text)) {
    return new RepositoryError('Sua sessão expirou. Entre novamente para continuar salvando.', { kind: 'auth', code, cause: error });
  }
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST204' || code === '42703' || code === 'PGRST202' || code === '42883') {
    return new RepositoryError(
      'As tabelas do ReadTrack não foram encontradas ou estão desatualizadas no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor.',
      { kind: 'schema', code, cause: error },
    );
  }
  if (code === '42501') {
    return new RepositoryError('O banco recusou a operação por falta de permissão (RLS). Confira as políticas em supabase/schema.sql.', {
      kind: 'permission',
      code,
      cause: error,
    });
  }
  if (code === '23514' || code === '23502' || code === '23503' || code === '22P02') {
    return new RepositoryError(`O banco recusou dados fora das regras ao ${action}: ${error.message}`, { kind: 'validation', code, cause: error });
  }
  return new RepositoryError(`Não foi possível ${action}: ${error?.message ?? 'erro desconhecido'}`, { kind: 'unknown', code, cause: error });
}

async function run(query, action) {
  let result;
  try {
    result = await query;
  } catch (error) {
    throw toRepositoryError(error, action);
  }
  if (result?.error) throw toRepositoryError({ ...result.error, status: result.status }, action);
  return result?.data ?? null;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Configuração de cada coleção sincronizada como lista. */
const COLLECTIONS = {
  books: { table: TABLES.books, key: 'id', conflict: 'user_id,id', toRow: bookToRow, order: 'id' },
  sessions: { table: TABLES.sessions, key: 'id', conflict: 'user_id,id', toRow: sessionToRow, order: 'id' },
  achievements: {
    table: TABLES.achievements,
    key: 'achievement_id',
    conflict: 'user_id,achievement_id',
    toRow: achievementToRow,
    order: 'achievement_id',
  },
};

export function createRepository(client) {
  if (!client) throw new Error('createRepository precisa de um cliente do Supabase.');

  /** Lê todas as linhas do usuário, página por página. */
  async function selectAll(table, userId, order) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const page = await run(
        client
          .from(table)
          .select('*')
          .eq('user_id', userId)
          .order(order, { ascending: true })
          .range(from, from + PAGE_SIZE - 1),
        'carregar seus dados',
      );
      rows.push(...(page ?? []));
      if (!page || page.length < PAGE_SIZE) return rows;
    }
  }

  async function upsertRows(name, rows, { ignoreDuplicates = false } = {}) {
    const { table, conflict } = COLLECTIONS[name] ?? {};
    const size = UPSERT_CHUNK[name] ?? UPSERT_CHUNK.default;
    for (const part of chunk(rows, size)) {
      await run(
        client.from(table).upsert(part, { onConflict: conflict, ignoreDuplicates, defaultToNull: false }),
        'salvar suas alterações',
      );
    }
  }

  async function deleteKeys(name, userId, keys) {
    const { table, key } = COLLECTIONS[name];
    for (const part of chunk(keys, DELETE_CHUNK)) {
      await run(client.from(table).delete().eq('user_id', userId).in(key, part), 'excluir registros');
    }
  }

  async function saveProfile(userId, { settings, goals }) {
    await run(client.from(TABLES.profiles).upsert(profileToRow({ settings, goals }, userId), { onConflict: 'id' }), 'salvar suas preferências');
  }

  async function saveActiveSession(userId, active) {
    if (active) {
      await run(
        client.from(TABLES.activeSessions).upsert(activeSessionToRow(active, userId), { onConflict: 'user_id' }),
        'salvar o cronômetro',
      );
    } else {
      await run(client.from(TABLES.activeSessions).delete().eq('user_id', userId), 'encerrar o cronômetro');
    }
  }

  return {
    /** Carrega tudo o que pertence ao usuário, já no formato do app. */
    async loadAll(userId) {
      const [profileRow, books, sessions, activeRow, achievements] = await Promise.all([
        run(client.from(TABLES.profiles).select('*').eq('id', userId).maybeSingle(), 'carregar seu perfil'),
        selectAll(TABLES.books, userId, 'id'),
        selectAll(TABLES.sessions, userId, 'id'),
        run(client.from(TABLES.activeSessions).select('*').eq('user_id', userId).maybeSingle(), 'carregar o cronômetro'),
        selectAll(TABLES.achievements, userId, 'achievement_id'),
      ]);
      const profile = rowToProfile(profileRow);
      return {
        books: books.map(rowToBook),
        sessions: sessions.map(rowToSession),
        activeSession: rowToActiveSession(activeRow),
        achievements: achievements.map(rowToAchievement),
        settings: profile.settings,
        goals: profile.goals,
        profileExists: Boolean(profileRow),
      };
    },

    /**
     * Aplica uma diferença calculada por diffData. Ordem pensada para as
     * chaves estrangeiras: livros antes das sessões; exclusões de sessões
     * antes das de livros. Cada passo é idempotente.
     */
    async applyChanges(userId, changes) {
      const rows = (name, items) => items.map((item) => COLLECTIONS[name].toRow(item, userId));
      if (changes.profile) await saveProfile(userId, changes.profile);
      if (changes.books.upsert.length) await upsertRows('books', rows('books', changes.books.upsert));
      if (changes.sessions.upsert.length) await upsertRows('sessions', rows('sessions', changes.sessions.upsert));
      if (changes.activeSession !== undefined) await saveActiveSession(userId, changes.activeSession);
      if (changes.achievements.upsert.length) await upsertRows('achievements', rows('achievements', changes.achievements.upsert));
      if (changes.achievements.remove.length) await deleteKeys('achievements', userId, changes.achievements.remove);
      if (changes.sessions.remove.length) await deleteKeys('sessions', userId, changes.sessions.remove);
      if (changes.books.remove.length) await deleteKeys('books', userId, changes.books.remove);
    },

    /**
     * Migração: insere só o que ainda NÃO existe no banco
     * (ON CONFLICT DO NOTHING). Repetir não duplica nem sobrescreve
     * alterações feitas depois na conta. Se um lote falhar, tenta item a
     * item para identificar exatamente quais registros o banco recusou.
     */
    async insertMissing(name, userId, items) {
      const failed = [];
      const toRow = (item) => COLLECTIONS[name].toRow(item, userId);
      try {
        await upsertRows(name, items.map(toRow), { ignoreDuplicates: true });
      } catch (error) {
        if (error.kind === 'network' || error.kind === 'auth' || error.kind === 'schema') throw error;
        for (const item of items) {
          try {
            await upsertRows(name, [toRow(item)], { ignoreDuplicates: true });
          } catch (itemError) {
            if (itemError.kind === 'network' || itemError.kind === 'auth') throw itemError;
            failed.push({ id: item.id, message: itemError.message });
          }
        }
      }
      return { failed };
    },

    /** Cria o cronômetro remoto só se não houver outro em andamento. */
    async insertActiveSessionIfAbsent(userId, active) {
      await run(
        client.from(TABLES.activeSessions).upsert(activeSessionToRow(active, userId), { onConflict: 'user_id', ignoreDuplicates: true }),
        'migrar o cronômetro',
      );
    },

    saveProfile,

    /**
     * Importação de backup numa única transação (função import_backup do
     * banco). Ou tudo é gravado, ou nada muda. O user_id de cada linha é o
     * da conta logada (o banco ignora o que vier no arquivo).
     * @param request { mode: 'merge'|'replace', books, sessions, activeSession?, settings?, goals? }
     */
    async importBackup(userId, { mode, books = [], sessions = [], activeSession = null, settings = null, goals = null }) {
      const params = {
        p_mode: mode,
        p_books: books.map((b) => bookToRow(b, userId)),
        p_sessions: sessions.map((s) => sessionToRow(s, userId)),
        p_active_session: activeSession ? activeSessionToRow(activeSession, userId) : null,
        p_profile: settings || goals ? profileToRow({ settings, goals }, userId) : null,
      };
      const result = await run(client.rpc('import_backup', params), 'importar o backup');
      return {
        books: Number(result?.books ?? 0),
        sessions: Number(result?.sessions ?? 0),
        activeSession: Number(result?.activeSession ?? 0),
      };
    },

    /** Ids existentes no banco (verificação pós-migração). */
    async listIds(userId) {
      const ids = async (name) => {
        const { table, key } = COLLECTIONS[name];
        const out = new Set();
        for (let from = 0; ; from += PAGE_SIZE) {
          const page = await run(
            client.from(table).select(key).eq('user_id', userId).order(key, { ascending: true }).range(from, from + PAGE_SIZE - 1),
            'conferir a migração',
          );
          for (const row of page ?? []) out.add(row[key]);
          if (!page || page.length < PAGE_SIZE) return out;
        }
      };
      const [books, sessions, achievements] = await Promise.all([
        ids('books'),
        ids('sessions'),
        ids('achievements'),
      ]);
      return { books, sessions, achievements };
    },
  };
}
