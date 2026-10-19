import './Progress.css';

/** Barra de progresso acessível. `value` entre 0 e 100. */
export function ProgressBar({ value, label, tone = 'accent', size = 'md' }) {
  const safe = Math.min(100, Math.max(0, Math.round(value || 0)));
  return (
    <div
      className={`progress-bar progress-bar--${tone} progress-bar--${size}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safe}
      aria-label={label}
    >
      <span className="progress-bar__fill" style={{ width: `${safe}%` }} />
    </div>
  );
}

/** Anel de progresso (metas). `ratio` entre 0 e 1. */
export function ProgressRing({ ratio, size = 96, stroke = 8, label, children }) {
  const safe = Math.min(1, Math.max(0, ratio || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="progress-ring"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe * 100)}
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="progress-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className={`progress-ring__value ${safe >= 1 ? 'is-complete' : ''}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - safe)}
        />
      </svg>
      <div className="progress-ring__content">{children}</div>
    </div>
  );
}
