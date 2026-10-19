import { useState } from 'react';
import { Link } from 'react-router';
import { Panel } from '../../../components/ui';
import { ReadingChart } from '../../../components/charts/ReadingChart.jsx';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { formatMinutes, formatNumber, formatShortDate, formatWeekdayShort } from '../../../utils/format.js';
import { isSameDay } from '../../../utils/date.js';

const METRICS = {
  pages: { label: 'Páginas', color: 'var(--chart-pages)', format: (v) => `${formatNumber(v)} pág` },
  minutes: { label: 'Minutos', color: 'var(--chart-time)', format: formatMinutes },
};

/** Gráfico resumido dos últimos 7 dias (páginas ou minutos). */
export function WeeklyChart({ series }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const [metric, setMetric] = useState('pages');
  const config = METRICS[metric];
  const now = new Date();

  const data = series.map((day) => ({
    key: day.dateKey,
    label: isSameDay(day.date, now) ? 'hoje' : formatWeekdayShort(day.date),
    longLabel: formatShortDate(day.date),
    pages: day.pages,
    minutes: day.minutes,
    // Hoje com cor cheia; dias anteriores levemente atenuados.
    highlight: isSameDay(day.date, now) ? undefined : false,
  }));
  const total = data.reduce((sum, d) => sum + d[metric], 0);

  const toggle = (
    <div className="weekly-chart__controls">
      <div className="segmented" role="group" aria-label="Métrica do gráfico">
        {Object.entries(METRICS).map(([key, item]) => (
          <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Panel title="Últimos 7 dias" className="weekly-chart" action={toggle}>
      <p className="weekly-chart__total">
        <strong className="tabular">{config.format(total)}</strong> no período
      </p>
      <ReadingChart
        type="bar"
        title={`${config.label} lidas nos últimos 7 dias`}
        data={data}
        series={[{ key: metric, label: config.label, color: config.color, format: config.format }]}
        emptyMessage="Nenhuma leitura nos últimos 7 dias."
      />
      <Link to={ROUTES.statistics} className="weekly-chart__more">
        Ver estatísticas completas
      </Link>
    </Panel>
  );
}
