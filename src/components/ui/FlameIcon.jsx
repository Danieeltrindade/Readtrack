/** Chama da sequência: acesa (laranja, animada) ou apagada (cinza). */
export function FlameIcon({ lit = false, size = 20, className = '' }) {
  return (
    <svg className={`flame ${lit ? 'flame--lit' : 'flame--off'} ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path className="flame__outer" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z" />
      <path className="flame__inner" d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 1.5-3 .2 1 .8 1.5 1.5 1.5-.3-1.5-.5-2.5 0-3.5z" />
    </svg>
  );
}
