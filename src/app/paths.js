/**
 * Endereços públicos do site e caminhos dos dois "espaços" que usam as
 * mesmas telas do app:
 *   /app/...   área pessoal (conta no Supabase, ou modo local sem Supabase)
 *   /demo/...  demonstração pública com dados fictícios
 *
 * As telas usam usePaths() (hooks/useWorkspace.js), que devolve os mesmos
 * nomes de ROUTES já com o prefixo do espaço atual.
 */
import { ROUTES } from './routes.js';

export const PUBLIC_ROUTES = Object.freeze({
  home: '/',
  demo: '/demo',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  app: '/app',
});

export const WORKSPACE_BASES = Object.freeze({ account: PUBLIC_ROUTES.app, demo: PUBLIC_ROUTES.demo });

/** '/biblioteca' dentro de '/app' → '/app/biblioteca'; '/' → '/app'. */
export function joinPath(base, path) {
  if (!base) return path;
  return path === '/' ? base : `${base}${path}`;
}

/** Mesmo formato de ROUTES, com o prefixo do espaço. */
export function buildPaths(base) {
  const out = {};
  for (const [key, value] of Object.entries(ROUTES)) {
    out[key] = typeof value === 'function' ? (id) => joinPath(base, value(id)) : joinPath(base, value);
  }
  return Object.freeze(out);
}

/** Caminho de rota relativo (para <Route path>): '/livros/:bookId' → 'livros/:bookId'. */
export const routePath = (path) => path.replace(/^\//, '');

/**
 * Só aceita voltar para dentro da área pessoal depois do login
 * (evita redirecionamento aberto para outro site via ?next=).
 */
export function safeNextPath(value) {
  const next = typeof value === 'string' ? value : '';
  if (!next.startsWith(PUBLIC_ROUTES.app)) return PUBLIC_ROUTES.app;
  if (next.startsWith('//') || next.includes('://') || next.includes('\\')) return PUBLIC_ROUTES.app;
  const rest = next.slice(PUBLIC_ROUTES.app.length);
  return rest === '' || rest.startsWith('/') || rest.startsWith('?') ? next : PUBLIC_ROUTES.app;
}

/**
 * Endereço absoluto de uma rota do site, respeitando o caminho base da
 * publicação (ex.: https://usuario.github.io/readtrack/reset-password).
 * Usado nos links de confirmação e recuperação enviados por e-mail.
 */
export function absoluteUrl(path, { origin = globalThis.location?.origin ?? '', base = import.meta.env?.BASE_URL ?? '/' } = {}) {
  const cleanBase = String(base || '/').replace(/\/+$/, '');
  return `${origin}${cleanBase}${path}`;
}

/** Caminho base do React Router: '/' em produção comum, '/readtrack' no GitHub Pages de projeto. */
export function routerBasename(base = import.meta.env?.BASE_URL ?? '/') {
  const clean = String(base || '/').replace(/\/+$/, '');
  return clean || '/';
}
