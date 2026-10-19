/**
 * Leitura e validação das variáveis de ambiente do Supabase.
 *
 * Só a chave PÚBLICA pode ir para o navegador:
 * - "publishable key" (sb_publishable_…) — formato novo; ou
 * - "anon key" (JWT com role "anon") — formato antigo.
 * A chave service_role / secret ignora a RLS e NUNCA deve estar no frontend:
 * se for detectada, o app se recusa a usá-la.
 */

export const ENV_KEYS = Object.freeze({
  url: 'VITE_SUPABASE_URL',
  key: 'VITE_SUPABASE_PUBLISHABLE_KEY',
  legacyKey: 'VITE_SUPABASE_ANON_KEY',
});

/** Lê o "role" de um JWT sem validá-lo (só para detectar a chave errada). */
function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded))?.role ?? null;
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * @param {Record<string, string|undefined>} env  normalmente import.meta.env
 * @returns {{ configured: boolean, url: string|null, key: string|null, problem: string|null }}
 *   configured=false + problem=null  → variáveis ausentes (modo local normal)
 *   configured=false + problem=texto → variáveis presentes, porém inválidas/inseguras
 */
export function readSupabaseConfig(env = {}) {
  const url = String(env[ENV_KEYS.url] ?? '').trim();
  const key = String(env[ENV_KEYS.key] ?? env[ENV_KEYS.legacyKey] ?? '').trim();
  const off = (problem = null) => ({ configured: false, url: null, key: null, problem });

  if (!url && !key) return off();
  if (!url) return off(`Falta a variável ${ENV_KEYS.url}.`);
  if (!key) return off(`Falta a variável ${ENV_KEYS.key} (ou ${ENV_KEYS.legacyKey}).`);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return off(`${ENV_KEYS.url} não é um endereço válido.`);
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost(parsed.hostname))) {
    return off(`${ENV_KEYS.url} precisa usar https://.`);
  }

  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return off(
      'A chave configurada é secreta (service_role/secret) e daria acesso total ao banco. ' +
        'Use somente a chave pública (publishable/anon) no frontend e troque a chave secreta no painel do Supabase.',
    );
  }
  const looksPublic = key.startsWith('sb_publishable_') || jwtRole(key) === 'anon';
  if (!looksPublic) return off('A chave do Supabase não parece ser uma chave pública (publishable ou anon).');

  return { configured: true, url: parsed.origin, key, problem: null };
}
