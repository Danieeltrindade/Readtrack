import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ChartColumn, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import { Button, EmptyState, MetricStrip, PageHeader, Panel } from '../../components/ui';
import { ReadingChart } from '../../components/charts/ReadingChart.jsx';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import {
  PACE_MIN_PAGES,
  PACE_MIN_SECONDS,
  calculateStreakFromLedger,
  getAllTimeSummary,
  getFirstReadingDate,
  getPeriodBuckets,
  getPeriodStats,
  getRecords,
  getStatsSessions,
} from '../../utils/stats.js';
import { buildLedger, summarizeRange } from '../../utils/ledger.js';
import { FormatSplit } from './components/FormatSplit.jsx';
import { ComparePanel } from './components/ComparePanel.jsx';
import { HighlightTiles } from './components/HighlightTiles.jsx';
import { EvolutionPanel } from './components/EvolutionPanel.jsx';
import {
  addDays,
  fromDateKey,
  getPeriodRange,
  isCurrentPeriod,
  shiftPeriod,
  toDateKey,
} from '../../utils/date.js';
import {
  formatBucketLabels,
  formatDecimal,
  formatDuration,
  formatFullDate,
  formatMinutes,
  formatNumber,
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
const BUCKET_NOUN = { hour: 'hora', day: 'dia', week: 'semana', month: 'mês', quarter: 'trimestre' };
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

  const now = new Date();
  const todayKey = toDateKey(now);
  const firstDate = getFirstReadingDate(sessions);
  const type = periodOf(params.get('periodo'), 'week');
  const anchor = fromDateKey(params.get('data') ?? '') ?? now;
  const safeAnchor = anchor > now ? now : anchor; // não navega para o futuro
  const rangeFor = (t) => getPeriodRange(t, safeAnchor, weekStartsOn, { firstDate, now });

  const range = rangeFor(type);
  const isAll = type === 'all';
  const isCurrent = isCurrentPeriod(range, now);

  // Cálculos baratos (centenas de dias e sessões): feitos a cada render,
  // sem memorização, para não arriscar números desatualizados.
  const base = { ledger, sessions, books: realBooks };
  const stats = getPeriodStats(base, range, now);
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

      <FormatSplit sessions={sessions} books={realBooks} range={range} />

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

      {isAll && (
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
      <p className="compare-list__legend">O histórico total não tem um “período anterior”: use a comparação abaixo para escolher dois períodos.</p>
    </Panel>
      )}

      <ComparePanel base={base} range={range} label={formatPeriodLabel(range)} isCurrent={isCurrent} now={now} weekStartsOn={weekStartsOn} />

      <HighlightTiles stats={stats} records={records} streak={streak} sessions={sessions} range={range} undatedFinished={undatedFinished} />

      <EvolutionPanel ledger={ledger} books={realBooks} range={range} now={now} weekStartsOn={weekStartsOn} periodLabel={formatPeriodLabel(range)} />

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
          <li>Na comparação personalizada você escolhe as duas faixas de datas (início e fim incluídos). Se os períodos tiverem tamanhos diferentes, compare pela média por dia.</li>
          <li>Na Evolução, o acumulado soma as páginas registradas dia a dia; o calendário colore cada dia pelos minutos lidos; as semanas mostram as últimas 12 semanas e a média delas.</li>
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
