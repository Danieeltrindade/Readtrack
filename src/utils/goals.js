/**
 * Metas de leitura — funções puras.
 *
 * - Meta diária: minutos EFETIVOS lidos no dia local de hoje (pausas não contam).
 * - Meta semanal: páginas REGISTRADAS na semana atual (inclui releitura,
 *   pois mede o hábito de ler, não o avanço no livro).
 * - Uma meta com valor null está "não configurada".
 * - Status: 'not-configured' | 'not-started' | 'in-progress' | 'done'.
 */
import { addDays, startOfDay, startOfWeek } from './date.js';
import { summarizeRange } from './ledger.js';

export const GOAL_LIMITS = Object.freeze({
  dailyMinutes: { min: 1, max: 1440 },
  weeklyPages: { min: 1, max: 10000 },
});

export const DEFAULT_GOALS = Object.freeze({ dailyMinutes: 30, weeklyPages: 150 });

/** Aceita inteiro dentro dos limites ou null (meta desligada). */
export function normalizeGoalValue(value, key) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  const { min, max } = GOAL_LIMITS[key];
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function normalizeGoals(goals) {
  const source = goals && typeof goals === 'object' ? goals : DEFAULT_GOALS;
  return {
    dailyMinutes: 'dailyMinutes' in source ? normalizeGoalValue(source.dailyMinutes, 'dailyMinutes') : DEFAULT_GOALS.dailyMinutes,
    weeklyPages: 'weeklyPages' in source ? normalizeGoalValue(source.weeklyPages, 'weeklyPages') : DEFAULT_GOALS.weeklyPages,
  };
}

/** Valida o formulário de metas. Campo desligado (`enabled: false`) vira null. */
export function validateGoalsForm({ dailyEnabled, dailyMinutes, weeklyEnabled, weeklyPages }) {
  const errors = {};
  const data = { dailyMinutes: null, weeklyPages: null };
  const check = (enabled, raw, key, message) => {
    if (!enabled) return;
    const text = String(raw ?? '').trim();
    const n = /^\d+$/.test(text) ? Number(text) : NaN;
    const { min, max } = GOAL_LIMITS[key];
    if (Number.isNaN(n) || n < min || n > max) errors[key] = message;
    else data[key] = n;
  };
  check(dailyEnabled, dailyMinutes, 'dailyMinutes', 'Use um número inteiro entre 1 e 1440 minutos.');
  check(weeklyEnabled, weeklyPages, 'weeklyPages', 'Use um número inteiro entre 1 e 10.000 páginas.');
  return { valid: Object.keys(errors).length === 0, errors, data };
}

function statusFor(value, target) {
  if (!target) return 'not-configured';
  if (value >= target) return 'done';
  return value > 0 ? 'in-progress' : 'not-started';
}

export const GOAL_STATUS_LABELS = {
  'not-configured': 'Não configurada',
  'not-started': 'Ainda não começou',
  'in-progress': 'Em andamento',
  done: 'Concluída',
};

/** Progresso das metas de hoje e desta semana, com histórico recente. */
export function getGoalProgress({ ledger, goals, now = new Date(), weekStartsOn = 'monday' }) {
  const { dailyMinutes, weeklyPages } = normalizeGoals(goals);

  const today = summarizeRange(ledger, startOfDay(now), addDays(now, 1));
  const todayMinutes = Math.floor(today.seconds / 60);
  const weekStart = startOfWeek(now, weekStartsOn);
  const week = summarizeRange(ledger, weekStart, addDays(weekStart, 7));

  const lastDays = summarizeRange(ledger, addDays(now, -6), addDays(now, 1)).days.map((d) => {
    const minutes = Math.floor(d.seconds / 60);
    return { dateKey: d.dateKey, date: d.date, minutes, met: Boolean(dailyMinutes) && minutes >= dailyMinutes };
  });

  const lastWeeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = addDays(weekStart, -7 * i);
    const s = summarizeRange(ledger, start, addDays(start, 7));
    lastWeeks.push({ start, pages: s.pages, met: Boolean(weeklyPages) && s.pages >= weeklyPages, current: i === 0 });
  }

  return {
    daily: {
      configured: Boolean(dailyMinutes),
      target: dailyMinutes,
      value: todayMinutes,
      remaining: dailyMinutes ? Math.max(0, dailyMinutes - todayMinutes) : null,
      ratio: dailyMinutes ? Math.min(1, todayMinutes / dailyMinutes) : 0,
      status: statusFor(todayMinutes, dailyMinutes),
      history: lastDays,
      metDays: lastDays.filter((d) => d.met).length,
    },
    weekly: {
      configured: Boolean(weeklyPages),
      target: weeklyPages,
      value: week.pages,
      remaining: weeklyPages ? Math.max(0, weeklyPages - week.pages) : null,
      ratio: weeklyPages ? Math.min(1, week.pages / weeklyPages) : 0,
      status: statusFor(week.pages, weeklyPages),
      history: lastWeeks,
      metWeeks: lastWeeks.filter((w) => w.met && !w.current).length,
      daysLeft: Math.max(0, 7 - Math.round((startOfDay(now) - weekStart) / 86_400_000) - 1),
    },
  };
}

/**
 * Semanas em que a meta semanal (páginas registradas) foi cumprida, desde a
 * primeira semana com leitura até a atual — mesma regra de getGoalProgress.
 * Cada item traz o dia em que a semana atingiu a meta (dado real do livro-razão).
 * Usa a meta ATUAL: o ReadTrack não guarda o histórico de metas antigas.
 */
export function getWeeklyGoalHistory({ ledger, weeklyPages, weekStartsOn = 'monday', now = new Date() }) {
  const target = normalizeGoalValue(weeklyPages, 'weeklyPages');
  if (!target) return [];
  const keys = [...ledger.keys()].sort();
  if (keys.length === 0) return [];
  const met = [];
  const last = startOfWeek(now, weekStartsOn);
  for (let start = startOfWeek(new Date(`${keys[0]}T12:00:00`), weekStartsOn); start <= last; start = addDays(start, 7)) {
    const week = summarizeRange(ledger, start, addDays(start, 7));
    if (week.pages < target) continue;
    let running = 0;
    const day = week.days.find((d) => (running += d.pages) >= target);
    met.push({ start, pages: week.pages, metOn: day.date });
  }
  return met;
}
