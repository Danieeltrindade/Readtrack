import { createContext } from 'react';

/**
 * Em qual espaço as telas do app estão: 'account' (/app) ou 'demo' (/demo).
 * Valor padrão: área pessoal na raiz (usado em testes de componentes isolados).
 */
export const WorkspaceContext = createContext({ kind: 'account', base: '' });
