import { TriangleAlert } from 'lucide-react';
import { Button } from './Button.jsx';
import './States.css';

/**
 * Tela vazia: explica o que falta e oferece a próxima ação.
 * `titleAs` mantém a hierarquia de títulos: 'h1' quando o estado é a página
 * inteira (ex.: 404), 'h2' abaixo do título da página (padrão), 'h3' em painéis.
 */
export function EmptyState({ icon: Icon, title, description, action, titleAs: Title = 'h2' }) {
  return (
    <div className="state state--empty">
      {Icon && (
        <div className="state__icon" aria-hidden="true">
          <Icon size={26} strokeWidth={1.6} />
        </div>
      )}
      <Title className="state__title">{title}</Title>
      {description && <p className="state__description">{description}</p>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

/** Carregamento com texto acessível. */
export function LoadingState({ label = 'Carregando…' }) {
  return (
    <div className="state state--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <p className="state__description">{label}</p>
    </div>
  );
}

/** Erro com descrição e, opcionalmente, botão de nova tentativa. */
export function ErrorState({ title = 'Algo deu errado', description, onRetry, retryLabel = 'Tentar de novo', titleAs: Title = 'h2' }) {
  return (
    <div className="state state--error" role="alert">
      <div className="state__icon" aria-hidden="true">
        <TriangleAlert size={26} strokeWidth={1.6} />
      </div>
      <Title className="state__title">{title}</Title>
      {description && <p className="state__description">{description}</p>}
      {onRetry && (
        <div className="state__action">
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
