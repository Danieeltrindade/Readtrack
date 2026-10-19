/**
 * Conquistas — funções puras, calculadas dos REGISTROS de leitura.
 *
 * Organização: categorias com níveis progressivos, do fácil ao difícil
 * (páginas, tempo, sessões, dias com leitura, sequência, meta semanal e
 * livros concluídos). Valem os dados históricos: nada precisa ser relido.
 *
 * Regras
 * - Desbloqueada = os seus registros atuais atingem o objetivo. Adicionar,
 *   editar ou excluir uma sessão recalcula tudo (inclusive pode voltar a
 *   "em andamento", se os dados deixarem de alcançar o nível).
 *   Exceção: meta semanal — o ReadTrack não guarda o histórico das metas,
 *   então uma semana já cumprida não é desfeita se você mudar a meta depois.
 * - A data de desbloqueio é o momento real em que o objetivo foi atingido
 *   (a sessão que passou de 100 páginas, o dia que completou a sequência).
 *   Se já estava salva, a data salva é mantida.
 * - Dados de demonstração não contam. Cada sessão conta uma vez (por id).
 * - Tempo: só sessões com duração registrada válida (> 0).
 * - Dias e sequências: dias do calendário local com leitura de fato no
 *   livro-razão (sessões que passam da meia-noite contam nos dois dias).
 * - Sequência: o nível é desbloqueado pela MAIOR sequência já feita; o
 *   progresso do próximo nível usa a sequência ATUAL (a que pode crescer).
 */
import { fromDateKey, toDate } from './date.js';
import { buildLedger, getReadingDayKeys } from './ledger.js';
import { calculateStreakFromLedger } from './stats.js';
import { getWeeklyGoalHistory } from './goals.js';
import { hasKnownDuration } from './duration.js';

const HOUR = 3600;

/** Categorias, na ordem de exibição padrão. `unit` é usado nos textos de progresso. */
export const ACHIEVEMENT_CATEGORIES = [
  { id: 'pages', title: 'Páginas', metric: 'pages', unit: 'páginas' },
  { id: 'time', title: 'Tempo de leitura', metric: 'seconds', unit: 'tempo' },
  { id: 'sessions', title: 'Sessões', metric: 'sessions', unit: 'sessões' },
  { id: 'days', title: 'Dias com leitura', metric: 'readingDays', unit: 'dias' },
  { id: 'streak', title: 'Sequência', metric: 'streak', unit: 'dias seguidos' },
  { id: 'weekly', title: 'Meta semanal', metric: 'weeklyGoal', unit: 'semanas' },
  { id: 'books', title: 'Livros concluídos', metric: 'finishedBooks', unit: 'livros' },
];

const fmt = (n) => n.toLocaleString('pt-BR');
const hoursText = (s) => (s < HOUR ? `${s / 60} minutos` : `${fmt(s / HOUR)} ${s === HOUR ? 'hora' : 'horas'}`);

/**
 * Alvos de cada nível (1.6.0: mais longos; a QUANTIDADE de níveis por
 * categoria é a mesma da 1.5.0 — 46 no total). Os primeiros continuam fáceis;
 * do meio para o fim, cada nível pede de 2 a 3 vezes o anterior.
 *
 *   categoria   1.5.0                                   1.6.0
 *   páginas     10 50 100 250 500 1000 2500 5000        10 50 150 400 1000 2500 6000 15000
 *   tempo       15min 1h 5h 10h 25h 50h 100h            15min 1h 5h 15h 40h 100h 250h
 *   sessões     1 5 10 25 50 100 250                    1 5 15 40 100 250 500
 *   dias        1 3 7 14 30 60 100                      1 3 10 25 60 150 300
 *   sequência   2 3 7 14 30 60                          2 4 10 21 45 90
 *   meta sem.   1 2 4 8 12 26                           1 3 6 12 26 52
 *   livros      1 3 5 10 25                             1 3 8 20 50
 *
 * O id de um nível inclui o alvo (ex.: 'pages-150'). Níveis cujo alvo não
 * mudou mantêm o id e a data salva; ids de alvos antigos que não existem mais
 * são retirados da lista salva e o nível novo é recalculado dos registros.
 */
