import { Link } from 'react-router';

/** Marca: um livro com fita marcadora em latão + nome. `to`: para onde o logotipo leva. */
export function Brand({ compact = false, to = '/', label = 'ReadTrack, ir para o início' }) {
  return (
    <Link to={to} className="brand" aria-label={label}>
      <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="6" y="4" width="18" height="24" rx="2" fill="var(--paper-100)" />
        <rect x="6" y="4" width="3.5" height="24" rx="1.2" fill="var(--paper-300)" />
        <path d="M18 4h4.5v13l-2.25-2-2.25 2z" fill="var(--brass-500)" />
      </svg>
      {!compact && <span className="brand__name">ReadTrack</span>}
    </Link>
  );
}
