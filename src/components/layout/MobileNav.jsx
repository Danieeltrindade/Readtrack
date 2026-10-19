import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Ellipsis, X } from 'lucide-react';
import { useNavItems } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import './MobileNav.css';

/**
 * Navegação para telas pequenas: barra inferior ao alcance do polegar,
 * com "Ler" em destaque no centro. Páginas menos frequentes ficam em
 * uma folha "Mais" que sobe de baixo.
 */
export function MobileNav() {
  const location = useLocation();
  const { activeSession } = useData();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef(null);
  const navItems = useNavItems();

  const tabs = navItems.filter((item) => item.mobile === 'tab' || item.mobile === 'primary');
  const moreItems = navItems.filter((item) => item.mobile === 'more');
  const moreIsActive = moreItems.some((item) => location.pathname.startsWith(item.to));

  // Mantém a ordem: Início, Biblioteca, [Ler], Números, Mais
  const [first, second, primary, third] = [
    tabs.find((t) => t.end),
    tabs.find((t) => t.label === 'Biblioteca'),
    tabs.find((t) => t.mobile === 'primary'),
    tabs.find((t) => t.label === 'Estatísticas'),
  ];

  // Fecha a folha ao trocar de rota
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMoreOpen(false);
  }

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (moreOpen && !sheet.open) sheet.showModal();
    if (!moreOpen && sheet.open) sheet.close();
  }, [moreOpen]);

  return (
    <>
      <nav className="mobile-nav" aria-label="Navegação principal">
        <ul className="mobile-nav__list">
          <li>
            <TabLink item={first} />
          </li>
          <li>
            <TabLink item={second} />
          </li>
          <li className="mobile-nav__primary-slot">
            <NavLink
              to={primary.to}
              className={({ isActive }) => `mobile-nav__primary ${isActive ? 'is-active' : ''}`}
              aria-label={activeSession ? `${primary.label} (sessão em andamento)` : primary.label}
            >
              <primary.icon size={24} strokeWidth={2} aria-hidden="true" />
              {activeSession && <span className="mobile-nav__live" aria-hidden="true" />}
            </NavLink>
          </li>
          <li>
            <TabLink item={third} />
          </li>
          <li>
            <button
              type="button"
              className={`mobile-nav__tab ${moreIsActive ? 'is-active' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              <Ellipsis size={22} strokeWidth={1.8} aria-hidden="true" />
              <span>Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheetRef}
        className="mobile-sheet"
        aria-label="Mais páginas"
        onCancel={(event) => {
          event.preventDefault();
          setMoreOpen(false);
        }}
        onClick={(event) => {
          if (event.target === sheetRef.current) setMoreOpen(false);
        }}
      >
        <div className="mobile-sheet__content">
          <div className="mobile-sheet__header">
            <span className="mobile-sheet__handle" aria-hidden="true" />
            <button type="button" className="mobile-sheet__close" onClick={() => setMoreOpen(false)}>
              <X size={20} aria-hidden="true" />
              <span className="visually-hidden">Fechar</span>
            </button>
          </div>
          <ul className="mobile-sheet__list">
            {moreItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => `mobile-sheet__link ${isActive ? 'is-active' : ''}`}
                >
                  <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}

function TabLink({ item }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `mobile-nav__tab ${isActive ? 'is-active' : ''}`}>
      <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
      <span>{item.shortLabel ?? item.label}</span>
    </NavLink>
  );
}
