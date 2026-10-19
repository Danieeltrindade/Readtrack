import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { KeyRound, LogIn, MailCheck, Send, UserPlus } from 'lucide-react';
import { Button, Field, LoadingState } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PASSWORD_MIN, validateCredentials } from '../../services/supabase/authService.js';
import { PUBLIC_ROUTES, safeNextPath } from '../../app/paths.js';
import { AccountsUnavailable, AuthFrame } from './AuthScreens.jsx';

/* Telas públicas de conta: login, cadastro, "esqueci a senha" e nova senha.
   Todas usam o Supabase Auth de verdade (nada é simulado localmente). */

/** Mensagem de erro/aviso que recebe o foco (leitores de tela anunciam). */
function Alert({ kind = 'error', children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, [children]);
  if (!children) return null;
  return (
    <div ref={ref} tabIndex={-1} className={kind === 'error' ? 'form-alert' : 'auth__notice'} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

function useFormValues(initial) {
  const [values, setValues] = useState(initial);
  const bind = (name) => ({
    name,
    value: values[name],
    onChange: (event) => setValues((current) => ({ ...current, [name]: event.target.value })),
  });
  return [values, bind];
}

/* ---------- Login ---------- */

export function LoginPage() {
  useDocumentTitle('Entrar');
  const auth = useAuth({ start: true });
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const navigate = useNavigate();
  const [values, bind] = useFormValues({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (auth.configured && auth.user && !auth.recovery) return <Navigate to={next} replace />;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy || !auth.service) return;
    setBusy(true);
    setErrors({});
    auth.clearLinkError();
    const result = await auth.service.signIn(values);
    setBusy(false);
    if (!result.ok) setErrors(result.errors ?? {});
    else navigate(next, { replace: true });
  };

  return (
    <AuthFrame labelledBy="login-title">
      <h1 id="login-title" className="auth__title">
        Entrar no ReadTrack
      </h1>
      <p className="auth__lead">Seus livros, sessões e metas ficam na sua conta e aparecem em qualquer dispositivo.</p>
      {!auth.configured ? (
        <AccountsUnavailable problem={auth.configProblem} />
      ) : (
        <>
          <Alert>{errors.form ?? auth.linkError?.message ?? auth.error}</Alert>
          <form className="auth__form" onSubmit={onSubmit} noValidate>
            <Field label="E-mail" required error={errors.email}>
              <input className="input" type="email" autoComplete="email" inputMode="email" {...bind('email')} />
            </Field>
            <Field label="Senha" required error={errors.password}>
              <input className="input" type="password" autoComplete="current-password" {...bind('password')} />
            </Field>
            <Button type="submit" icon={LogIn} disabled={busy || !auth.service} className="auth__submit">
              {busy ? 'Entrando…' : auth.service ? 'Entrar' : 'Carregando…'}
            </Button>
          </form>
          <div className="auth__switch">
            <Link className="auth__link" to={PUBLIC_ROUTES.register}>
              Criar uma conta
            </Link>
            <Link className="auth__link" to={PUBLIC_ROUTES.forgotPassword}>
              Esqueci minha senha
            </Link>
          </div>
        </>
      )}
    </AuthFrame>
  );
}

/* ---------- Cadastro ---------- */

export function RegisterPage() {
  useDocumentTitle('Criar conta');
  const auth = useAuth({ start: true });
  const navigate = useNavigate();
  const [values, bind] = useFormValues({ email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  if (auth.configured && auth.user && !sentTo) return <Navigate to={PUBLIC_ROUTES.app} replace />;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy || !auth.service) return;
    // Todos os problemas de uma vez: e-mail, senha e confirmação.
    const { errors: found } = validateCredentials(values, { signUp: true });
    if (!values.confirm) found.confirm = 'Repita a senha.';
    else if (values.confirm !== values.password) found.confirm = 'As senhas não são iguais.';
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setBusy(true);
    setErrors({});
    const result = await auth.service.signUp({ email: values.email, password: values.password });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      return;
    }
    if (result.needsConfirmation) setSentTo(values.email.trim().toLowerCase());
    else navigate(PUBLIC_ROUTES.app, { replace: true }); // confirmação desligada: já entrou
  };

  if (sentTo) {
    return (
      <AuthFrame labelledBy="register-done-title">
        <MailCheck size={28} aria-hidden="true" className="auth__icon" />
        <h1 id="register-done-title" className="auth__title">
          Confirme seu e-mail
        </h1>
        <Alert kind="info">
          Enviamos um link de confirmação para <strong>{sentTo}</strong>. Abra-o neste dispositivo para ativar a conta e entrar na sua
          área pessoal. Não chegou? Confira a caixa de spam e aguarde alguns minutos.
        </Alert>
        <Button to={PUBLIC_ROUTES.login} variant="secondary" icon={LogIn}>
          Já confirmei: entrar
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame labelledBy="register-title">
      <h1 id="register-title" className="auth__title">
        Criar sua conta
      </h1>
      <p className="auth__lead">A conta começa vazia: você cadastra seus livros e sessões, ou importa um backup seu depois.</p>
      {!auth.configured ? (
        <AccountsUnavailable problem={auth.configProblem} />
      ) : (
        <>
          <Alert>{errors.form ?? auth.error}</Alert>
          <form className="auth__form" onSubmit={onSubmit} noValidate>
            <Field label="E-mail" required error={errors.email}>
              <input className="input" type="email" autoComplete="email" inputMode="email" {...bind('email')} />
            </Field>
            <Field label="Senha" required error={errors.password} hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}>
              <input className="input" type="password" autoComplete="new-password" {...bind('password')} />
            </Field>
            <Field label="Confirme a senha" required error={errors.confirm}>
              <input className="input" type="password" autoComplete="new-password" {...bind('confirm')} />
            </Field>
            <Button type="submit" icon={UserPlus} disabled={busy || !auth.service} className="auth__submit">
              {busy ? 'Criando conta…' : auth.service ? 'Criar conta' : 'Carregando…'}
            </Button>
          </form>
          <div className="auth__switch">
            <Link className="auth__link" to={PUBLIC_ROUTES.login}>
              Já tenho conta: entrar
            </Link>
          </div>
        </>
      )}
    </AuthFrame>
  );
}

/* ---------- Esqueci minha senha ---------- */

export function ForgotPasswordPage() {
  useDocumentTitle('Recuperar senha');
  const auth = useAuth({ start: true });
  const [values, bind] = useFormValues({ email: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy || !auth.service) return;
    setBusy(true);
    setErrors({});
    auth.clearLinkError();
    const result = await auth.service.resetPassword(values.email);
    setBusy(false);
    if (!result.ok) setErrors(result.errors ?? {});
    else setSent(true);
  };

  return (
    <AuthFrame labelledBy="forgot-title">
      <h1 id="forgot-title" className="auth__title">
        Recuperar senha
      </h1>
      <p className="auth__lead">Informe o e-mail da conta. Você receberá um link para criar uma nova senha.</p>
      {!auth.configured ? (
        <AccountsUnavailable problem={auth.configProblem} />
      ) : sent ? (
        <Alert kind="info">
          Se houver uma conta com este e-mail, o link chegará em alguns minutos. Abra-o neste dispositivo; ele leva para a tela de nova senha.
        </Alert>
      ) : (
        <>
          <Alert>{errors.form ?? auth.linkError?.message ?? auth.error}</Alert>
          <form className="auth__form" onSubmit={onSubmit} noValidate>
            <Field label="E-mail" required error={errors.email}>
              <input className="input" type="email" autoComplete="email" inputMode="email" {...bind('email')} />
            </Field>
            <Button type="submit" icon={Send} disabled={busy || !auth.service} className="auth__submit">
              {busy ? 'Enviando…' : 'Enviar link'}
            </Button>
          </form>
        </>
      )}
      <div className="auth__switch">
        <Link className="auth__link" to={PUBLIC_ROUTES.login}>
          Voltar para o login
        </Link>
      </div>
    </AuthFrame>
  );
}

/* ---------- Nova senha (link do e-mail de recuperação) ---------- */

export function ResetPasswordPage() {
  useDocumentTitle('Nova senha');
  const auth = useAuth({ start: true });
  const navigate = useNavigate();
  const toast = useToast();
  const [values, bind] = useFormValues({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy || !auth.service) return;
    const { errors: found } = validateCredentials({ email: 'a@b.co', password: values.password }, { signUp: true });
    if (!values.confirm) found.confirm = 'Repita a nova senha.';
    else if (values.confirm !== values.password) found.confirm = 'As senhas não são iguais.';
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setBusy(true);
    setErrors({});
    const result = await auth.service.updatePassword(values.password);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      return;
    }
    auth.finishRecovery();
    toast.success('Senha alterada. Você já está na sua conta.');
    navigate(PUBLIC_ROUTES.app, { replace: true });
  };

  let body;
  if (!auth.configured) body = <AccountsUnavailable problem={auth.configProblem} />;
  else if (auth.status !== 'ready' && auth.status !== 'error') body = <LoadingState label="Conferindo o link…" />;
  else if (!auth.user) {
    body = (
      <>
        <Alert>{auth.linkError?.message ?? auth.error ?? 'Este link de recuperação não é válido ou já expirou.'}</Alert>
        <Button to={PUBLIC_ROUTES.forgotPassword} icon={Send}>
          Pedir um novo link
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <Alert>{errors.form}</Alert>
        <p className="auth__lead">
          Conta: <strong>{auth.user.email}</strong>
        </p>
        <form className="auth__form" onSubmit={onSubmit} noValidate>
          <Field label="Nova senha" required error={errors.password} hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}>
            <input className="input" type="password" autoComplete="new-password" {...bind('password')} />
          </Field>
          <Field label="Confirme a nova senha" required error={errors.confirm}>
            <input className="input" type="password" autoComplete="new-password" {...bind('confirm')} />
          </Field>
          <Button type="submit" icon={KeyRound} disabled={busy} className="auth__submit">
            {busy ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </form>
      </>
    );
  }

  return (
    <AuthFrame labelledBy="reset-title">
      <h1 id="reset-title" className="auth__title">
        Defina uma nova senha
      </h1>
      {body}
    </AuthFrame>
  );
}
