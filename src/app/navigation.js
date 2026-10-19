/**
 * Fonte única dos itens de navegação. Sidebar e navegação mobile leem
 * daqui, então adicionar uma página exige mudar só este arquivo e as rotas.
 */
import {
  ChartColumn,
  History,
  LayoutDashboard,
  Library,
  Settings,
  Target,
  Timer,
} from 'lucide-react';
import { ROUTES } from './routes.js';

// Caminhos das telas (relativos ao espaço /app ou /demo): veja routes.js.
export { ROUTES };

export const NAV_ITEMS = [
  { to: ROUTES.dashboard, label: 'Início', icon: LayoutDashboard, end: true, mobile: 'tab' },
  { to: ROUTES.library, label: 'Biblioteca', icon: Library, mobile: 'tab' },
  { to: ROUTES.reading, label: 'Ler agora', shortLabel: 'Ler', icon: Timer, mobile: 'primary' },
  { to: ROUTES.history, label: 'Histórico', icon: History, mobile: 'more' },
  { to: ROUTES.statistics, label: 'Estatísticas', shortLabel: 'Números', icon: ChartColumn, mobile: 'tab' },
  { to: ROUTES.goals, label: 'Metas e conquistas', shortLabel: 'Metas', icon: Target, mobile: 'more' },
  { to: ROUTES.settings, label: 'Configurações', icon: Settings, mobile: 'more', section: 'footer' },
];
