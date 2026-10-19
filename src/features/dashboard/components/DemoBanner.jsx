import { Link } from 'react-router';
import { FlaskConical } from 'lucide-react';
import { usePaths } from '../../../hooks/useWorkspace.js';

/**
 * Dados de demonstração ANTIGOS (versões até a 1.5.0 gravavam exemplos no
 * modo local, marcados com isDemo). Avisa e indica onde removê-los.
 */
export function DemoBanner() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  return (
    <aside className="demo-banner" aria-label="Dados de demonstração">
      <FlaskConical size={18} aria-hidden="true" />
      <p>
        Este navegador ainda tem livros e sessões de exemplo de uma versão antiga. Eles nunca são enviados para uma conta;
        remova-os em <Link to={ROUTES.settings}>Configurações</Link>.
      </p>
    </aside>
  );
}
