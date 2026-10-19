import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChartColumn, ChevronLeft, ChevronRight, Minus, MoveDownRight, MoveUpRight, Timer } from 'lucide-react';
import { Button, EmptyState, MetricStrip, PageHeader, Panel } from '../../components/ui';
import { ReadingChart } from '../../components/charts/ReadingChart.jsx';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import {
  PACE_MIN_PAGES,
  PACE_MIN_SECONDS,
  calculateStreakFromLedger,
  comparePeriodStats,
  getAllTimeSummary,
  getFirstReadingDate,
  getPeriodBuckets,
  getPeriodStats,
  getRecords,
  getStatsSessions,
} from '../../utils/stats.js';
import { buildLedger, summarizeRange } from '../../utils/ledger.js';
import {
  addDays,
  fromDateKey,
  getComparableRange,
  getPeriodRange,
  isCurrentPeriod,
  shiftPeriod,
  toDateKey,
} from '../../utils/date.js';
import {
  formatBucketLabels,
  formatDayRange,
  formatDecimal,
  formatDuration,
  formatFullDate,
  formatMinutes,
  formatNumber,
  formatPercentChange,
  formatPeriodLabel,
  formatShortDate,
  pluralize,
} from '../../utils/format.js';
import './Statistics.css';

/** Os cinco períodos — os mesmos na área principal e na Evolução. */
const PERIODS = [
  { value: 'day', param: 'dia', label: 'Dia' },
  { value: 'week', param: 'semana', label: 'Semana' },
  { value: 'month', param: 'mes', label: 'Mês' },
  { value: 'quarter', param: '3-meses', label: '3 meses' },
  { value: 'all', param: 'total', label: 'Histórico total' },
];
const PREVIOUS_NAMES = { day: 'dia anterior', week: 'semana anterior', month: 'mês anterior', quarter: 'três meses anteriores' };
const CURRENT_NAMES = { day: 'Hoje', week: 'Esta semana', month: 'Este mês', quarter: 'Últimos 3 meses' };
const BUCKET_NOUN = { hour: 'hora', day: 'dia', week: 'semana', month: 'mês', quarter: 'trimestre' };
const LINE_WIDTH = 2.75; // um pouco mais grossa que o padrão (2), só nas Estatísticas
const pagesFormat = (v) => `${formatNumber(Math.round(v))} pág`;
const periodOf = (param, fallback) => PERIODS.find((p) => p.param === param)?.value ?? fallback;

/**
 * Estatísticas por dia, semana, mês, 3 meses ou histórico total, com
 * comparação justa com o período anterior, gráficos e recordes. Todos os
 * números vêm do livro-razão diário (utils/ledger.js) — as mesmas regras do
 * Dashboard e das Metas. Período na URL (?periodo=3-meses&data=2026-10-15&evolucao=total).
 */
