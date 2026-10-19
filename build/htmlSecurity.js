/**
 * Política de segurança de conteúdo (CSP) do site publicado.
 *
 * O GitHub Pages não permite cabeçalhos HTTP próprios, então a política vai
 * numa <meta http-equiv="Content-Security-Policy"> inserida no index.html
 * durante o build (só no build: o servidor de desenvolvimento do Vite usa
 * scripts inline que a política bloquearia).
 *
 * Limites de uma CSP por <meta> (documentados no README): frame-ancestors
 * não vale por meta, então a proteção contra o site ser exibido dentro de
 * outro (clickjacking) depende de a hospedagem enviar cabeçalhos — a Vercel
 * envia (vercel.json); o GitHub Pages, não.
 */

/** Origem do Supabase a liberar em connect-src (https + wss do mesmo host). */
export function supabaseOrigins(url) {
  try {
    const parsed = new URL(String(url ?? '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const ws = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return [parsed.origin, `${ws}//${parsed.host}`];
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ supabaseUrl } = {}) {
  const supabase = supabaseOrigins(supabaseUrl) ?? ['https://*.supabase.co', 'wss://*.supabase.co'];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supabase.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Caminho base da publicação: '/' ou '/nome-do-repositorio/' (sempre com barras nas pontas). */
export function normalizeBasePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}
