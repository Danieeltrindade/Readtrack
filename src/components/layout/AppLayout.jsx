import { Outlet, useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { MobileHeader } from './MobileHeader.jsx';
import { MobileNav } from './MobileNav.jsx';
import { StorageNotice } from './StorageNotice.jsx';
import { BackendNotice } from './BackendNotice.jsx';
import { ActiveSessionBar } from './ActiveSessionBar.jsx';
import { DemoBar } from './DemoBar.jsx';
import { useWorkspace } from '../../hooks/useWorkspace.js';
import { ErrorBoundary } from '../ui/ErrorBoundary.jsx';
import './AppLayout.css';

/**
 * Estrutura de todas as páginas.
 * - ≥1100px: sidebar completa
 * - 768–1099px: trilho de ícones
 * - <768px: cabeçalho compacto + barra de navegação inferior
 */
export function AppLayout() {
  const { pathname } = useLocation();
  const { kind } = useWorkspace();
  const mainRef = useRef(null);
  const lastPathname = useRef(pathname);

  // Ao trocar de página: volta ao topo e move o foco para o conteúdo,
  // para que leitores de tela anunciem a nova página. Compara com a rota
  // anterior (e não com "primeira renderização") para não roubar o foco ao
  // carregar o site — o StrictMode executa os efeitos duas vezes.
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="app-shell__sidebar">
        <Sidebar />
      </div>
      <div className="app-shell__mobile-header">
        <MobileHeader />
      </div>
      <main id="conteudo" className="app-shell__main" ref={mainRef} tabIndex={-1}>
        {kind === 'demo' && <DemoBar />}
        <BackendNotice />
        <StorageNotice />
        <ActiveSessionBar />
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <div className="app-shell__mobile-nav">
        <MobileNav />
      </div>
    </div>
  );
}
