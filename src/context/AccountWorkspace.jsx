import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { BackendContext } from './BackendContext.js';
import { WorkspaceContext } from './WorkspaceContext.js';
import { DataProvider } from './DataProvider.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { createRepository } from '../services/supabase/repository.js';
import { getSupabaseClient } from '../services/supabase/client.js';
import { createLocalPersistence } from '../services/persistence/localPersistence.js';
import { createRemotePersistence, loadRemoteState } from '../services/persistence/remotePersistence.js';
import { migrateLocalData, summarizeLocalData } from '../services/migration/localMigration.js';
import { clearLocalData, readLocalSnapshot, readMigrationMarker, writeMigrationMarker } from '../services/storage/storageService.js';
import { BackendErrorScreen, BackendLoadingScreen } from '../features/auth/AuthScreens.jsx';
import { PUBLIC_ROUTES, WORKSPACE_BASES } from '../app/paths.js';

const WORKSPACE = { kind: 'account', base: WORKSPACE_BASES.account };

/**
 * Área pessoal (/app). Decide ONDE os dados ficam e entrega a persistência
 * certa ao DataProvider:
 * - Supabase configurado → é preciso estar logado; os dados vêm da conta
 *   (visitante sem login vai para /login e volta para cá depois).
 * - Supabase não configurado (ex.: desenvolvimento sem .env) → modo local,
 *   com os dados só neste navegador e aviso explícito na tela.
 *
 * Os dados locais e os da conta NUNCA se misturam sozinhos: passar do
 * navegador para a conta é a migração, feita só quando o usuário pede.
 * A demonstração (/demo) tem outro provedor e outro armazenamento.
 */
export function AccountWorkspace({ children }) {
  const auth = useAuth({ start: true });
  const location = useLocation();

  if (!auth.configured) {
    return <LocalAccount problem={auth.configProblem}>{children}</LocalAccount>;
  }
  if (auth.status === 'idle' || auth.status === 'checking') return <BackendLoadingScreen label="Verificando sua conta…" />;
  if (auth.status === 'error') {
    return <BackendErrorScreen title="Não foi possível conectar ao Supabase" description={auth.error} onRetry={auth.retry} homeLink />;
  }
  if (auth.recovery) return <Navigate to={PUBLIC_ROUTES.resetPassword} replace />;
  if (!auth.user) {
    // Saiu pelo botão "Sair": volta ao início. Senão (sessão ausente ou expirada): login, voltando para cá depois.
    if (auth.lastEvent === 'MANUAL_SIGN_OUT') return <Navigate to={PUBLIC_ROUTES.home} replace state={{ signedOut: true }} />;
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`${PUBLIC_ROUTES.login}?next=${encodeURIComponent(next)}`} replace />;
  }
  return (
    <RemoteAccount key={auth.user.id} user={auth.user}>
      {children}
    </RemoteAccount>
  );
}

/* ---------- Sem Supabase: modo local ---------- */

function LocalAccount({ problem, children }) {
  const localReason = problem ? 'invalid-config' : 'not-configured';
  const [persistence] = useState(() => createLocalPersistence());
  const value = useMemo(
    () => ({
      configured: false,
      configProblem: problem,
      mode: 'local',
      localReason,
      user: null,
      syncStatus: null,
      refreshing: false,
      retrySync: () => {},
      signOut: async () => ({ ok: true }),
      migration: { summary: { isEmpty: true }, marker: null, lastResult: null, run: async () => ({ ok: false }), dismiss: () => {}, clearLocalCopy: () => ({ ok: false }) },
      importAtomic: null,
    }),
    [problem, localReason],
  );
  return (
    <WorkspaceContext.Provider value={WORKSPACE}>
      <BackendContext.Provider value={value}>
        <DataProvider persistence={persistence}>{children}</DataProvider>
      </BackendContext.Provider>
    </WorkspaceContext.Provider>
  );
}

/* ---------- Com Supabase: dados da conta ---------- */

