import { useMemo, useState } from 'react';
import { BackendContext } from './BackendContext.js';
import { WorkspaceContext } from './WorkspaceContext.js';
import { DataProvider } from './DataProvider.jsx';
import { createDemoPersistence } from '../services/persistence/demoPersistence.js';
import { WORKSPACE_BASES } from '../app/paths.js';

const WORKSPACE = { kind: 'demo', base: WORKSPACE_BASES.demo };

const DEMO_BACKEND = Object.freeze({
  configured: false,
  configProblem: null,
  mode: 'demo',
  localReason: null,
  user: null,
  syncStatus: null,
  refreshing: false,
  retrySync: () => {},
  signOut: async () => ({ ok: true }),
  importAtomic: null,
  migration: { summary: { isEmpty: true }, marker: null, lastResult: null, run: async () => ({ ok: false }), dismiss: () => {}, clearLocalCopy: () => ({ ok: false }) },
});

/**
 * Demonstração pública (/demo): as mesmas telas do app, com dados fictícios
 * guardados só na área de demonstração deste navegador. Sem login e sem
 * Supabase — nada daqui chega a uma conta, e nada de uma conta aparece aqui.
 */
export function DemoWorkspace({ children }) {
  const [persistence] = useState(() => createDemoPersistence());
  const backend = useMemo(() => DEMO_BACKEND, []);
  return (
    <WorkspaceContext.Provider value={WORKSPACE}>
      <BackendContext.Provider value={backend}>
        <DataProvider persistence={persistence}>{children}</DataProvider>
      </BackendContext.Provider>
    </WorkspaceContext.Provider>
  );
}
