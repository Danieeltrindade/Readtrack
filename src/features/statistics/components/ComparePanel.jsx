import { useState } from 'react';
import { Minus, MoveDownRight, MoveUpRight } from 'lucide-react';
import { Panel } from '../../../components/ui';
import { compareValues, getPeriodStats } from '../../../utils/stats.js';
import {
  addDays,
  diffInCalendarDays,
  fromInputDate,
  getComparableRange,
  getPeriodRange,
  startOfDay,
  toInputDate,
} from '../../../utils/date.js';
import { formatDayRange, formatDecimal, formatDuration, formatNumber, formatPercentChange, pluralize } from '../../../utils/format.js';

const PREVIOUS_NAMES = { day: 'dia anterior', week: 'semana anterior', month: 'mês anterior', quarter: '3 meses anteriores' };
const CURRENT_NAMES = { day: 'Hoje', week: 'Esta semana', month: 'Este mês', quarter: 'Últimos 3 meses' };

/** Um intervalo de datas [início, fim] inclusivo → período [start, end). */
function customRange(fromText, toText) {
  const from = fromInputDate(fromText);
  const to = fromInputDate(toText);
  if (!from || !to || to < from) return null;
  return { type: 'custom', start: startOfDay(from), end: addDays(startOfDay(to), 1) };
}

/**
 * Comparação entre dois períodos quaisquer: o período da página com o
 * anterior (padrão), atalhos prontos ou duas faixas de datas escolhidas.
 * Os números vêm de getPeriodStats (o mesmo livro-razão do resto da página).
 */
