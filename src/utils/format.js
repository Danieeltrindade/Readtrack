import { toDate, toDateKey, diffInCalendarDays } from './date.js';

const LOCALE = 'pt-BR';

const numberFormatter = new Intl.NumberFormat(LOCALE);
const decimalFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' });
const fullDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const weekdayShortFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const dayMonthNumericFormatter = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' });

export function formatNumber(value) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatDecimal(value) {
  return decimalFormatter.format(Number.isFinite(value) ? value : 0);
}

/** 3725 s → "1 h 2 min"; 540 s → "9 min"; 30 s → "menos de 1 min". */
export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  if (seconds < 60) return seconds === 0 ? '0 min' : 'menos de 1 min';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatLongDate(value) {
  const date = toDate(value);
  return date ? longDateFormatter.format(date) : '';
}

export function formatShortDate(value) {
  const date = toDate(value);
  return date ? shortDateFormatter.format(date).replace('.', '') : '';
}

export function formatFullDate(value) {
  const date = toDate(value);
  return date ? fullDateFormatter.format(date) : '';
}

export function formatTime(value) {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : '';
}

export function formatWeekdayShort(value) {
  const date = toDate(value);
  return date ? weekdayShortFormatter.format(date).replace('.', '') : '';
}

/** "hoje", "ontem", "há 3 dias" ou a data curta. */
export function formatRelativeDay(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return '';
  const days = diffInCalendarDays(date, now);
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days > 1 && days < 7) return `há ${days} dias`;
  return formatShortDate(date);
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function getGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return 'Boa noite';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Cronômetro: 3725 s → { hours: '01', minutes: '02', seconds: '05' }. */
export function splitClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  return {
    hours: String(Math.floor(s / 3600)).padStart(2, '0'),
    minutes: String(Math.floor((s % 3600) / 60)).padStart(2, '0'),
    seconds: String(s % 60).padStart(2, '0'),
  };
}

/** 3725 s → "01:02:05". */
export function formatClock(totalSeconds) {
  const { hours, minutes, seconds } = splitClock(totalSeconds);
  return `${hours}:${minutes}:${seconds}`;
}

const monthYearFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });
const dayMonthFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const weekdayLongFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

const stripDot = (text) => text.replace(/\./g, '');

/** Rótulo de um período: "quinta-feira, 15 de outubro", "12–18 out", "outubro de 2026". */
export function formatPeriodLabel(range) {
  if (!range) return '';
  if (range.type === 'day') return weekdayLongFormatter.format(range.start);
  if (range.type === 'quarter') return `${formatDayRange(range.start, range.end)} ${new Date(range.end.getTime() - 1).getFullYear()}`;
  if (range.type === 'all') return `Desde ${stripDot(dayMonthFormatter.format(range.start))} ${range.start.getFullYear()}`;
  if (range.type === 'week') {
    const last = new Date(range.end);
    last.setDate(last.getDate() - 1);
    const sameMonth = last.getMonth() === range.start.getMonth();
    return sameMonth
      ? `${range.start.getDate()}–${stripDot(dayMonthFormatter.format(last))}`
      : `${stripDot(dayMonthFormatter.format(range.start))} – ${stripDot(dayMonthFormatter.format(last))}`;
  }
  return monthYearFormatter.format(range.start);
}

/** Intervalo de dias de um período parcial: "1–15 set". */
export function formatDayRange(start, endExclusive) {
  const last = new Date(endExclusive);
  last.setDate(last.getDate() - 1);
  if (last <= start) return stripDot(dayMonthFormatter.format(start));
  return last.getMonth() === start.getMonth()
    ? `${start.getDate()}–${stripDot(dayMonthFormatter.format(last))}`
    : `${stripDot(dayMonthFormatter.format(start))} – ${stripDot(dayMonthFormatter.format(last))}`;
}

/** "+12%", "−8%", "igual" ou null quando não há base de comparação. */
export function formatPercentChange(percent) {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return null;
  const rounded = Math.round(percent);
  if (rounded === 0) return 'igual';
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded))}%`;
}

/** Minutos inteiros → "1 h 05 min" curto para eixos e tabelas. */
export function formatMinutes(minutes) {
  return formatDuration((Number(minutes) || 0) * 60);
}

/** Período de uma sessão: "20:00–20:45" (ou só o início, se não houver término diferente). */
export function formatSessionPeriod(session) {
  const start = formatTime(session.startedAt);
  if (!session.finishedAt) return start;
  const end = formatTime(session.finishedAt);
  // Terminou em outro dia (ex.: passou da meia-noite): mostra a data final.
  if (toDateKey(session.finishedAt) !== toDateKey(session.startedAt)) {
    return `${start} → ${dayMonthNumericFormatter.format(toDate(session.finishedAt))} ${end}`;
  }
  return end !== start ? `${start}–${end}` : start;
}

const monthShortFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'short' });

/**
 * Rótulos de um balde dos gráficos (veja getPeriodBuckets):
 * { label } curto para o eixo e { longLabel } para dica e tabela.
 * `multiYear`: inclui o ano nos rótulos de mês quando a série cruza anos.
 */
export function formatBucketLabels(bucket, { rangeType, multiYear = false } = {}) {
  const { kind, start, end } = bucket;
  const month = (date) => stripDot(monthShortFormatter.format(date));
  if (kind === 'hour') {
    const h = String(start.getHours()).padStart(2, '0');
    return { label: `${h}h`, longLabel: `${h}:00–${String((start.getHours() + 1) % 24).padStart(2, '0')}:00` };
  }
  if (kind === 'day') {
    const label = rangeType === 'week' ? formatWeekdayShort(start) : rangeType === 'month' ? String(start.getDate()) : dayMonthNumericFormatter.format(start);
    return { label, longLabel: formatFullDate(start) };
  }
  if (kind === 'week') return { label: dayMonthNumericFormatter.format(start), longLabel: `Semana de ${formatDayRange(start, end)}` };
  if (kind === 'month') {
    return {
      label: multiYear ? `${month(start)}/${String(start.getFullYear()).slice(2)}` : month(start),
      longLabel: monthYearFormatter.format(start),
    };
  }
  const last = new Date(end.getTime() - 1);
  return {
    label: `${month(start)}–${month(last)}${multiYear ? `/${String(last.getFullYear()).slice(2)}` : ''}`,
    longLabel: `${month(start)} – ${month(last)} de ${last.getFullYear()}`,
  };
}
