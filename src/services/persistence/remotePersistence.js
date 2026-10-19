/**
 * Persistência REMOTA (Supabase). Mesma interface da local; a tela não
 * precisa saber onde os dados ficam.
 *
 * - Os dados chegam já carregados (loadRemoteState) antes de a tela abrir.
 * - Cada mudança vai para a fila de sincronização (remoteSync).
 * - Ao voltar para a aba, os dados são relidos do banco (outro dispositivo
 *   pode ter alterado algo), mas só se não houver alterações pendentes aqui.
 */
import { createEmptyData, normalizeData } from '../storage/schema.js';
import { backupSnapshot, deleteBackups, listBackups } from '../storage/storageService.js';
import { createRemoteSync } from '../sync/remoteSync.js';

const REFRESH_MIN_INTERVAL = 30_000;

/** Linhas do banco → estado completo do app (mesmo formato do localStorage). */
export function toAppState(remote) {
  const { data, report } = normalizeData({
    ...createEmptyData(),
    books: remote.books,
    sessions: remote.sessions,
    activeSession: remote.activeSession,
    achievements: remote.achievements,
    settings: remote.settings,
    goals: remote.goals,
  });
  const dropped = report.dropped.books + report.dropped.sessions + report.dropped.activeSession;
  return { data, dropped };
}

export async function loadRemoteState(repository, userId) {
  return toAppState(await repository.loadAll(userId));
}

export function createRemotePersistence({ repository, userId, initial, onSyncStatus }) {
  const sync = createRemoteSync({ repository, userId, initialData: initial.data, onStatusChange: onSyncStatus });
  const message = initial.dropped
    ? `${initial.dropped} registro(s) do banco não passaram na validação do app e foram ignorados nesta tela (continuam no banco).`
    : null;

  return {
    mode: 'remote',
    sync,
    boot: () => ({ data: initial.data, status: 'ok', message, canPersist: true }),
    save(data) {
      sync.push(data);
      return { ok: true };
    },
    subscribe(onExternalData) {
      if (typeof document === 'undefined') return () => {};
      let lastRefresh = Date.now();
      let busy = false;
      const refresh = async () => {
        if (document.visibilityState !== 'visible' || busy) return;
        if (Date.now() - lastRefresh < REFRESH_MIN_INTERVAL || sync.hasPendingChanges()) return;
        busy = true;
        const before = sync.getLatest();
        try {
          const { data } = await loadRemoteState(repository, userId);
          // Se o usuário mexeu em algo durante a leitura, a leitura é descartada.
          if (sync.getLatest() === before && !sync.hasPendingChanges()) {
            sync.reset(data);
            onExternalData(data);
          }
          lastRefresh = Date.now();
        } catch {
          // Sem conexão: tenta na próxima volta à aba.
        } finally {
          busy = false;
        }
      };
      document.addEventListener('visibilitychange', refresh);
      return () => document.removeEventListener('visibilitychange', refresh);
    },
    backup: (data) => backupSnapshot(data),
    listBackups,
    deleteBackups,
  };
}
