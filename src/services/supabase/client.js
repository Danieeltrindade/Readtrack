/**
 * Cliente do Supabase, criado sob demanda.
 *
 * A biblioteca só é baixada quando o Supabase está configurado: no modo
 * local ela nem entra no carregamento da página (import dinâmico).
 * Usa apenas a chave PÚBLICA; a segurança dos dados vem da RLS no banco.
 */
import { readSupabaseConfig } from './config.js';

export const supabaseConfig = readSupabaseConfig(import.meta.env ?? {});

let clientPromise = null;

export function getSupabaseClient() {
  if (!supabaseConfig.configured) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: {
        persistSession: true, // mantém o login ao recarregar
        autoRefreshToken: true,
        detectSessionInUrl: true, // conclui o login vindo do link de confirmação por e-mail
      },
    }),
  );
  return clientPromise;
}
