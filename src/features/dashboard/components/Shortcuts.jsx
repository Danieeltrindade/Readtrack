import { Link } from 'react-router';
import { ChartColumn, History, Library, Timer } from 'lucide-react';
import { usePaths } from '../../../hooks/useWorkspace.js';

/** Atalhos para as tarefas mais comuns. */
export function Shortcuts({ timerActive }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const items = [
    { to: ROUTES.reading, icon: Timer, label: timerActive ? 'Voltar ao cronômetro' : 'Iniciar leitura', primary: true },
    { to: ROUTES.library, icon: Library, label: 'Biblioteca' },
    { to: ROUTES.statistics, icon: ChartColumn, label: 'Estatísticas' },
    { to: ROUTES.history, icon: History, label: 'Histórico' },
  ];
  return (
    <nav className="shortcuts" aria-label="Atalhos">
      {items.map(({ to, icon: Icon, label, primary }) => (
        <Link key={to} to={to} className={`shortcut ${primary ? 'shortcut--primary' : ''}`}>
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
