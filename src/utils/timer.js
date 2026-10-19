/**
 * Cronômetro de leitura — funções puras.
 *
 * A sessão ativa guarda uma lista de INTERVALOS DE LEITURA (segments):
 *   [{ start: ISO, end: ISO | null }, ...]
 * - Iniciar cria o primeiro intervalo com end = null (aberto).
 * - Pausar fecha o intervalo aberto.
 * - Continuar abre um novo intervalo.
 *
 * O tempo lido é SEMPRE recalculado somando (end − start) de cada
 * intervalo; o intervalo aberto usa "agora". Nada é incrementado a cada
 * segundo, então:
 * - aba em segundo plano, celular bloqueado ou navegador fechado não
 *   fazem o relógio atrasar;
 * - o tempo pausado nunca entra na conta, porque fica ENTRE intervalos;
 * - recarregar a página recupera exatamente o mesmo valor.
 */
import { toDate } from './date.js';

export const TIMER_STATUS = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  REVIEWING: 'reviewing', // usuário clicou em Finalizar e está preenchendo as páginas
});

/** Duração máxima aceita para uma sessão (24 h). */
export const MAX_SESSION_SECONDS = 24 * 60 * 60;

const toMs = (value) => toDate(value)?.getTime() ?? NaN;
const toIso = (value) => new Date(value).toISOString();

/** Fecha o intervalo aberto em `now` (nunca antes do próprio início). */
function closeOpenSegment(segments, now) {
  return segments.map((segment) => {
    if (segment.end !== null) return segment;
    const end = Math.max(toMs(segment.start), toMs(now));
    return { ...segment, end: toIso(end) };
  });
}

export function createActiveSession({ id, bookId, startPage, now }) {
  const startedAt = toIso(now);
  return {
    id,
    bookId,
    startPage,
    startedAt,
    status: TIMER_STATUS.RUNNING,
    segments: [{ start: startedAt, end: null }],
    reviewStartedAt: null,
    draft: null,
  };
}

export function pauseActiveSession(active, now) {
  if (!active || active.status !== TIMER_STATUS.RUNNING) return active;
  return { ...active, status: TIMER_STATUS.PAUSED, segments: closeOpenSegment(active.segments, now) };
}

export function resumeActiveSession(active, now) {
  if (!active || active.status !== TIMER_STATUS.PAUSED) return active;
  return {
    ...active,
    status: TIMER_STATUS.RUNNING,
    segments: [...active.segments, { start: toIso(now), end: null }],
  };
}

/** "Finalizar": congela o tempo enquanto o usuário informa as páginas. */
export function reviewActiveSession(active, now) {
  if (!active || active.status === TIMER_STATUS.REVIEWING) return active;
  return {
    ...active,
    status: TIMER_STATUS.REVIEWING,
    segments: closeOpenSegment(active.segments, now),
    reviewStartedAt: toIso(now),
  };
}

/** Volta do formulário para o cronômetro, que continua pausado. */
export function backToTimer(active) {
  if (!active || active.status !== TIMER_STATUS.REVIEWING) return active;
  return { ...active, status: TIMER_STATUS.PAUSED, reviewStartedAt: null };
}

/** Milissegundos efetivamente lidos (sem pausas). */
export function getElapsedMs(active, now = Date.now()) {
  if (!active?.segments) return 0;
  const nowMs = toMs(now);
  return active.segments.reduce((total, segment) => {
    const start = toMs(segment.start);
    const end = segment.end === null ? nowMs : toMs(segment.end);
    // Relógio do sistema voltou no tempo? O intervalo conta zero, nunca negativo.
    return Number.isFinite(start) && Number.isFinite(end) ? total + Math.max(0, end - start) : total;
  }, 0);
}

export function getElapsedSeconds(active, now = Date.now()) {
  return Math.floor(getElapsedMs(active, now) / 1000);
}

/** Tempo pausado: as lacunas entre o fim de um intervalo e o início do próximo. */
export function getPausedSeconds(active, now = Date.now()) {
  if (!active?.segments?.length) return 0;
  let paused = 0;
  for (let i = 1; i < active.segments.length; i += 1) {
    paused += Math.max(0, toMs(active.segments[i].start) - toMs(active.segments[i - 1].end));
  }
  // Pausa em andamento também conta (só para exibição).
  if (active.status === TIMER_STATUS.PAUSED) {
    paused += Math.max(0, toMs(now) - toMs(active.segments.at(-1).end));
  }
  return Math.floor(paused / 1000);
}

export function getPauseCount(active) {
  if (!active?.segments?.length) return 0;
  return active.segments.length - 1 + (active.status === TIMER_STATUS.PAUSED ? 1 : 0);
}

/** Momento em que a leitura terminou: fim do último intervalo. */
export function getFinishedAt(active, now = Date.now()) {
  const last = active?.segments?.at(-1);
  if (!last) return toIso(now);
  return last.end ?? toIso(now);
}

/** Verifica se uma sessão ativa vinda do armazenamento é coerente. */
export function isValidActiveSession(active) {
  if (!active || typeof active !== 'object') return false;
  if (typeof active.id !== 'string' || typeof active.bookId !== 'string') return false;
  if (!Object.values(TIMER_STATUS).includes(active.status)) return false;
  if (!Array.isArray(active.segments) || active.segments.length === 0) return false;
  const openCount = active.segments.filter((s) => s.end === null).length;
  if (active.status === TIMER_STATUS.RUNNING ? openCount !== 1 : openCount !== 0) return false;
  if (active.segments.at(-1).end !== null && active.status === TIMER_STATUS.RUNNING) return false;
  return active.segments.every((s) => Number.isFinite(toMs(s.start)) && (s.end === null || Number.isFinite(toMs(s.end))));
}
