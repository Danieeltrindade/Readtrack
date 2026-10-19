import { useId, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMediaQuery, BREAKPOINTS } from '../../hooks/useMediaQuery.js';
import './ReadingChart.css';

/**
 * Gráfico de leitura reutilizável (barras ou linhas) com:
 * - um único eixo Y (métricas de unidades diferentes nunca dividem o gráfico);
 * - tooltip ao passar o mouse/tocar;
 * - tabela com os mesmos dados ("Ver dados em tabela") para acessibilidade;
 * - altura e rótulos adaptados ao celular.
 *
 * series: [{ key, label, color, format, dashed? }]
 * strokeWidth: espessura das linhas (só no tipo "line"; padrão 2).
 * data:   [{ label, longLabel?, highlight?, muted?, [key]: number }]
 */
export function ReadingChart({
  type = 'bar',
  data,
  series,
  height = 240,
  mobileHeight = 180,
  title,
  emptyMessage = 'Sem leituras neste período.',
  strokeWidth = 2,
}) {
  const isMobile = useMediaQuery(BREAKPOINTS.mobile);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const hasData = data.some((d) => series.some((s) => Number(d[s.key]) > 0));
  const format = series[0].format ?? ((v) => String(v));
  // Em telas estreitas, mostra só alguns rótulos do eixo X.
  const interval = isMobile ? Math.max(0, Math.ceil(data.length / 6) - 1) : Math.max(0, Math.ceil(data.length / 14) - 1);

  const axisProps = {
    tickLine: false,
    axisLine: false,
    tick: { fill: 'var(--chart-axis)', fontSize: 11 },
  };

  // Lista (e não Fragment): o Recharts 2 não procura eixos dentro de Fragments.
  const common = [
    <CartesianGrid key="grid" vertical={false} stroke="var(--chart-grid)" />,
    <XAxis key="x" dataKey="label" interval={interval} dy={6} {...axisProps} tick={{ fill: 'var(--paper-500)', fontSize: 11 }} />,
    <YAxis key="y" allowDecimals={false} width={isMobile ? 34 : 44} tickFormatter={(v) => (series[0].axisFormat ?? String)(v)} {...axisProps} />,
    <Tooltip
      key="tooltip"
      cursor={type === 'bar' ? { fill: 'rgba(237,230,214,0.04)' } : { stroke: 'var(--line-strong)' }}
      content={<ChartTooltip series={series} />}
    />,
    series.length > 1 ? (
      <Legend key="legend" verticalAlign="top" align="right" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--paper-500)' }} />
    ) : null,
  ].filter(Boolean);

  return (
    <figure className="reading-chart" aria-label={title}>
      {!hasData ? (
        <div className="reading-chart__empty" style={{ height: isMobile ? mobileHeight : height }}>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? mobileHeight : height}>
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap={isMobile ? '18%' : '24%'}>
              {common}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                  {series.length === 1 &&
                    data.map((d) => (
                      <Cell
                        key={d.key ?? d.label}
                        fill={d.muted ? 'var(--chart-muted)' : s.color}
                        fillOpacity={d.highlight === false ? 0.55 : 1}
                      />
                    ))}
                </Bar>
              ))}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              {common}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={s.dashed ? '6 4' : undefined}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--color-surface)' }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      )}

      <button
        type="button"
        className="reading-chart__table-toggle"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? 'Ocultar tabela' : 'Ver dados em tabela'}
      </button>
      {showTable && (
        <div id={tableId} className="reading-chart__table-wrap">
          <table className="reading-chart__table">
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Período</th>
                {series.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key ?? d.label}>
                  <th scope="row">{d.longLabel ?? d.label}</th>
                  {series.map((s) => (
                    <td key={s.key} className="tabular">
                      {(s.format ?? format)(d[s.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

function ChartTooltip({ active, payload, series }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__date">{point.longLabel ?? point.label}</p>
      {series.map((s) => (
        <p key={s.key} className="chart-tooltip__row">
          <span className="chart-tooltip__swatch" style={{ background: s.color }} aria-hidden="true" />
          <span>{s.label}</span>
          <strong className="tabular">{(s.format ?? String)(point[s.key] ?? 0)}</strong>
        </p>
      ))}
    </div>
  );
}
