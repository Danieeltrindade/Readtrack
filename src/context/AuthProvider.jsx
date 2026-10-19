import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AuthContext } from './AuthContext.js';
import { getSupabaseClient, supabaseConfig } from '../services/supabase/client.js';
import { createAuthService } from '../services/supabase/authService.js';
import { readAuthLinkError } from '../services/supabase/linkErrors.js';
import { PUBLIC_ROUTES, absoluteUrl } from '../app/paths.js';

/**
 * Login com Supabase Auth, para o site inteiro.
 *
 * - O cliente do Supabase só é carregado quando uma página de conta pede
 *   (useAuth({ start: true })): início, login, cadastro, recuperação e /app.
 *   A demonstração (/demo) nunca carrega o Supabase.
 * - status: 'off' (Supabase não configurado) | 'idle' (ainda não carregado)
 *   | 'checking' | 'ready' | 'error'.
 * - A sessão fica salva pelo próprio Supabase (persistSession): recarregar a
 *   página mantém o login.
 * - Link de recuperação de senha: o Supabase dispara PASSWORD_RECOVERY e o
 *   visitante é levado para /reset-password, onde define a nova senha.
 */
export function AuthProvider({ children }) {
  const configured = supabaseConfig.configured;
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState({ status: configured ? 'idle' : 'off', user: null, recovery: false, error: null, lastEvent: null });
  const [service, setService] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [requested, setRequested] = useState(false);
  // Erro de link de e-mail (expirado etc.), lido antes de o cliente limpar o endereço.
  const [linkError, setLinkError] = useState(() => readAuthLinkError());
  const manualSignOut = useRef(false);

  const start = useCallback(() => {
    if (configured) setRequested(true);
  }, [configured]);

  useEffect(() => {
    if (!configured || !requested) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};
    setState((current) => (current.status === 'ready' ? current : { ...current, status: 'checking', error: null }));
    getSupabaseClient()
      .then((client) => {
        if (cancelled) return;
        const auth = createAuthService(client, {
          signUpRedirect: absoluteUrl(PUBLIC_ROUTES.app),
          resetRedirect: absoluteUrl(PUBLIC_ROUTES.resetPassword),
        });
        setService(auth);
        // O primeiro evento (INITIAL_SESSION) informa se já havia login salvo.
        unsubscribe = auth.onChange((event, user) => {
          setState((current) => ({
            status: 'ready',
            error: null,
            user: user ? { id: user.id, email: user.email ?? '' } : null,
            recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : current.recovery,
            lastEvent: event === 'SIGNED_OUT' && manualSignOut.current ? 'MANUAL_SIGN_OUT' : event,
          }));
          if (event === 'SIGNED_OUT') manualSignOut.current = false;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', user: null, recovery: false, lastEvent: null, error: 'Não foi possível carregar o serviço de login do Supabase. Verifique sua conexão.' });
        }
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [configured, requested, attempt]);

  // Link de recuperação aberto em outra página (ex.: o Supabase voltou para o
  // endereço principal): leva para a tela de nova senha.
  useEffect(() => {
    if (state.recovery && location.pathname !== PUBLIC_ROUTES.resetPassword) {
      navigate(PUBLIC_ROUTES.resetPassword, { replace: true });
    }
  }, [state.recovery, location.pathname, navigate]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const clearLinkError = useCallback(() => setLinkError(null), []);
  const finishRecovery = useCallback(() => setState((current) => ({ ...current, recovery: false })), []);

  /** Sai da conta. Quem chamou decide para onde ir (a área pessoal leva ao início). */
  const signOut = useCallback(async () => {
    if (!service) return { ok: true };
    manualSignOut.current = true;
    const result = await service.signOut();
    if (!result.ok) manualSignOut.current = false;
    return result;
  }, [service]);

  const value = useMemo(
    () => ({
      configured,
      configProblem: supabaseConfig.problem,
      ...state,
      service,
      start,
      retry,
      signOut,
      linkError,
      clearLinkError,
      finishRecovery,
    }),
    [configured, state, service, start, retry, signOut, linkError, clearLinkError, finishRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
