/**
 * Camada de persistência. ÚNICO lugar do projeto que acessa o localStorage.
 * Componentes e contextos usam apenas loadData / saveData / subscribe.
 *
 * Proteções contra perda de dados:
 * 1. Se o JSON salvo estiver corrompido, ele é copiado para uma chave de
 *    backup ANTES de qualquer nova gravação.
 * 2. Se os dados vierem de uma versão mais nova do site, o app funciona
 *    em modo somente leitura para não sobrescrevê-los.
 * 3. Se o armazenamento estiver indisponível (modo privado, bloqueio),
 *    o app funciona em memória e avisa o usuário.
 */
import { SCHEMA_VERSION, migrate, normalizeData } from './schema.js';

export const STORAGE_KEY = 'readtrack:data';
export const BACKUP_PREFIX = 'readtrack:backup:';
// Demonstração pública: chave e cópias próprias (nunca começam com BACKUP_PREFIX).
export const DEMO_STORAGE_KEY = 'readtrack:demo';
export const DEMO_BACKUP_PREFIX = 'readtrack:demo-backup:';

/** Status possíveis retornados por loadData. */
export const LOAD_STATUS = Object.freeze({
  OK: 'ok',
  EMPTY: 'empty',
  RECOVERED: 'recovered', // carregou, mas precisou corrigir itens inválidos
  CORRUPTED: 'corrupted', // JSON ilegível; backup criado
  NEWER_VERSION: 'newer-version', // dados de uma versão futura; somente leitura
  UNAVAILABLE: 'unavailable', // localStorage inacessível
});

let cachedStorage;

/** Retorna o localStorage se ele realmente funcionar, senão null. */
function getStorage() {
  if (cachedStorage !== undefined) return cachedStorage;
  try {
    const storage = globalThis.localStorage;
    const probe = '__readtrack_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    cachedStorage = storage;
  } catch {
    cachedStorage = null;
  }
  return cachedStorage;
}

/** Apenas para testes: permite trocar o armazenamento. */
export function __setStorageForTests(storage) {
  cachedStorage = storage;
}

const MAX_BACKUPS = 5;

/**
 * Uma "área" de armazenamento: uma chave para os dados e um prefixo para as
 * cópias de segurança. Áreas diferentes NUNCA se enxergam:
 * - PERSONAL ('readtrack:data'): dados pessoais do modo local.
 * - DEMO ('readtrack:demo'): dados fictícios da demonstração pública.
 * Restaurar ou alterar a demonstração não toca nos dados pessoais, e
 * vice-versa (as cópias de segurança também têm prefixos separados).
 */
