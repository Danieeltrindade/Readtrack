/**
 * Utilitários de data e REGRA DE CALENDÁRIO do ReadTrack.
 *
 * - Tudo usa o fuso horário LOCAL do navegador: "hoje" é o dia do
 *   calendário de quem está lendo, não o dia em UTC.
 * - Um dia vai de 00:00:00 até 23:59:59,999 (intervalo [início, próximo dia)).
 * - Semana começa na segunda-feira (padrão) ou no domingo, conforme a
 *   preferência `weekStartsOn`.
 * - Mês vai do dia 1 até o último dia do mês.
 * - Períodos são sempre meio-abertos: [start, end). Uma sessão às 23:59 é
 *   do dia em que aconteceu; à 00:00 já é do dia seguinte.
 * - Dias são contados por chave "AAAA-MM-DD" e somados com setDate(),
 *   então a mudança de horário de verão não cria nem apaga dias.
 */

export const WEEK_STARTS = Object.freeze({ monday: 1, sunday: 0 });

/** Converte string ISO, número ou Date em Date válido (ou null). */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Chave do dia local no formato AAAA-MM-DD. */
export function toDateKey(value) {
  const date = toDate(value);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "AAAA-MM-DD" → Date à meia-noite local (ou null). */
export function fromDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 ? date : null;
}

export function startOfDay(value) {
  const date = toDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(value, amount) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function addMonths(value, amount) {
  const date = startOfDay(value);
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

/** Início da semana. Padrão: segunda-feira (ISO / costume brasileiro de agenda). */
export function startOfWeek(value, weekStartsOn = 'monday') {
  const date = startOfDay(value);
  const first = WEEK_STARTS[weekStartsOn] ?? 1;
  const offset = (date.getDay() - first + 7) % 7;
  return addDays(date, -offset);
}

export function startOfMonth(value) {
  const date = toDate(value) ?? new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Diferença em dias de calendário entre duas datas (b - a). */
export function diffInCalendarDays(a, b) {
  const start = startOfDay(a);
  const end = startOfDay(b);
  // Math.round neutraliza a diferença de 1 h nas trocas de horário de verão.
  return Math.round((end - start) / 86_400_000);
}

export function isSameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

/** Verdadeiro se a data está em [start, end). */
export function isWithin(value, start, end) {
  const date = toDate(value);
  if (!date) return false;
  return date >= start && date < end;
}

/** Lista as chaves de dia em [start, end). */
export function listDateKeys(start, end) {
  const keys = [];
  for (let day = startOfDay(start); day < end; day = addDays(day, 1)) keys.push(toDateKey(day));
  return keys;
}

/* ---------- Períodos ---------- */

/**
 * Mesmo dia `amount` meses antes/depois, limitado ao último dia do mês
 * (31/05 − 3 meses = 28 ou 29/02). Datas reais do calendário, sem "30 dias".
 */
export function shiftMonthsClamped(value, amount) {
  const date = startOfDay(value);
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

export const PERIOD_TYPES = Object.freeze(['day', 'week', 'month', 'quarter', 'all']);

/**
 * Período que contém `anchor`: { type, start, end } com end exclusivo.
 * - quarter ("3 meses"): os últimos três meses terminando no dia `anchor`
 *   (inclusive), pelo calendário real: 18/10 → 19/07 a 18/10.
 * - all ("Histórico total"): do dia `firstDate` (primeiro registro) até hoje.
 */
export function getPeriodRange(type, anchor = new Date(), weekStartsOn = 'monday', { firstDate = null, now = new Date() } = {}) {
  if (type === 'quarter') {
    const end = addDays(anchor, 1);
    return { type, start: addDays(shiftMonthsClamped(anchor, -3), 1), end };
  }
  if (type === 'all') {
    const end = addDays(now, 1);
    const first = toDate(firstDate);
    const start = first && first < end ? startOfDay(first) : startOfDay(now);
    return { type, start, end };
  }
  if (type === 'day') {
    const start = startOfDay(anchor);
    return { type, start, end: addDays(start, 1) };
  }
  if (type === 'week') {
    const start = startOfWeek(anchor, weekStartsOn);
    return { type, start, end: addDays(start, 7) };
  }
  const start = startOfMonth(anchor);
  return { type: 'month', start, end: addMonths(start, 1) };
}

/** Período anterior (-1) ou seguinte (+1) do mesmo tipo. */
export function shiftPeriod(range, amount, weekStartsOn = 'monday') {
  // Histórico total não tem "anterior": é sempre tudo.
  if (range.type === 'all') return range;
  if (range.type === 'quarter') return getPeriodRange('quarter', shiftMonthsClamped(addDays(range.end, -1), 3 * amount), weekStartsOn);
  if (range.type === 'day') return getPeriodRange('day', addDays(range.start, amount), weekStartsOn);
  if (range.type === 'week') return getPeriodRange('week', addDays(range.start, 7 * amount), weekStartsOn);
  return getPeriodRange('month', addMonths(range.start, amount), weekStartsOn);
}

/** Verdadeiro se o período contém o dia de hoje. */
export function isCurrentPeriod(range, now = new Date()) {
  return isWithin(now, range.start, range.end);
}

/** Último instante considerado: não conta dias futuros. */
export function getElapsedEnd(range, now = new Date()) {
  const tomorrow = addDays(now, 1);
  return range.end < tomorrow ? range.end : tomorrow;
}

/** Quantos dias do período já começaram (inclui hoje, exclui futuros). */
export function countElapsedDays(range, now = new Date()) {
  const end = getElapsedEnd(range, now);
  return end <= range.start ? 0 : diffInCalendarDays(range.start, end);
}

/**
 * Período de comparação justo: o período anterior, cortado no mesmo número
 * de dias já decorridos no atual. Ex.: 1–15 de outubro × 1–15 de setembro.
 * Para períodos já encerrados, compara com o anterior completo.
 */
export function getComparableRange(range, now = new Date(), weekStartsOn = 'monday') {
  // Histórico total: não existe período anterior equivalente (não inventamos um).
  if (range.type === 'all') return null;
  const previous = shiftPeriod(range, -1, weekStartsOn);
  const elapsed = countElapsedDays(range, now);
  const total = diffInCalendarDays(range.start, range.end);
  if (elapsed >= total) return { ...previous, partial: false };
  const previousTotal = diffInCalendarDays(previous.start, previous.end);
  const days = Math.min(elapsed, previousTotal);
  return { ...previous, end: addDays(previous.start, days), partial: true, days };
}

/* ---------- Formulários ---------- */

/** Data → "AAAA-MM-DD" para <input type="date"> (vazio se inválida). */
export function toInputDate(value) {
  return toDateKey(value) ?? '';
}

/**
 * "AAAA-MM-DD" → Date ao meio-dia local. O meio-dia evita que fusos
 * horários empurrem a data para o dia anterior. Retorna null se inválida.
 */
export function fromInputDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Verdadeiro se a data cai depois do dia de hoje. */
export function isAfterToday(value, now = new Date()) {
  const date = toDate(value);
  return Boolean(date) && startOfDay(date) > startOfDay(now);
}

/** Data → "HH:MM" no horário local (para <input type="time">). */
export function toInputTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