export const LEVEL_TARGETS = Object.freeze({
  pages: [10, 50, 150, 400, 1000, 2500, 6000, 15000],
  time: [15 * 60, HOUR, 5 * HOUR, 15 * HOUR, 40 * HOUR, 100 * HOUR, 250 * HOUR],
  sessions: [1, 5, 15, 40, 100, 250, 500],
  days: [1, 3, 10, 25, 60, 150, 300],
  streak: [2, 4, 10, 21, 45, 90],
  weekly: [1, 3, 6, 12, 26, 52],
  books: [1, 3, 8, 20, 50],
});

const LEVELS = {
  pages: LEVEL_TARGETS.pages.map((t) => ({
    id: `pages-${t}`,
    target: t,
    title: `${fmt(t)} páginas`,
    description: `Registre ${fmt(t)} páginas lidas em sessões.`,
  })),
  time: LEVEL_TARGETS.time.map((t) => ({
    id: t < HOUR ? `time-${t / 60}m` : `time-${t / HOUR}h`,
    target: t,
    title: t < HOUR ? `${t / 60} minutos de leitura` : `${fmt(t / HOUR)} ${t === HOUR ? 'hora' : 'horas'} de leitura`,
    description: `Acumule ${hoursText(t)} de leitura registrada.`,
  })),
  sessions: LEVEL_TARGETS.sessions.map((t) => ({
    id: t === 1 ? 'first-session' : `sessions-${t}`,
    target: t,
    title: t === 1 ? 'Primeira sessão' : `${fmt(t)} sessões`,
    description: t === 1 ? 'Registre sua primeira sessão de leitura.' : `Registre ${fmt(t)} sessões de leitura.`,
  })),
  days: LEVEL_TARGETS.days.map((t) => ({
    id: `days-${t}`,
    target: t,
    title: t === 1 ? 'Primeiro dia de leitura' : `${t} dias de leitura`,
    description: t === 1 ? 'Leia em um dia do calendário.' : `Leia em ${t} dias diferentes (não precisam ser seguidos).`,
  })),
  streak: LEVEL_TARGETS.streak.map((t) => ({
    id: `streak-${t}`,
    target: t,
    title: `${t} dias seguidos`,
    description: `Leia em ${t} dias consecutivos.`,
  })),
  weekly: LEVEL_TARGETS.weekly.map((t) => ({
    id: `weekly-goal-${t}`,
    target: t,
    title: t === 1 ? 'Primeira meta semanal' : `Meta semanal em ${t} semanas`,
    description: t === 1 ? 'Cumpra a meta semanal de páginas em uma semana.' : `Cumpra a meta semanal de páginas em ${t} semanas.`,
  })),
  books: LEVEL_TARGETS.books.map((t) => ({
    id: t === 1 ? 'first-book' : `books-${t}`,
    target: t,
    title: t === 1 ? 'Primeiro livro concluído' : `${t} livros concluídos`,
    description: t === 1 ? 'Termine um livro.' : `Termine ${t} livros.`,
  })),
};

/** Lista plana de todas as conquistas (categoria + nível). */
export const ACHIEVEMENTS = ACHIEVEMENT_CATEGORIES.flatMap((category) =>
  LEVELS[category.id].map((level, index) => ({
    ...level,
    category: category.id,
    metric: category.metric,
    level: index + 1,
    levels: LEVELS[category.id].length,
  })),
);

const time = (value) => toDate(value)?.getTime() ?? 0;

