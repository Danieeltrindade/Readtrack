import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext.js';

/**
 * Estado do login. Com `{ start: true }`, carrega o cliente do Supabase
 * (só as páginas que precisam de conta fazem isso; a demonstração não).
 */
export function useAuth({ start = false } = {}) {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  const { start: startAuth } = context;
  useEffect(() => {
    if (start) startAuth();
  }, [start, startAuth]);
  return context;
}