export default function StatisticsPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  useDocumentTitle('Estatísticas');
  const { books, sessions: allSessions, ledger: sharedLedger, settings } = useData();
  // Demonstração não é leitura real: sai das estatísticas quando há sessões suas.
  const { sessions, demoOnly, demoExcluded } = getStatsSessions(allSessions);
  const ledger = useMemo(() => (sessions === allSessions ? sharedLedger : buildLedger(sessions)), [sessions, allSessions, sharedLedger]);
  const realBooks = demoExcluded ? books.filter((b) => !b.isDemo) : books;
  // Livros concluídos sem data (ex.: lidos antes do ReadTrack) não pertencem a nenhum período.
  const undatedFinished = realBooks.filter((b) => b.status === 'finished' && !b.finishedAt).length;
  const finishedCount = realBooks.filter((b) => b.status === 'finished').length;
  const weekStartsOn = settings.weekStartsOn;
  const [params, setParams] = useSearchParams();
  const [evolutionMetric, setEvolutionMetric] = useState('pages');

  const now = new Date();
  const todayKey = toDateKey(now);
  const firstDate = getFirstReadingDate(sessions);
  const type = periodOf(params.get('periodo'), 'week');
  const evolutionType = periodOf(params.get('evolucao'), type);
  const anchor = fromDateKey(params.get('data') ?? '') ?? now;
  const safeAnchor = anchor > now ? now : anchor; // não navega para o futuro
  const rangeFor = (t) => getPeriodRange(t, safeAnchor, weekStartsOn, { firstDate, now });

  const range = rangeFor(type);
  const isAll = type === 'all';
  const isCurrent = isCurrentPeriod(range, now);
  const comparable = getComparableRange(range, now, weekStartsOn);

  // Cálculos baratos (centenas de dias e sessões): feitos a cada render,
  // sem memorização, para não arriscar números desatualizados.
  const base = { ledger, sessions, books: realBooks };
  const stats = getPeriodStats(base, range, now);
  const previous = comparable ? getPeriodStats(base, comparable, now) : null;
  const comparison = previous ? comparePeriodStats(stats, previous) : null;
  const allTime = isAll ? getAllTimeSummary({ ledger, sessions }, now) : null;
  const streak = calculateStreakFromLedger(ledger, now);
  const records = getRecords(ledger, sessions);

  const setParam = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  const go = (nextType, nextAnchor) =>
    setParam({
      periodo: PERIODS.find((p) => p.value === nextType).param,
      data: toDateKey(nextAnchor) >= todayKey ? null : toDateKey(nextAnchor),
    });

  if (allSessions.length === 0) {
    return (
      <div className="page statistics">
        <PageHeader title="Estatísticas" />
        <EmptyState
          icon={ChartColumn}
          title="Ainda não há leituras registradas"
          description={
            finishedCount > 0
              ? `Você tem ${pluralize(finishedCount, 'livro concluído', 'livros concluídos')}, mas tempo, páginas e ritmo só existem com sessões de leitura. Nada é estimado para livros lidos antes do ReadTrack.`
              : 'As estatísticas aparecem depois da primeira sessão (pelo cronômetro ou registro manual).'
          }
          action={<Button to={ROUTES.reading} icon={Timer}>Iniciar leitura</Button>}
        />
      </div>
    );
  }

  /* ---------- Gráficos do período ---------- */
  // "Dia": os 14 dias que terminam no dia escolhido (um dia sozinho não forma barras).
  // Demais períodos: os mesmos baldes da Evolução (dia, semana ou mês, conforme o tamanho).
  const periodBuckets = type === 'day' ? null : getPeriodBuckets(base, range, { now, weekStartsOn });
  const mainBuckets =
    type === 'day'
      ? summarizeRange(ledger, addDays(range.start, -13), range.end).days.map((d) => ({
          key: d.dateKey,
          label: formatShortDate(d.date),
          longLabel: formatFullDate(d.date),
          pages: d.pages,
          minutes: Math.round(d.seconds / 60),
          highlight: d.dateKey === toDateKey(range.start) ? undefined : false,
          muted: d.date > now,
        }))
      : toChartData(periodBuckets, type);
  const mainNoun = type === 'day' ? 'dia' : BUCKET_NOUN[periodBuckets[0]?.kind ?? 'day'];
  const mainTitle = (what) => (type === 'day' ? `${what} (últimos 14 dias)` : `${what} por ${mainNoun}`);

  /* ---------- Números do período ---------- */
  const pace = stats.pace;
  const items = [
    {
      label: 'Páginas registradas',
      value: formatNumber(stats.pages),
      detail: `${formatNumber(stats.newPages)} novas (avanço nos livros)`,
    },
    { label: 'Tempo efetivo', value: formatDuration(stats.seconds), detail: 'sem contar pausas' },
    {
      label: 'Sessões',
      value: formatNumber(stats.sessions),
      detail: `${pluralize(stats.readingDays, 'dia', 'dias')} com leitura`,
    },
    type !== 'day' && {
      label: 'Média diária',
      value: stats.averages.pagesPerDay === null ? '—' : `${formatDecimal(stats.averages.pagesPerDay)} pág`,
      detail:
        stats.averages.secondsPerDay === null
          ? ''
          : `${formatDuration(stats.averages.secondsPerDay)} por dia, em ${pluralize(stats.elapsedDays, 'dia')}`,
    },
    {
      label: 'Média por sessão',
      value: stats.averages.pagesPerSession === null ? '—' : `${formatDecimal(stats.averages.pagesPerSession)} pág`,
      detail: stats.averages.secondsPerSession === null ? 'nenhuma sessão com duração' : `duração média de ${formatDuration(stats.averages.secondsPerSession)}`,
    },
    pace.reliable
      ? {
          label: 'Ritmo',
          value: `${formatNumber(Math.round(pace.pagesPerHour))} pág/h`,
          detail: `${formatDecimal(pace.pagesPerMinute)} pág/min`,
        }
      : {
          label: 'Ritmo',
          value: 'Dados insuficientes',
          detail: `precisa de ${PACE_MIN_SECONDS / 60} min e ${PACE_MIN_PAGES} páginas no período`,
          tone: 'muted',
        },
  ].filter(Boolean);

  /* ---------- Evolução ---------- */
  const evolutionRange = evolutionType === type ? range : rangeFor(evolutionType);
  const evolutionBuckets = getPeriodBuckets(base, evolutionRange, { now, weekStartsOn });
  const evolutionKind = evolutionBuckets[0]?.kind ?? 'day';
  const evolutionData = toChartData(evolutionBuckets, evolutionType);
  const evolutionSeries =
    evolutionMetric === 'pages'
      ? [
          { key: 'pages', label: 'Páginas registradas', color: 'var(--chart-pages)', format: pagesFormat },
          { key: 'newPages', label: 'Páginas novas', color: 'var(--chart-new-pages)', format: pagesFormat, dashed: true },
        ]
      : [{ key: 'minutes', label: 'Tempo de leitura', color: 'var(--chart-time)', format: formatMinutes, axisFormat: (v) => `${v}` }];

  return (
    <div className="page statistics">
      <PageHeader title="Estatísticas" description="Seus números de leitura por dia, semana, mês, últimos 3 meses ou desde o início." />

      {(demoOnly || demoExcluded) && (
        <p className="statistics__demo-note" role="note">
          {demoOnly
            ? 'Mostrando os dados de demonstração. Quando você registrar a primeira sessão, só as suas leituras entram aqui.'
            : 'Os dados de demonstração não entram nestas estatísticas: só as suas sessões.'}
        </p>
      )}

      <div className="statistics__controls">
        <PeriodPicker label="Período" value={type} onChange={(value) => go(value, safeAnchor)} large />
        {isAll ? (
          <p className="period-nav__label period-nav__label--static" aria-live="polite">
            {formatPeriodLabel(range)}
          </p>
        ) : (
          <div className="period-nav">
            <button type="button" className="period-nav__step" onClick={() => go(type, addDays(shiftPeriod(range, -1, weekStartsOn).end, -1))} aria-label="Período anterior">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <p className="period-nav__label" aria-live="polite">
              {formatPeriodLabel(range)}
              {isCurrent && <span className="period-nav__now">{type === 'day' ? 'hoje' : 'atual'}</span>}
            </p>
            <button
              type="button"
              className="period-nav__step"
              onClick={() => go(type, addDays(shiftPeriod(range, 1, weekStartsOn).end, -1))}
              disabled={isCurrent}
              aria-label="Próximo período"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            {!isCurrent && (
              <Button variant="ghost" size="sm" onClick={() => go(type, now)}>
                Voltar para hoje
              </Button>
            )}
          </div>
        )}
      </div>

      <MetricStrip label="Números do período" items={items} />

      <div className="statistics__charts">
        <Panel title={mainTitle('Páginas')}>
          <ReadingChart
            type="bar"
            title={`Páginas registradas por ${mainNoun}`}
            data={mainBuckets}
            series={[{ key: 'pages', label: 'Páginas', color: 'var(--chart-pages)', format: pagesFormat }]}
          />
        </Panel>
        <Panel title={mainTitle('Tempo')}>
          <ReadingChart
            type="bar"
            title={`Minutos de leitura por ${mainNoun}`}
            data={mainBuckets}
            series={[{ key: 'minutes', label: 'Tempo', color: 'var(--chart-time)', format: formatMinutes }]}
          />
        </Panel>
      </div>

      <div className="statistics__row">
        {comparison ? (
          <Panel title="Comparação">
            <p className="comparison__intro">
              <strong>{isCurrent ? CURRENT_NAMES[type] : formatPeriodLabel(range)}</strong>
              {isCurrent && type !== 'day' && type !== 'quarter' ? ' até hoje' : ''} comparado com{' '}
              {comparable.partial
                ? `${formatDayRange(comparable.start, comparable.end)} (os mesmos ${pluralize(comparable.days, 'dia')} do ${PREVIOUS_NAMES[type]})`
                : `${type === 'quarter' ? 'os ' : 'o '}${PREVIOUS_NAMES[type]} (${type === 'day' ? formatShortDate(comparable.start) : formatDayRange(comparable.start, comparable.end)})`}
              .
            </p>
            <ul className="compare-list">
              <CompareItem label="Páginas registradas" item={comparison.pages} format={(v) => `${formatNumber(v)} pág`} />
              <CompareItem label="Tempo de leitura" item={comparison.seconds} format={formatDuration} />
              <CompareItem label="Sessões" item={comparison.sessions} format={(v) => formatNumber(v)} />
              <CompareItem label="Dias com leitura" item={comparison.readingDays} format={(v) => formatNumber(v)} />
            </ul>
            <p className="compare-list__legend">
              <span className="compare-list__swatch compare-list__swatch--now" aria-hidden="true" /> período escolhido
              <span className="compare-list__swatch compare-list__swatch--before" aria-hidden="true" /> período anterior
            </p>
          </Panel>
        ) : (
          <Panel title="Desde o início">
            {allTime ? (
              <dl className="highlights alltime">
                <div>
                  <dt>Primeiro registro</dt>
                  <dd>
                    {formatFullDate(allTime.first)}
                    <span>há {pluralize(allTime.days, 'dia')}</span>
                  </dd>
                </div>
                <div>
                  <dt>Total acumulado</dt>
                  <dd>
                    {formatNumber(allTime.pages)} páginas
                    <span>
                      {formatDuration(allTime.seconds)} em {pluralize(allTime.sessions, 'sessão', 'sessões')}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Por dia de leitura</dt>
                  <dd>
                    {allTime.perReadingDay.pages === null ? '—' : `${formatDecimal(allTime.perReadingDay.pages)} pág`}
                    <span>
                      {allTime.perReadingDay.seconds === null ? '' : `${formatDuration(allTime.perReadingDay.seconds)} · `}
                      {pluralize(allTime.readingDays, 'dia', 'dias')} com leitura
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Média por semana</dt>
                  <dd>
                    {formatDecimal(allTime.perWeek.pages)} pág
                    <span>{formatDuration(allTime.perWeek.seconds)} por semana, contando semanas sem leitura</span>
                  </dd>
                </div>
                {allTime.bestMonth && (
                  <div>
                    <dt>Melhor mês</dt>
                    <dd>
                      {formatPeriodLabel({ type: 'month', start: allTime.bestMonth.start })}
                      <span>
                        {formatNumber(allTime.bestMonth.pages)} páginas em {formatDuration(allTime.bestMonth.seconds)}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="comparison__intro">Nenhuma leitura registrada ainda.</p>
            )}
            <p className="compare-list__legend">O histórico total não tem um “período anterior”: veja a evolução abaixo.</p>
          </Panel>
        )}

        <Panel title="Destaques">
          <dl className="highlights">
            <div>
              <dt>Melhor dia do período</dt>
              <dd>
                {stats.bestDay ? (
                  <>
                    {formatFullDate(stats.bestDay.date)}
                    <span>
                      {formatNumber(stats.bestDay.pages)} páginas em {formatDuration(stats.bestDay.seconds)}
                    </span>
                  </>
                ) : (
                  <span>Nenhuma leitura neste período.</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Livros concluídos no período</dt>
              <dd>
                {stats.finishedBooks.length === 0 ? (
                  <span>Nenhum.</span>
                ) : (
                  <ul className="highlights__books">
                    {stats.finishedBooks.map((b) => (
                      <li key={b.id}>
                        <Link to={ROUTES.book(b.id)}>{b.title}</Link>
                        <span> em {formatShortDate(b.finishedAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {undatedFinished > 0 && (
                  <small className="highlights__note">
                    {pluralize(undatedFinished, 'livro concluído', 'livros concluídos')} sem data de conclusão{' '}
                    {undatedFinished === 1 ? 'não aparece' : 'não aparecem'} em nenhum período.
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Sequência atual</dt>
              <dd>
                {pluralize(streak.current, 'dia')}
                <span>{streak.readToday ? 'você já leu hoje' : streak.current > 0 ? 'leia hoje para manter' : 'comece hoje'}</span>
              </dd>
            </div>
            <div>
              <dt>Maior sequência</dt>
              <dd>
                {pluralize(streak.longest, 'dia')}
                {streak.longestEnd && <span>terminou em {formatShortDate(fromDateKey(streak.longestEnd))}</span>}
              </dd>
            </div>
            {records.bestDay && (
              <div>
                <dt>Recorde diário</dt>
                <dd>
                  {formatNumber(records.bestDay.pages)} páginas
                  <span>em {formatFullDate(fromDateKey(records.bestDay.dateKey))}</span>
                </dd>
              </div>
            )}
          </dl>
        </Panel>
      </div>

      <Panel
        title="Evolução"
        action={
          <div className="evolution__controls">
            <PeriodPicker
              label="Período da evolução"
              value={evolutionType}
              onChange={(value) => setParam({ evolucao: value === type ? null : PERIODS.find((p) => p.value === value).param })}
            />
            <div className="segmented" role="group" aria-label="Métrica">
              <button type="button" aria-pressed={evolutionMetric === 'pages'} onClick={() => setEvolutionMetric('pages')}>
                Páginas
              </button>
              <button type="button" aria-pressed={evolutionMetric === 'minutes'} onClick={() => setEvolutionMetric('minutes')}>
                Tempo
              </button>
            </div>
          </div>
        }
      >
        <p className="evolution__caption">
          {evolutionMetric === 'pages' ? 'Páginas' : 'Minutos de leitura'} por {BUCKET_NOUN[evolutionKind]} —{' '}
          {evolutionType === 'all' ? formatPeriodLabel(evolutionRange).toLowerCase() : formatPeriodLabel(evolutionRange)}.
          {evolutionKind === 'hour' && ' Distribuição pelas horas do dia, pelo horário real de cada sessão.'}
          {evolutionMetric === 'pages' && ' A linha tracejada mostra só as páginas novas (sem releitura).'}
        </p>
        <ReadingChart
          type="line"
          title="Evolução da leitura"
          data={evolutionData}
          series={evolutionSeries}
          height={260}
          mobileHeight={200}
          strokeWidth={LINE_WIDTH}
          emptyMessage={evolutionType === 'day' ? 'Sem leitura neste dia.' : 'Sem leituras neste período.'}
        />
      </Panel>

      <details className="statistics__rules">
        <summary>Como os números são calculados</summary>
        <ul>
          <li>Os dias seguem o seu fuso horário: de 00:00 a 23:59. A semana começa {weekStartsOn === 'sunday' ? 'no domingo' : 'na segunda-feira'} (mude em Configurações).</li>
          <li><strong>3 meses</strong> são os últimos três meses do calendário até o dia escolhido (ex.: 19/07 a 18/10). <strong>Histórico total</strong> vai do primeiro registro até hoje.</li>
          <li>Uma sessão que passa da meia-noite é dividida entre os dois dias, pelo tempo lido em cada um. As páginas seguem a mesma proporção.</li>
          <li><strong>Páginas registradas</strong> somam tudo o que você leu, inclusive releituras. <strong>Páginas novas</strong> contam só o quanto avançou nos livros.</li>
          <li>O tempo é o registrado: pausas do cronômetro não contam, e sessões manuais sem duração anotada não somam tempo.</li>
          <li>Médias por sessão usam as sessões iniciadas no período. A média diária divide pelo número de dias já decorridos, contando dias sem leitura.</li>
          <li>O ritmo só aparece com pelo menos {PACE_MIN_SECONDS / 60} minutos e {PACE_MIN_PAGES} páginas; sessões sem duração são ignoradas.</li>
          <li>Na comparação de um período em andamento, o anterior é cortado no mesmo número de dias, para não comparar 15 dias com 30. Sem leitura no período anterior, não há percentual (nada de “+100%”).</li>
          <li>Os gráficos agrupam por hora (Dia), por dia (Semana e Mês), por semana (3 meses) e por semana, mês ou trimestre (Histórico total, conforme o tamanho). Agrupar não descarta dados: a soma dos pontos é o total do período.</li>
          <li>Um dia conta para a sequência quando tem pelo menos 1 minuto de leitura ou 1 página. Hoje só entra depois que você ler.</li>
          <li>Dados de demonstração não entram quando há sessões suas.</li>
        </ul>
      </details>
    </div>
  );
}

/** Baldes → dados do gráfico (rótulos curtos no eixo, longos na dica e na tabela). */
function toChartData(buckets, rangeType) {
  const multiYear = buckets.length > 0 && buckets[0].start.getFullYear() !== buckets[buckets.length - 1].start.getFullYear();
  return buckets.map((b) => ({
    key: b.key,
    ...formatBucketLabels(b, { rangeType, multiYear }),
    pages: b.pages,
    newPages: b.newPages,
    minutes: b.minutes,
    muted: b.future,
  }));
}

function PeriodPicker({ label, value, onChange, large = false }) {
  return (
    <div className={`segmented segmented--periods ${large ? 'segmented--lg' : ''}`} role="group" aria-label={label}>
      {PERIODS.map((p) => (
        <button key={p.value} type="button" aria-pressed={value === p.value} onClick={() => onChange(p.value)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Uma métrica comparada: valor atual, barras proporcionais (agora × antes),
 * diferença absoluta e percentual — só quando o percentual faz sentido.
 */
function CompareItem({ label, item, format }) {
  const max = Math.max(item.current, item.previous, 1);
  const percent = formatPercentChange(item.percent);
  const tone = item.status === 'up' || item.status === 'new' ? 'up' : item.status === 'down' || item.status === 'stopped' ? 'down' : 'neutral';
  const Icon = tone === 'up' ? MoveUpRight : tone === 'down' ? MoveDownRight : Minus;
  let text;
  if (item.status === 'none') text = 'Sem leitura nos dois períodos';
  else if (item.status === 'new') text = 'Novo registro · sem leitura no período anterior';
  else if (item.status === 'same') text = 'Igual ao período anterior';
  else {
    const sign = item.delta > 0 ? '+' : '−';
    text = `${sign}${format(Math.abs(item.delta))}${percent && percent !== 'igual' ? ` (${percent})` : ''}`;
    if (item.status === 'stopped') text += ' · sem leitura agora';
  }
  return (
    <li className="compare-item">
      <div className="compare-item__head">
        <span className="compare-item__label">{label}</span>
        <span className="compare-item__value tabular">{format(item.current)}</span>
      </div>
      <div className="compare-item__bars" aria-hidden="true">
        <span className="compare-item__bar compare-item__bar--now" style={{ width: `${(item.current / max) * 100}%` }} />
        <span className="compare-item__bar compare-item__bar--before" style={{ width: `${(item.previous / max) * 100}%` }} />
      </div>
      <p className={`compare-item__change compare-item__change--${tone} tabular`}>
        <Icon size={14} aria-hidden="true" />
        <span>{text}</span>
        <span className="compare-item__previous">antes: {format(item.previous)}</span>
      </p>
    </li>
  );
}