/** Sessões reais, sem repetição de id. */
function realSessions(sessions) {
  const seen = new Set();
  return sessions.filter((s) => {
    if (s.isDemo || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/** Momento (ISO) em que cada total cumulativo atingiu cada alvo, em ordem cronológica. */
function cumulativeDates(sessions, metric, targets) {
  const ordered = [...sessions].sort((a, b) => time(a.finishedAt ?? a.startedAt) - time(b.finishedAt ?? b.startedAt));
  const reached = new Map();
  let total = 0;
  for (const s of ordered) {
    if (metric === 'sessions') total += 1;
    else if (metric === 'pages') total += Number(s.pagesRead) || 0;
    else if (metric === 'seconds') total += hasKnownDuration(s) ? Number(s.durationSeconds) : 0;
    const when = toDate(s.finishedAt ?? s.startedAt)?.toISOString();
    for (const t of targets) if (!reached.has(t) && total >= t) reached.set(t, when);
  }
  return reached;
}

const endOfDayIso = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
};

/** Dia em que a sequência de N dias foi completada pela primeira vez. */
function streakDate(readingDays, target) {
  let run = 0;
  let previous = null;
  for (const key of readingDays) {
    const date = fromDateKey(key);
    run = previous && Math.round((date - previous) / 86_400_000) === 1 ? run + 1 : 1;
    if (run >= target) return endOfDayIso(date);
    previous = date;
  }
  return null;
}

/**
 * Avalia todas as conquistas.
 * @param stored conquistas já salvas: [{ id, unlockedAt }]
 * @param goals  metas atuais (para a categoria "Meta semanal")
 * @returns lista plana: { id, category, level, title, description, target,
 *   value, best?, unlocked, unlockedAt, ratio (0–1), remaining, permanent? }
 */
export function evaluateAchievements({ books, sessions, stored = [], now = new Date(), goals = null, weekStartsOn = 'monday' }) {
  const own = realSessions(sessions);
  const ownBooks = books.filter((b) => !b.isDemo);
  const ledger = buildLedger(own);
  const readingDays = getReadingDayKeys(ledger);
  const streak = calculateStreakFromLedger(ledger, now);
  const weeklyTarget = goals?.weeklyPages ?? null;
  const weeks = getWeeklyGoalHistory({ ledger, weeklyPages: weeklyTarget, weekStartsOn, now });
  const finishedDates = ownBooks
    .filter((b) => b.status === 'finished' && toDate(b.finishedAt ?? b.createdAt))
    // Data de conclusão informada; livros já lidos sem data: data do cadastro.
    .map((b) => toDate(b.finishedAt ?? b.createdAt).toISOString())
    .sort();
  const storedById = new Map(stored.map((a) => [a.id, a]));
  // Meta semanal é permanente. Um nível salvo com alvo antigo (ex.:
  // 'weekly-goal-4', da 1.5.0) prova que N semanas já foram cumpridas: vale
  // para os níveis novos com alvo ≤ N, com a data mais antiga que o comprova.
  const weeklySaved = stored
    .map((a) => ({ n: Number(/^weekly-goal-(\d+)$/.exec(a.id)?.[1]), at: a.unlockedAt }))
    .filter((w) => Number.isInteger(w.n) && w.n > 0 && w.at);
  const savedWeeklyFor = (target) =>
    weeklySaved
      .filter((w) => w.n >= target)
      .map((w) => w.at)
      .sort()[0] ?? null;

  const totals = {
    pages: own.reduce((t, s) => t + (Number(s.pagesRead) || 0), 0),
    seconds: own.reduce((t, s) => t + (hasKnownDuration(s) ? Number(s.durationSeconds) : 0), 0),
    sessions: own.length,
    readingDays: readingDays.length,
    streak: streak.current,
    weeklyGoal: weeks.length,
    finishedBooks: finishedDates.length,
  };
  const dates = {
    pages: cumulativeDates(own, 'pages', LEVELS.pages.map((l) => l.target)),
    seconds: cumulativeDates(own, 'seconds', LEVELS.time.map((l) => l.target)),
    sessions: cumulativeDates(own, 'sessions', LEVELS.sessions.map((l) => l.target)),
  };

  return ACHIEVEMENTS.map((def) => {
    let achievedAt = null;
    if (def.metric in dates) achievedAt = dates[def.metric].get(def.target) ?? null;
    else if (def.metric === 'readingDays') achievedAt = readingDays[def.target - 1] ? endOfDayIso(fromDateKey(readingDays[def.target - 1])) : null;
    else if (def.metric === 'streak') achievedAt = streak.longest >= def.target ? streakDate(readingDays, def.target) : null;
    else if (def.metric === 'weeklyGoal') achievedAt = weeks[def.target - 1] ? endOfDayIso(weeks[def.target - 1].metOn) : null;
    else if (def.metric === 'finishedBooks') achievedAt = finishedDates[def.target - 1] ?? null;

    const saved = storedById.get(def.id);
    const permanent = def.metric === 'weeklyGoal';
    const permanentAt = permanent ? (saved?.unlockedAt ?? savedWeeklyFor(def.target)) : null;
    const unlocked = Boolean(achievedAt) || Boolean(permanentAt);
    const unlockedAt = unlocked ? (saved?.unlockedAt ?? permanentAt ?? achievedAt) : null;
    const value = totals[def.metric];
    return {
      ...def,
      value,
      best: def.metric === 'streak' ? streak.longest : undefined,
      unlocked,
      unlockedAt,
      permanent,
      ratio: unlocked ? 1 : Math.min(1, Math.max(0, value / def.target)),
      remaining: unlocked ? 0 : Math.max(0, def.target - value),
      // Meta semanal sem meta configurada: não dá para progredir.
      blocked: def.metric === 'weeklyGoal' && !weeklyTarget,
    };
  });
}

/**
 * Agrupa por categoria: níveis, quantos foram desbloqueados, o próximo nível
 * e o progresso até ele. Ordem: categorias em andamento mais perto do próximo
 * nível primeiro; categorias completas e bloqueadas por último.
 */
export function groupAchievements(evaluated) {
  const groups = ACHIEVEMENT_CATEGORIES.map((category) => {
    const levels = evaluated.filter((a) => a.category === category.id);
    const unlocked = levels.filter((a) => a.unlocked);
    const next = levels.find((a) => !a.unlocked) ?? null;
    const previousTarget = next && next.level > 1 ? levels[next.level - 2].target : 0;
    return {
      ...category,
      levels,
      unlockedCount: unlocked.length,
      complete: !next,
      current: unlocked[unlocked.length - 1] ?? null,
      next,
      // Progresso do próximo nível: valor atual ÷ alvo (ex.: 65 de 100 = 65%).
      ratio: next ? next.ratio : 1,
      previousTarget,
      blocked: Boolean(next?.blocked),
    };
  });
  const rank = (g) => (g.complete ? 2 : g.blocked ? 3 : 0);
  return groups.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? b.ratio - a.ratio : 0));
}

/** Conquistas recém-atingidas que ainda não estão salvas. */
export function findNewAchievements(evaluated, stored = []) {
  const saved = new Set(stored.map((a) => a.id));
  return evaluated.filter((a) => a.unlocked && !saved.has(a.id)).map((a) => ({ id: a.id, unlockedAt: a.unlockedAt }));
}

/**
 * Conquistas salvas que os registros atuais já não sustentam (ex.: a sessão
 * foi excluída). Saem da lista salva para que a tela e o banco reflitam os
 * dados reais. Meta semanal é permanente e nunca sai.
 *
 * Ids que não existem mais (alvos da 1.5.0 que mudaram, como 'pages-100')
 * também saem — DEPOIS que os níveis atuais equivalentes já estão salvos,
 * para que a informação de meta semanal cumprida nunca se perca no caminho.
 */
export function findStaleAchievements(evaluated, stored = []) {
  const byId = new Map(evaluated.map((a) => [a.id, a]));
  const pendingNew = evaluated.some((a) => a.unlocked && !stored.some((s) => s.id === a.id));
  return stored
    .filter((s) => {
      const a = byId.get(s.id);
      if (!a) return !pendingNew;
      return !a.unlocked && !a.permanent;
    })
    .map((s) => s.id);
}
