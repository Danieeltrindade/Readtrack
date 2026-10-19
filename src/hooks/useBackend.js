import { useContext } from 'react';
import { BackendContext } from '../context/BackendContext.js';

/** Onde os dados estão (local ou conta), login e estado da sincronização. */
export function useBackend() {
  const context = useContext(BackendContext);
  if (!context) throw new Error('useBackend precisa estar dentro de <AccountWorkspace> ou <DemoWorkspace>.');
  return context;
}
