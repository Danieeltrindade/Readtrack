import { Link } from 'react-router';
import { Panel, ProgressBar, ProgressRing } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { formatNumber } from '../../../utils/format.js';

/** Metas: minutos de hoje (anel) e páginas da semana (barra). */
export function TodayPanel({ today, week }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const dailyOn = Boolean(today.goalMinutes);
  const weeklyOn = Boolean(week.goalPages);
  const minutesLeft = dailyOn ? Math.max(0, today.goalMinutes - today.minutes) : 0;
  const pagesLeft = weeklyOn ? Math.max(0, week.goalPages - week.pages) : 0;

  return (
    <Panel title="Metas" className="today" action={<Link to={ROUTES.goals}>{dailyOn || weeklyOn ? 'Ver metas' : 'Configurar'}</Link>}>
      <div className="today__daily">
        <ProgressRing ratio={today.goalRatio} size={104} stroke={9} label="Meta diária de minutos">
          <span className="today__ring-value tabular">
            {formatNumber(today.minutes)}
            <small>{dailyOn ? `de ${formatNumber(today.goalMinutes)} min` : 'min hoje'}</small>
          </span>
        </ProgressRing>
        <div className="today__daily-text">
          <h3>Hoje</h3>
          <p>
            {!dailyOn
              ? 'Meta diária não configurada.'
              : today.goalRatio >= 1
                ? 'Meta do dia cumprida.'
                : today.minutes === 0
                  ? `Você ainda não leu hoje. ${formatNumber(today.goalMinutes)} minutos fecham a meta.`
                  : `Mais ${formatNumber(minutesLeft)} minutos para fechar a meta.`}
          </p>
          {today.pages > 0 && <p className="today__pages tabular">{formatNumber(today.pages)} páginas hoje</p>}
        </div>
      </div>

      <div className="today__weekly">
        <div className="today__weekly-head">
          <h3>Esta semana</h3>
          <span className="tabular">
            <strong>{formatNumber(week.pages)}</strong>
            {weeklyOn ? ` / ${formatNumber(week.goalPages)} páginas` : ' páginas'}
          </span>
        </div>
        {weeklyOn ? (
          <>
            <ProgressBar value={week.goalRatio * 100} tone={week.goalRatio >= 1 ? 'success' : 'accent'} label="Meta semanal de páginas" />
            <p className="today__hint">
              {pagesLeft === 0 ? 'Meta semanal cumprida.' : `Faltam ${formatNumber(pagesLeft)} páginas até o fim da semana.`}
            </p>
          </>
        ) : (
          <p className="today__hint">Meta semanal não configurada.</p>
        )}
      </div>
    </Panel>
  );
}
