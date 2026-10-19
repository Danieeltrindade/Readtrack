import './MetricStrip.css';

/**
 * Faixa de números com rótulo, valor e detalhe, separados por linhas
 * finas (como colunas de um registro). Quebra sozinha em telas menores.
 *
 * items: [{ label, value, detail?, icon?, tone?: 'muted' | 'highlight' }]
 */
export function MetricStrip({ items, label, columns }) {
  return (
    <section className="metric-strip" aria-label={label}>
      <dl className="metric-strip__list" style={columns ? { '--metric-columns': columns } : undefined}>
        {items.map(({ label: itemLabel, value, detail, icon: Icon, tone }) => (
          <div key={itemLabel} className={`metric-strip__item ${tone ? `is-${tone}` : ''}`}>
            <dt>
              {Icon && <Icon size={16} aria-hidden="true" />}
              {itemLabel}
            </dt>
            <dd className="metric-strip__value tabular">{value}</dd>
            {detail && <dd className="metric-strip__detail">{detail}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
