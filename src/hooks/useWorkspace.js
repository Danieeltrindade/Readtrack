import { useContext, useMemo } from 'react';
import { WorkspaceContext } from '../context/WorkspaceContext.js';
import { buildPaths, joinPath } from '../app/paths.js';
import { NAV_ITEMS } from '../app/navigation.js';

/** { kind: 'account' | 'demo', base: '/app' | '/demo' } */
export const useWorkspace = () => useContext(WorkspaceContext);

/** Caminhos das telas (mesmos nomes de ROUTES) dentro do espaço atual. */
export function usePaths() {
  const { base } = useWorkspace();
  return useMemo(() => buildPaths(base), [base]);
}

/** Itens de navegação com os caminhos do espaço atual. */
export function useNavItems() {
  const { base } = useWorkspace();
  return useMemo(() => NAV_ITEMS.map((item) => ({ ...item, to: joinPath(base, item.to) })), [base]);
}
