import { useContext } from 'react';
import { DataContext } from '../context/DataContext.js';

/** Acesso aos livros, sessões, metas e ações de dados. */
export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData precisa estar dentro de <DataProvider>.');
  return context;
}
