/**
 * Autenticação (Supabase Auth, e-mail e senha). Os componentes usam só
 * estas funções; nenhum deles toca em `supabase.auth` diretamente.
 */

export const PASSWORD_MIN = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validação local antes de chamar o servidor. */
export function validateCredentials({ email, password }, { signUp = false } = {}) {
  const errors = {};
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  if (!cleanEmail) errors.email = 'Informe seu e-mail.';
  else if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = 'Este e-mail não parece válido.';
  const pass = String(password ?? '');
  if (!pass) errors.password = 'Informe sua senha.';
  else if (signUp && pass.length < PASSWORD_MIN) errors.password = `Use pelo menos ${PASSWORD_MIN} caracteres.`;
  return { valid: Object.keys(errors).length === 0, errors, data: { email: cleanEmail, password: pass } };
}

/** Mensagens do Supabase Auth → português. */
export function translateAuthError(error) {
  const code = error?.code ?? '';
  const message = String(error?.message ?? '');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message))
    return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (code === 'user_already_exists' || /already registered/i.test(message)) return 'Já existe uma conta com este e-mail. Tente entrar.';
  if (code === 'weak_password' || (/password/i.test(message) && /least|weak|short/i.test(message)))
    return `Senha fraca. Use pelo menos ${PASSWORD_MIN} caracteres, misturando letras e números.`;
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit/i.test(message))
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (code === 'signup_disabled' || /signups not allowed/i.test(message)) return 'O cadastro de novas contas está desativado neste projeto.';
  if (code === 'same_password' || /different from the old password/i.test(message)) return 'A nova senha precisa ser diferente da atual.';
  if (code === 'session_not_found' || /auth session missing/i.test(message))
    return 'O link não é mais válido ou a sessão expirou. Peça um novo link de recuperação.';
  if (code === 'email_address_invalid' || /invalid format|email address .* is invalid/i.test(message)) return 'Este e-mail não é aceito. Confira o endereço.';
  if (error?.name === 'AuthRetryableFetchError' || /fetch|network/i.test(message))
    return 'Sem conexão com o servidor de login. Verifique sua internet.';
  return message ? `Não foi possível concluir: ${message}` : 'Não foi possível concluir. Tente novamente.';
}

/**
 * @param redirects endereços absolutos para onde os links de e-mail levam:
 *   signUpRedirect (confirmação de conta → área pessoal) e
 *   resetRedirect (recuperação → tela de nova senha). Precisam estar na lista
 *   "Redirect URLs" do Supabase (veja o README).
 */
export function createAuthService(client, { signUpRedirect, resetRedirect } = {}) {
  const auth = client.auth;
  const fallback = typeof window !== 'undefined' ? window.location.origin : undefined;
  return {
    async getUser() {
      const { data, error } = await auth.getSession();
      if (error) throw error;
      return data.session?.user ?? null;
    },

    /** Avisa a cada login, logout ou renovação de sessão. Retorna o cancelamento. */
    onChange(callback) {
      const { data } = auth.onAuthStateChange((event, session) => callback(event, session?.user ?? null));
      return () => data.subscription.unsubscribe();
    },

    async signIn(values) {
      const { valid, errors, data } = validateCredentials(values);
      if (!valid) return { ok: false, errors };
      const { data: result, error } = await auth.signInWithPassword(data);
      if (error) return { ok: false, errors: { form: translateAuthError(error) } };
      return { ok: true, user: result.user };
    },

    async signUp(values) {
      const { valid, errors, data } = validateCredentials(values, { signUp: true });
      if (!valid) return { ok: false, errors };
      const { data: result, error } = await auth.signUp({
        ...data,
        options: { emailRedirectTo: signUpRedirect ?? fallback },
      });
      if (error) return { ok: false, errors: { form: translateAuthError(error) } };
      // Com confirmação de e-mail ligada e o e-mail já cadastrado, o Supabase
      // não revela a conta: devolve um usuário sem identidades e não envia nada.
      if (!result.session && Array.isArray(result.user?.identities) && result.user.identities.length === 0) {
        return { ok: false, errors: { form: 'Já existe uma conta com este e-mail. Entre ou use "Esqueci minha senha".' } };
      }
      // Com confirmação de e-mail ligada, não há sessão até o usuário clicar no link.
      return { ok: true, user: result.user, needsConfirmation: !result.session };
    },

    async resetPassword(email) {
      const { valid, errors, data } = validateCredentials({ email, password: 'x' });
      if (!valid) return { ok: false, errors: { email: errors.email } };
      const { error } = await auth.resetPasswordForEmail(data.email, {
        redirectTo: resetRedirect ?? fallback,
      });
      if (error) return { ok: false, errors: { form: translateAuthError(error) } };
      return { ok: true };
    },

    /** Nova senha (depois de abrir o link de recuperação enviado por e-mail). */
    async updatePassword(password) {
      const { valid, errors } = validateCredentials({ email: 'a@b.co', password }, { signUp: true });
      if (!valid) return { ok: false, errors: { password: errors.password } };
      const { error } = await auth.updateUser({ password });
      if (error) return { ok: false, errors: { form: translateAuthError(error) } };
      return { ok: true };
    },

    async signOut() {
      const { error } = await auth.signOut();
      if (error) return { ok: false, error: translateAuthError(error) };
      return { ok: true };
    },
  };
}
