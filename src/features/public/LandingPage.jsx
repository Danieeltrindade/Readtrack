import { useLocation } from 'react-router';
import { ArrowRight, BookOpenCheck, ChartColumn, FlaskConical, LogIn, ShieldCheck, Timer, Trophy, UserPlus } from 'lucide-react';
import { Brand } from '../../components/layout/Brand.jsx';
import { Button } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PUBLIC_ROUTES } from '../../app/paths.js';
import './Landing.css';

const FEATURES = [
  { icon: Timer, title: 'Cronômetro e registros', text: 'Cronometre sessões com pausas ou registre à mão leituras anotadas no caderno, com observações e vocabulário.' },
  { icon: ChartColumn, title: 'Estatísticas honestas', text: 'Dia, semana, mês, 3 meses ou todo o histórico, calculados só do que você leu — nada é estimado.' },
  { icon: Trophy, title: 'Metas e conquistas', text: 'Meta diária de minutos, meta semanal de páginas e conquistas por níveis com o progresso de cada uma.' },
  { icon: ShieldCheck, title: 'Seus dados, sua conta', text: 'Cada conta só enxerga os próprios registros (Row Level Security). Exporte um backup em JSON quando quiser.' },
];

/** Página inicial pública: o que é o ReadTrack e três caminhos — demonstração, cadastro e login. */
export default function LandingPage() {
  useDocumentTitle(null);
  const auth = useAuth({ start: true });
  const location = useLocation();
  const signedIn = auth.configured && Boolean(auth.user);
  const justSignedOut = Boolean(location.state?.signedOut);

  return (
    <div className="landing">
      <header className="landing__header">
        <Brand to={PUBLIC_ROUTES.home} />
        <nav aria-label="Conta" className="landing__header-nav">
          {signedIn ? (
            <Button to={PUBLIC_ROUTES.app} variant="secondary" size="sm" icon={ArrowRight}>
              Minha área
            </Button>
          ) : (
            <Button to={PUBLIC_ROUTES.login} variant="ghost" size="sm" icon={LogIn}>
              Entrar
            </Button>
          )}
        </nav>
      </header>

      <main id="conteudo" className="landing__main">
        {justSignedOut && !signedIn && (
          <p className="landing__notice" role="status">
            Você saiu da conta. Seus dados continuam salvos nela.
          </p>
        )}
        <section className="landing__hero" aria-labelledby="landing-title">
          <div className="landing__intro">
            <p className="landing__eyebrow">Acompanhamento pessoal de leitura</p>
            <h1 id="landing-title" className="landing__title">
              Saiba quanto, quando e como você lê.
            </h1>
            <p className="landing__lead">
              Cadastre seus livros, registre cada sessão de leitura e acompanhe estatísticas, metas e conquistas calculadas a partir do
              que você realmente leu.
            </p>
            <div className="landing__actions">
              <Button to={PUBLIC_ROUTES.demo} size="lg" icon={FlaskConical}>
                Experimentar demonstração
              </Button>
              {signedIn ? (
                <Button to={PUBLIC_ROUTES.app} size="lg" variant="secondary" icon={ArrowRight}>
                  Continuar como {auth.user.email}
                </Button>
              ) : (
                <>
                  <Button to={PUBLIC_ROUTES.register} size="lg" variant="secondary" icon={UserPlus}>
                    Criar minha conta
                  </Button>
                  <Button to={PUBLIC_ROUTES.login} size="lg" variant="ghost" icon={LogIn}>
                    Entrar
                  </Button>
                </>
              )}
            </div>
            <p className="landing__hint">
              A demonstração usa dados fictícios e não precisa de cadastro. Sua conta começa vazia.
              {!auth.configured && ' Nesta instalação as contas não estão configuradas: use a demonstração ou o modo local.'}
            </p>
          </div>

          <div className="landing__shelf" aria-hidden="true">
            {['#6B3A3A', '#36575C', '#3F5A4A', '#6A5130', '#2F4468', '#4E4A6E', '#5A4366'].map((color, i) => (
              <span key={color} className={`landing__spine landing__spine--${i}`} style={{ '--spine': color }}>
                {i === 4 && <span className="landing__ribbon" />}
              </span>
            ))}
          </div>
        </section>

        <section className="landing__features" aria-label="O que o ReadTrack faz">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="landing__feature">
              <Icon size={20} aria-hidden="true" className="landing__feature-icon" />
              <h2 className="landing__feature-title">{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="landing__footer">
        <BookOpenCheck size={16} aria-hidden="true" />
        <p>ReadTrack · projeto de portfólio feito com React, Vite e Supabase.</p>
      </footer>
    </div>
  );
}
