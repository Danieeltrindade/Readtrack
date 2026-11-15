import { useMemo } from 'react';
import { FormatIcon, Panel } from '../../../components/ui';
import { FORMAT_LABELS, FORMAT_LIST } from '../../../utils/formats.js';
import { splitSessionsByFormat } from '../../../utils/dashboard.js';
import { buildLedger, summarizeRange } from '../../../utils/ledger.js';
import { formatDuration, formatNumber, pluralize } from '../../../utils/format.js';

/**
 * Tempo, sessões e páginas do período por formato (físico, e-book/PDF e
 * audiobook). Livro e e-book nunca são somados como se fossem a mesma coisa.
 */
export function FormatSplit({ sessions, books, range }) {
  const rows = useMemo(() => {
    const split = splitSessionsByFormat(sessions, books);
    return FORMAT_LIST.map((f) => ({ format: f, ...summarizeRange(buildLedger(split[f]), range.start, range.end) }));
  }, [sessions, books, range.start, range.end]);
  const total = rows.reduce((t, r) => t + r.seconds, 0);

  return (
    <Panel title="Por formato" className="format-split">
      {total === 0 ? (
        <p className="format-split__empty">Nenhum tempo registrado neste período.</p>
      ) : (
        <>
          <div className="format-split__bar" role="img" aria-label={rows.map((r) => `${FORMAT_LABELS[r.format]}: ${Math.round((r.seconds / total) * 100)}%`).join(', ')}>
            {rows.map((r) => (r.seconds > 0 ? <span key={r.format} className={`format-split__part format-split__part--${r.format}`} style={{ flexGrow: r.seconds }} /> : null))}
          </div>
          <ul className="format-split__list">
            {rows.map((r) => (
              <li key={r.format} style={{ '--fc': `var(--format-${r.format})`, '--fc-text': `var(--format-${r.format}-text)` }}>
                <span className="format-split__icon">
                  <FormatIcon format={r.format} size={18} />
                </span>
                <span className="format-split__name">{FORMAT_LABELS[r.format]}</span>
                <span className="format-split__value tabular">
                  <strong>{r.seconds ? formatDuration(r.seconds) : '—'}</strong>
                  <small>
                    {total ? `${Math.round((r.seconds / total) * 100)}% · ` : ''}
                    {pluralize(r.sessions, 'sessão', 'sessões')}
                    {r.pages ? ` · ${formatNumber(r.pages)} p.` : ''}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="format-split__note">Audiobooks e e-books por % contam no tempo, não nas páginas.</p>
        </>
      )}
    </Panel>
  );
}
