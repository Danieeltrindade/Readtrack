/**
 * Persistência LOCAL (localStorage) — o comportamento original do ReadTrack.
 * Usada quando o Supabase não está configurado ou quando o usuário escolhe
 * explicitamente o modo local.
 *
 * Interface comum às persistências (local e remota):
 *   mode, boot(), save(data), subscribe(onExternalData), backup(data),
 *   listBackups(), deleteBackups()
 */
import { createEmptyData, normalizeData } from '../storage/schema.js';
import {
  LOAD_STATUS,
  backupCurrentData,
  deleteBackups,
  listBackups,
  loadData,
  saveData,
  subscribe,
} from '../storage/storageService.js';

/**
 * Decide o estado inicial a partir do que está salvo.
 * Primeira visita (nada salvo) → área pessoal VAZIA (1.6.0). Os dados
 * fictícios ficam só na demonstração pública (/demo), em outra área.
 */
function computeInitialState() {
  const result = loadData();

  switch (result.status) {
    case LOAD_STATUS.OK:
    case LOAD_STATUS.RECOVERED:
      return { data: result.data, status: result.status, message: result.error ?? null, canPersist: true };

    case LOAD_STATUS.EMPTY:
      return { data: createEmptyData(), status: result.status, message: null, canPersist: true };

    case LOAD_STATUS.NEWER_VERSION: {
      let data;
      try {
        data = normalizeData(result.data).data;
      } catch {
        data = createEmptyData();
      }
      return { data, status: result.status, message: result.error, canPersist: false };
    }

    case LOAD_STATUS.UNAVAILABLE:
      return { data: createEmptyData(), status: result.status, message: result.error, canPersist: false };

    case LOAD_STATUS.CORRUPTED:
    default:
      return { data: createEmptyData(), status: result.status, message: result.error, canPersist: true };
  }
}

export function createLocalPersistence() {
  // Lê o armazenamento UMA vez por instância. O StrictMode do React chama
  // inicializadores de estado duas vezes; sem este cache, a leitura (que pode
  // criar cópias de segurança) se repetiria.
  let boot = null;

  return {
    mode: 'local',
    boot() {
      boot ??= computeInitialState();
      return boot;
    },
    save: (data) => saveData(data),
    /** Alterações feitas em outra aba do mesmo navegador. */
    subscribe(onExternalData) {
      return subscribe(() => {
        const result = loadData();
        if (result.data && (result.status === LOAD_STATUS.OK || result.status === LOAD_STATUS.RECOVERED)) {
          onExternalData(result.data);
        }
      });
    },
    backup: () => backupCurrentData(),
    listBackups,
    deleteBackups,
  };
}
