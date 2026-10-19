/**
 * Erros que o Supabase devolve no endereço quando um link de e-mail
 * (confirmação de conta ou recuperação de senha) não vale mais:
 *   .../reset-password#error=access_denied&error_code=otp_expired&error_description=...
 * Lidos ANTES de o cliente do Supabase limpar o endereço.
 */
export function readAuthLinkError(location = globalThis.location) {
  if (!location) return null;
  const params = new URLSearchParams(`${String(location.search ?? '').replace(/^\?/, '')}&${String(location.hash ?? '').replace(/^#/, '')}`);
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return null;
  return { code, message: describeLinkError(code, params.get('error_description')) };
}

export function describeLinkError(code, description = '') {
  if (code === 'otp_expired' || /expired/i.test(description ?? '')) {
    return 'Este link expirou ou já foi usado. Peça um novo link e use o mais recente que chegar.';
  }
  if (code === 'access_denied') return 'O link não pôde ser usado. Peça um novo link.';
  return description ? `O link não pôde ser usado: ${description}` : 'O link não pôde ser usado. Peça um novo link.';
}
