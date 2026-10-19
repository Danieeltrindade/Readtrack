/**
 * Durações de sessões — funções puras.
 *
 * DURAÇÃO REGISTRADA × DURAÇÃO CALCULADA
 * - Registrada (session.durationSeconds): o tempo efetivo de leitura. No
 *   cronômetro é medido; num registro manual é o que o usuário anotou e é
 *   preservado exatamente (pode ser null quando não se sabe).
 * - Calculada: a diferença entre os instantes de início e término. Pode
 *   diferir da registrada (pausas, anotações arredondadas). Nunca é somada
 *   à registrada nem a substitui.
 * As estatísticas usam SEMPRE a registrada; sem ela, a sessão não tem tempo.
 */

export const MAX_RECORDED_SECONDS = 24 * 60 * 60;

/** Diferença entre dois instantes, em segundos (null se faltar algum ou se o fim for antes). */
export function calculateElapsedSeconds(start, end) {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 1000);
}

/**
 * Texto de duração → segundos.
 * Aceita "h:mm:ss" (1:03:00), "mm:ss" (53:09) ou só minutos ("45").
 * Devolve { seconds } ou { error }. Texto vazio → { seconds: null }.
 */
export function parseDurationText(text) {
  const value = String(text ?? '').trim();
  if (!value) return { seconds: null };
  if (/^\d{1,4}$/.test(value)) return { seconds: Number(value) * 60 };
  const parts = value.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) {
    return { error: 'Use h:mm:ss, mm:ss ou só os minutos (ex.: 1:03:00, 53:09 ou 45).' };
  }
  const numbers = parts.map(Number);
  const [h, m, s] = numbers.length === 3 ? numbers : [0, ...numbers];
  if (m > 59 && numbers.length === 3) return { error: 'Os minutos vão de 00 a 59.' };
  if (s > 59) return { error: 'Os segundos vão de 00 a 59.' };
  return { seconds: h * 3600 + m * 60 + s };
}

/** Segundos → "h:mm:ss" (ou "mm:ss" abaixo de 1 hora), como se anota. */
export function formatDurationText(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Diferença relevante entre registrada e calculada? Horários anotados têm
 * precisão de minuto, então diferenças de até 1 minuto não contam.
 */
export const DIVERGENCE_TOLERANCE_SECONDS = 60;

export function getDurationDivergence(session) {
  const recorded = session.durationSeconds;
  const calculated = calculateElapsedSeconds(session.startedAt, session.finishedAt);
  if (recorded === null || recorded === undefined || calculated === null) return null;
  // Cronômetro: as pausas ficam entre o início e o término, mas não são
  // leitura. Descontá-las evita um aviso falso em sessões pausadas.
  const paused = session.source === 'manual' ? 0 : Math.max(0, Number(session.pausedSeconds) || 0);
  if (paused && Math.abs(recorded - (calculated - paused)) <= DIVERGENCE_TOLERANCE_SECONDS) return null;
  const difference = recorded - calculated;
  if (Math.abs(difference) <= DIVERGENCE_TOLERANCE_SECONDS) return null;
  return { recorded, calculated, difference };
}

/** A sessão tem duração conhecida (> 0)? */
export const hasKnownDuration = (session) => Number(session?.durationSeconds) > 0;