export function createStorageArea({ key, backupPrefix }) {
  function backupRaw(storage, raw) {
    const backupKey = `${backupPrefix}${new Date().toISOString()}`;
    try {
      storage.setItem(backupKey, raw);
      // Mantém só as cópias mais recentes para não esgotar o espaço.
      listBackups()
        .slice(MAX_BACKUPS)
        .forEach((old) => storage.removeItem(old));
      return backupKey;
    } catch {
      return null;
    }
  }

  /**
   * Lê os dados salvos.
   * @returns {{ status: string, data: object|null, error?: string, backupKey?: string, report?: object }}
   */
  function loadData() {
    const storage = getStorage();
    if (!storage) {
      return {
        status: LOAD_STATUS.UNAVAILABLE,
        data: null,
        error: 'O navegador não permite salvar dados neste site. Suas alterações valem só até fechar a aba.',
      };
    }

    let raw;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      return { status: LOAD_STATUS.UNAVAILABLE, data: null, error: `Falha ao ler os dados: ${error.message}` };
    }

    if (raw === null) return { status: LOAD_STATUS.EMPTY, data: null };

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const backupKey = backupRaw(storage, raw);
      return {
        status: LOAD_STATUS.CORRUPTED,
        data: null,
        backupKey,
        error: backupKey
          ? `Os dados salvos estavam ilegíveis. Uma cópia foi guardada em "${backupKey}".`
          : 'Os dados salvos estavam ilegíveis e não foi possível criar uma cópia de segurança.',
      };
    }

    if (Number(parsed?.version) > SCHEMA_VERSION) {
      return {
        status: LOAD_STATUS.NEWER_VERSION,
        data: parsed,
        error: 'Estes dados foram salvos por uma versão mais nova do ReadTrack. Nada será gravado para não perdê-los.',
      };
    }

    try {
      // Antes de converter dados de uma versão antiga, guarda o original.
      const fromVersion = Number(parsed?.version) || 1;
      if (fromVersion < SCHEMA_VERSION) backupRaw(storage, raw);

      const { data, report } = normalizeData(migrate(parsed));
      report.migratedFrom = fromVersion < SCHEMA_VERSION ? fromVersion : null;
      const dropped = report.dropped.books + report.dropped.sessions + (report.dropped.activeSession ?? 0);
      if (dropped > 0) {
        backupRaw(storage, raw);
        return {
          status: LOAD_STATUS.RECOVERED,
          data,
          report,
          error: `${dropped} registro(s) inválido(s) foram ignorados. Uma cópia do arquivo original foi guardada.`,
        };
      }
      return { status: LOAD_STATUS.OK, data, report };
    } catch (error) {
      const backupKey = backupRaw(storage, raw);
      return { status: LOAD_STATUS.CORRUPTED, data: null, backupKey, error: error.message };
    }
  }

  /**
   * Grava os dados. Nunca lança exceção: devolve { ok, error }.
   */
  function saveData(data) {
    const storage = getStorage();
    if (!storage) return { ok: false, error: 'Armazenamento local indisponível.' };
    try {
      const payload = {
        ...data,
        version: SCHEMA_VERSION,
        meta: { ...data.meta, updatedAt: new Date().toISOString() },
      };
      storage.setItem(key, JSON.stringify(payload));
      return { ok: true };
    } catch (error) {
      const quota = error?.name === 'QuotaExceededError' || error?.code === 22;
      return {
        ok: false,
        error: quota
          ? 'O espaço de armazenamento do navegador acabou. Exporte seus dados e remova itens antigos.'
          : `Não foi possível salvar: ${error.message}`,
      };
    }
  }

  /**
   * Guarda uma cópia dos dados atuais antes de uma operação destrutiva
   * (importar, limpar). Retorna a chave criada ou null.
   */
  function backupCurrentData() {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      return raw ? backupRaw(storage, raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Guarda uma cópia de um estado específico (ex.: os dados da conta antes
   * de importar ou limpar, no modo com banco). Retorna a chave ou null.
   */
  function backupSnapshot(data) {
    const storage = getStorage();
    if (!storage || !data) return null;
    try {
      return backupRaw(storage, JSON.stringify({ ...data, version: SCHEMA_VERSION }));
    } catch {
      return null;
    }
  }

  /**
   * Apaga os dados principais deste navegador (usado só depois de a
   * migração para a conta ter sido conferida). As cópias de segurança ficam.
   */
  function clearLocalData() {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  /** Apaga todas as cópias de segurança automáticas. */
  function deleteBackups() {
    const storage = getStorage();
    if (!storage) return 0;
    const keys = listBackups();
    keys.forEach((item) => {
      try {
        storage.removeItem(item);
      } catch {
        /* ignora */
      }
    });
    return keys.length;
  }

  /** Lista as cópias de segurança existentes (mais recente primeiro). */
  function listBackups() {
    const storage = getStorage();
    if (!storage) return [];
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const item = storage.key(i);
      if (item?.startsWith(backupPrefix)) keys.push(item);
    }
    return keys.sort().reverse();
  }

  /**
   * Observa alterações feitas em OUTRA aba do mesmo site.
   * Retorna a função para cancelar a inscrição.
   */
  function subscribe(callback) {
    if (typeof window === 'undefined') return () => {};
    const handler = (event) => {
      if (event.key === key) callback();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  return { key, backupPrefix, loadData, saveData, backupCurrentData, backupSnapshot, clearLocalData, deleteBackups, listBackups, subscribe };
}

export const PERSONAL_AREA = createStorageArea({ key: STORAGE_KEY, backupPrefix: BACKUP_PREFIX });
export const DEMO_AREA = createStorageArea({ key: DEMO_STORAGE_KEY, backupPrefix: DEMO_BACKUP_PREFIX });

// API original (área pessoal), usada pelo restante do app e pelos testes.
export const {
  loadData,
  saveData,
  backupCurrentData,
  backupSnapshot,
  clearLocalData,
  deleteBackups,
  listBackups,
  subscribe,
} = PERSONAL_AREA;

/* ---------- Preferências do modo de armazenamento ---------- */

const MODE_KEY = 'readtrack:mode';
const MIGRATION_PREFIX = 'readtrack:migration:';

function readJson(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** O usuário escolheu usar o modo local mesmo com o Supabase configurado? */
export const readLocalModeChoice = () => readJson(MODE_KEY)?.mode === 'local';
export const writeLocalModeChoice = (chosen) => writeJson(MODE_KEY, chosen ? { mode: 'local', at: new Date().toISOString() } : null);

/** Registro de migração concluída para uma conta (por id do usuário). */
export const readMigrationMarker = (userId) => readJson(`${MIGRATION_PREFIX}${userId}`);
export const writeMigrationMarker = (userId, marker) => writeJson(`${MIGRATION_PREFIX}${userId}`, marker);

/**
 * Dados locais para a migração (somente leitura). null se não houver nada
 * legível salvo neste navegador.
 */
export function readLocalSnapshot() {
  const result = loadData();
  return result.status === LOAD_STATUS.OK || result.status === LOAD_STATUS.RECOVERED ? result.data : null;
}