function RemoteAccount({ user, children }) {
  const auth = useAuth();
  const userId = user.id;
  const [repository, setRepository] = useState(null);
  const [remote, setRemote] = useState({ status: 'loading', persistence: null, error: null, key: 0 });
  const [syncStatus, setSyncStatus] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [localSnapshot, setLocalSnapshot] = useState(null);
  const [migrationMarker, setMigrationMarker] = useState(null);
  const [lastMigration, setLastMigration] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSupabaseClient().then((client) => {
      if (!cancelled && client) setRepository(createRepository(client));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!repository) return undefined;
    let cancelled = false;
    setRemote((current) => (current.status === 'ready' ? { ...current, refreshing: true } : { status: 'loading', key: current.key }));
    loadRemoteState(repository, userId)
      .then((initial) => {
        if (cancelled) return;
        const persistence = createRemotePersistence({ repository, userId, initial, onSyncStatus: setSyncStatus });
        setSyncStatus(persistence.sync.getStatus());
        setRemote((current) => ({ status: 'ready', persistence, error: null, key: current.key + 1 }));
      })
      .catch((error) => {
        if (!cancelled) setRemote((current) => ({ status: 'error', error, key: current.key }));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, repository, reloadToken]);

  // Para a fila antiga quando a persistência é substituída (recarga dos dados).
  const activePersistence = remote.persistence;
  useEffect(() => () => activePersistence?.sync.dispose(), [activePersistence]);

  // Dados do modo local deste navegador que podem ser enviados para a conta.
  useEffect(() => {
    if (remote.status !== 'ready') return;
    setLocalSnapshot(readLocalSnapshot());
    setMigrationMarker(readMigrationMarker(userId));
  }, [userId, remote.status]);

  // Aviso ao fechar a aba com alterações ainda não enviadas ao banco.
  useEffect(() => {
    if (!activePersistence) return undefined;
    const onBeforeUnload = (event) => {
      if (!activePersistence.sync.hasPendingChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activePersistence]);

  const reloadRemote = useCallback(() => setReloadToken((n) => n + 1), []);
  const retrySync = useCallback(() => activePersistence?.sync.retry(), [activePersistence]);

  const signOut = useCallback(
    async ({ force = false } = {}) => {
      const sync = activePersistence?.sync;
      if (sync && !force) {
        const saved = await sync.flushNow();
        if (!saved || sync.hasPendingChanges()) {
          return { ok: false, pending: true, error: 'Algumas alterações ainda não foram salvas no banco.' };
        }
      }
      sync?.dispose();
      const result = await auth.signOut();
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    [activePersistence, auth],
  );

  /**
   * Importação de backup numa ÚNICA transação no banco (função
   * import_backup): ou entra tudo, ou nada muda. Antes, envia o que estiver
   * pendente; depois, relê a conta para a tela mostrar o que está gravado.
   */
  const importAtomic = useCallback(
    async (request) => {
      if (!repository || !activePersistence) return { ok: false, error: 'A conta ainda está carregando. Tente de novo.' };
      const saved = await activePersistence.sync.flushNow();
      if (!saved || activePersistence.sync.hasPendingChanges()) {
        return { ok: false, error: 'Há alterações da conta ainda não salvas (verifique a conexão). Nada foi importado.' };
      }
      try {
        const counts = await repository.importBackup(userId, request);
        reloadRemote();
        return { ok: true, counts };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },
    [repository, activePersistence, userId, reloadRemote],
  );

  const localSummary = useMemo(() => summarizeLocalData(localSnapshot), [localSnapshot]);

  const runMigration = useCallback(
    async ({ includePreferences = false } = {}) => {
      if (!activePersistence || !localSnapshot) return { ok: false, error: 'Não há dados locais para enviar.' };
      const saved = await activePersistence.sync.flushNow();
      if (!saved) return { ok: false, error: 'Salve as alterações pendentes da conta antes de migrar (verifique a conexão).' };
      let result;
      try {
        result = await migrateLocalData({ repository, userId, localData: localSnapshot, includePreferences });
      } catch (error) {
        result = { ok: false, error: error.message };
      }
      if (result.ok) {
        const marker = { status: 'done', at: new Date().toISOString(), counts: result.counts };
        writeMigrationMarker(userId, marker);
        setMigrationMarker(marker);
      }
      setLastMigration(result);
      if (!result.error) reloadRemote(); // mostra na tela o que agora está no banco
      return result;
    },
    [userId, activePersistence, localSnapshot, reloadRemote, repository],
  );

  const dismissMigration = useCallback(() => {
    const marker = { status: 'dismissed', at: new Date().toISOString() };
    writeMigrationMarker(userId, marker);
    setMigrationMarker(marker);
  }, [userId]);

  /** Só depois de uma migração conferida com sucesso. */
  const clearLocalCopy = useCallback(() => {
    if (migrationMarker?.status !== 'done') return { ok: false, error: 'Migre e confira os dados antes de apagar a cópia local.' };
    const ok = clearLocalData();
    if (ok) setLocalSnapshot(null);
    return { ok };
  }, [migrationMarker]);

  const value = useMemo(
    () => ({
      configured: true,
      configProblem: null,
      mode: 'remote',
      localReason: null,
      user,
      syncStatus,
      refreshing: Boolean(remote.refreshing),
      retrySync,
      signOut,
      importAtomic,
      migration: {
        summary: localSummary,
        marker: migrationMarker,
        lastResult: lastMigration,
        run: runMigration,
        dismiss: dismissMigration,
        clearLocalCopy,
      },
    }),
    [user, syncStatus, remote.refreshing, retrySync, signOut, importAtomic, localSummary, migrationMarker, lastMigration, runMigration, dismissMigration, clearLocalCopy],
  );

  let content;
  if (remote.status === 'error') {
    content = (
      <BackendErrorScreen
        title="Não foi possível carregar seus dados"
        description={remote.error?.message}
        onRetry={reloadRemote}
        onSignOut={() => signOut({ force: true })}
      />
    );
  } else if (remote.status !== 'ready' || !remote.persistence) {
    content = <BackendLoadingScreen label="Carregando seus dados…" />;
  } else {
    content = (
      <DataProvider key={`remote-${remote.key}`} persistence={remote.persistence}>
        {children}
      </DataProvider>
    );
  }

  return (
    <WorkspaceContext.Provider value={WORKSPACE}>
      <BackendContext.Provider value={value}>{content}</BackendContext.Provider>
    </WorkspaceContext.Provider>
  );
}