export function ComparePanel({ base, range, label, isCurrent, now, weekStartsOn }) {
  const pageType = range.type;
  const hasPagePreset = pageType !== 'all';
  const [preset, setPreset] = useState(hasPagePreset ? 'periodo' : 'mes');
  const today = startOfDay(now);
  const [dates, setDates] = useState(() => ({
    aFrom: toInputDate(addDays(today, -29)),
    aTo: toInputDate(today),
    bFrom: toInputDate(addDays(today, -59)),
    bTo: toInputDate(addDays(today, -30)),
  }));

  let a = null;
  let b = null;
  let aName = '';
  let bName = '';
  if (preset === 'periodo' && hasPagePreset) {
    a = range;
    b = getComparableRange(range, now, weekStartsOn);
    aName = isCurrent ? CURRENT_NAMES[pageType] : label;
    bName = b.partial ? `mesmos ${pluralize(b.days, 'dia')} do ${PREVIOUS_NAMES[pageType]}` : PREVIOUS_NAMES[pageType];
  } else if (preset === 'semana' || preset === 'mes') {
    const t = preset === 'semana' ? 'week' : 'month';
    a = getPeriodRange(t, now, weekStartsOn);
    b = getComparableRange(a, now, weekStartsOn);
    aName = CURRENT_NAMES[t];
    bName = b.partial ? `mesmos ${pluralize(b.days, 'dia')} do ${PREVIOUS_NAMES[t]}` : PREVIOUS_NAMES[t];
  } else if (preset === 'd30') {
    a = { type: 'custom', start: addDays(today, -29), end: addDays(today, 1) };
    b = { type: 'custom', start: addDays(today, -59), end: addDays(today, -29) };
    aName = 'Últimos 30 dias';
    bName = '30 dias antes';
  } else {
    a = customRange(dates.aFrom, dates.aTo);
    b = customRange(dates.bFrom, dates.bTo);
    aName = 'Período A';
    bName = 'Período B';
  }

  const presets = [
    hasPagePreset && { id: 'periodo', label: `${isCurrent ? CURRENT_NAMES[pageType] : label} × anterior` },
    pageType !== 'week' && { id: 'semana', label: 'Esta semana' },
    pageType !== 'month' && { id: 'mes', label: 'Este mês' },
    { id: 'd30', label: 'Últimos 30 dias' },
    { id: 'custom', label: 'Personalizado' },
  ].filter(Boolean);

  // Período em andamento: A vai só até hoje (os dias futuros não contam).
  const tomorrow = addDays(today, 1);
  if (a && a.end > tomorrow) a = { ...a, end: tomorrow };
  if (b && b.end > tomorrow) b = { ...b, end: tomorrow };
  const valid = Boolean(a && b) && a.end > a.start && b.end > b.start;
  const sa = valid ? getPeriodStats(base, a, now) : null;
  const sb = valid ? getPeriodStats(base, b, now) : null;
  const daysA = valid ? diffInCalendarDays(a.start, a.end) : 0;
  const daysB = valid ? diffInCalendarDays(b.start, b.end) : 0;

  const metrics = valid
    ? [
        { id: 'pages', label: 'Páginas', item: compareValues(sa.pages, sb.pages), format: (v) => `${formatNumber(v)} pág` },
        { id: 'seconds', label: 'Tempo de leitura', item: compareValues(sa.seconds, sb.seconds), format: formatDuration },
        { id: 'sessions', label: 'Sessões', item: compareValues(sa.sessions, sb.sessions), format: (v) => formatNumber(v) },
        { id: 'days', label: 'Dias com leitura', item: compareValues(sa.readingDays, sb.readingDays), format: (v) => formatNumber(v) },
        {
          id: 'perday',
          label: 'Média por dia',
          item: compareValues(Math.round((sa.averages.pagesPerDay ?? 0) * 10) / 10, Math.round((sb.averages.pagesPerDay ?? 0) * 10) / 10),
          format: (v) => `${formatDecimal(v)} pág`,
        },
      ]
    : [];

  return (
    <Panel title="Comparação" className="compare">
      <div className="compare__presets" role="group" aria-label="O que comparar">
        {presets.map((p) => (
          <button key={p.id} type="button" className="compare__chip" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="compare__custom">
          <DateRange
            tag="A"
            from={dates.aFrom}
            to={dates.aTo}
            max={toInputDate(today)}
            onChange={(from, to) => setDates((d) => ({ ...d, aFrom: from, aTo: to }))}
          />
          <DateRange
            tag="B"
            from={dates.bFrom}
            to={dates.bTo}
            max={toInputDate(today)}
            onChange={(from, to) => setDates((d) => ({ ...d, bFrom: from, bTo: to }))}
          />
        </div>
      )}

      {!valid ? (
        <p className="compare__error" role="alert">
          Escolha as duas faixas de datas, com o início antes do fim.
        </p>
      ) : (
        <>
          <div className="compare__vs">
            <div className="compare__side compare__side--a">
              <span className="compare__tag">A</span>
              <strong>{aName}</strong>
              <span>
                {formatDayRange(a.start, a.end)} · {pluralize(daysA, 'dia')}
              </span>
            </div>
            <span className="compare__x" aria-hidden="true">
              ×
            </span>
            <div className="compare__side compare__side--b">
              <span className="compare__tag">B</span>
              <strong>{bName}</strong>
              <span>
                {formatDayRange(b.start, b.end)} · {pluralize(daysB, 'dia')}
              </span>
            </div>
          </div>

          <p className="compare__verdict">{verdict(metrics[0].item, metrics[1].item)}</p>
          {daysA !== daysB && <p className="compare__note">Os períodos têm tamanhos diferentes: a média por dia é a comparação mais justa.</p>}

          <ul className="duel">
            {metrics.map((m) => (
              <DuelRow key={m.id} label={m.label} item={m.item} format={m.format} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function DateRange({ tag, from, to, max, onChange }) {
  return (
    <fieldset className={`compare__range compare__range--${tag.toLowerCase()}`}>
      <legend>
        <span className="compare__tag">{tag}</span> Período {tag}
      </legend>
      <label>
        <span>De</span>
        <input type="date" value={from} max={max} onChange={(e) => onChange(e.target.value, to)} />
      </label>
      <label>
        <span>Até</span>
        <input type="date" value={to} max={max} onChange={(e) => onChange(from, e.target.value)} />
      </label>
    </fieldset>
  );
}

/** Frase-resumo: páginas primeiro; sem páginas nos dois, o tempo. */
function verdict(pages, seconds) {
  const item = pages.status === 'none' ? seconds : pages;
  const what = pages.status === 'none' ? 'tempo de leitura' : 'páginas';
  if (item.status === 'none') return 'Nenhuma leitura registrada nos dois períodos.';
  if (item.status === 'new') return `Sem leitura em B: tudo o que você leu em A é novo.`;
  if (item.status === 'stopped') return 'Nenhuma leitura em A; B teve leitura.';
  if (item.status === 'same') return `Mesmo número de ${what} nos dois períodos.`;
  const pct = Math.abs(Math.round(item.percent));
  if (pct === 0) return `Praticamente o mesmo ${what === 'páginas' ? 'número de páginas' : what} nos dois períodos.`;
  return what === 'páginas'
    ? `Você leu ${pct}% ${item.delta > 0 ? 'mais' : 'menos'} páginas em A do que em B.`
    : `Você leu ${pct}% ${item.delta > 0 ? 'mais' : 'menos'} tempo em A do que em B.`;
}

function DuelRow({ label, item, format }) {
  const max = Math.max(item.current, item.previous, 0.0001);
  const tone = item.status === 'up' || item.status === 'new' ? 'up' : item.status === 'down' || item.status === 'stopped' ? 'down' : 'neutral';
  const Icon = tone === 'up' ? MoveUpRight : tone === 'down' ? MoveDownRight : Minus;
  const percent = formatPercentChange(item.percent);
  let pill;
  if (item.status === 'none') pill = '—';
  else if (item.status === 'new') pill = 'novo';
  else if (item.status === 'same' || percent === 'igual') pill = 'igual';
  else pill = percent ?? `${item.delta > 0 ? '+' : '−'}${format(Math.abs(item.delta))}`;
  return (
    <li className="duel__row">
      <div className="duel__head">
        <span className="duel__label">{label}</span>
        <span className={`duel__pill duel__pill--${tone}`}>
          <Icon size={13} aria-hidden="true" /> {pill}
        </span>
      </div>
      <div className="duel__bars">
        <span className="duel__line">
          <span className="duel__tag">A</span>
          <span className="duel__track">
            <span className="duel__fill duel__fill--a" style={{ width: `${(item.current / max) * 100}%` }} />
          </span>
          <span className="duel__value tabular">{format(item.current)}</span>
        </span>
        <span className="duel__line">
          <span className="duel__tag">B</span>
          <span className="duel__track">
            <span className="duel__fill duel__fill--b" style={{ width: `${(item.previous / max) * 100}%` }} />
          </span>
          <span className="duel__value tabular">{format(item.previous)}</span>
        </span>
      </div>
    </li>
  );
}
