import './Panel.css';

/**
 * Superfície de conteúdo. `title` vira um <h2> e `action` fica à direita
 * do título (ex.: link "Ver tudo").
 */
export function Panel({ title, titleId, action, as: Tag = 'section', className = '', children, ...rest }) {
  const headingId = titleId ?? (title ? `panel-${String(title).toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <Tag className={`panel ${className}`} aria-labelledby={title ? headingId : undefined} {...rest}>
      {(title || action) && (
        <header className="panel__header">
          {title && (
            <h2 id={headingId} className="panel__title">
              {title}
            </h2>
          )}
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}
