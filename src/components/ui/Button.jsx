import { Link } from 'react-router';
import './Button.css';

/**
 * Botão do design system.
 * - variant: 'primary' | 'secondary' | 'ghost' | 'danger'
 * - size: 'sm' | 'md' | 'lg'
 * - to: se informado, renderiza um <Link> do React Router
 * - icon: componente do lucide-react exibido antes do texto
 * - iconOnly: esconde o texto visualmente (continua acessível)
 */
export function Button({
  variant = 'primary',
  size = 'md',
  to,
  icon: Icon,
  iconOnly = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, iconOnly && 'btn--icon-only', className]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden="true" />}
      <span className={iconOnly ? 'visually-hidden' : undefined}>{children}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} {...rest}>
      {content}
    </button>
  );
}
