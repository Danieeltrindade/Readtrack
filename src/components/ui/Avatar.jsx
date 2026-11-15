import './Avatar.css';

/** Foto do perfil ou a inicial do nome (quando não há foto). */
export function Avatar({ src, name = '', size = 40, className = '' }) {
  const initial = (name.trim()[0] ?? 'L').toUpperCase();
  return (
    <span className={`avatar ${className}`} style={{ '--avatar-size': `${size}px` }} aria-hidden="true">
      {src ? <img src={src} alt="" width={size} height={size} /> : <span className="avatar__initial">{initial}</span>}
    </span>
  );
}
