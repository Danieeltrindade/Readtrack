import { useMemo, useState } from 'react';
import {
  Award,
  BookCheck,
  BookOpen,
  CalendarCheck,
  Check,
  Clock,
  Flame,
  Footprints,
  Pencil,
  Target,
  Trophy,
} from 'lucide-react';
import { Button, PageHeader, Panel, ProgressRing } from '../../components/ui';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { GOAL_STATUS_LABELS, getGoalProgress } from '../../utils/goals.js';
import { evaluateAchievements, groupAchievements } from '../../utils/achievements.js';
import { formatDuration, formatFullDate, formatNumber, formatShortDate, formatWeekdayShort, pluralize } from '../../utils/format.js';
import { GoalsForm } from './components/GoalsForm.jsx';
import './Goals.css';

const CATEGORY_ICONS = {
  pages: BookOpen,
  time: Clock,
  sessions: Footprints,
  days: CalendarCheck,
  streak: Flame,
  weekly: Target,
  books: BookCheck,
};

/**
 * Metas (configuração + progresso calculado das sessões) e Conquistas
 * (desbloqueadas automaticamente a partir dos dados reais).
 */
export default function GoalsPage() {
  useDocumentTitle('Metas e conquistas');
  const { books, sessions, goals, ledger, achievements, settings } = useData();
  const [editing, setEditing] = useState(false);

  const progress = getGoalProgress({ ledger, goals, weekStartsOn: settings.weekStartsOn });
  // Mesmo cálculo do DataProvider (que salva e avisa): registros reais, sem demonstração.
  const list = useMemo(
    () => evaluateAchievements({ books, sessions, stored: achievements, goals, weekStartsOn: settings.weekStartsOn }),
    [books, sessions, achievements, goals, settings.weekStartsOn],
  );
  const groups = groupAchievements(list);
  const unlockedTotal = list.filter((a) => a.unlocked).length;
  const recent = list
    .filter((a) => a.unlocked)
    .sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt))
    .slice(0, 3);

  return (
    <div className="page goals-page">
      <PageHeader
        title="Metas e conquistas"
        description="O progresso é calculado automaticamente a partir das suas sessões."
        actions={
          !editing && (
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Ajustar metas
            </Button>
          )
        }
      />

      {editing && (
        <Panel title="Ajustar metas">
          <GoalsForm onSaved={() => setEditing(false)} />
        </Panel>
      )}

      <section className="goal-cards" aria-label="Metas">
        <GoalCard
          title="Meta diária"
          unit="min"
          goal={progress.daily}
          configureHint="Defina quantos minutos quer ler por dia."
          onConfigure={() => setEditing(true)}
          summary={
            progress.daily.status === 'done'
              ? 'Meta de hoje cumprida.'
              : progress.daily.configured
                ? `Faltam ${formatNumber(progress.daily.remaining)} min hoje.`
                : null
          }
          footer={
            <>
              <p className="goal-card__history-label">
                Últimos 7 dias: {progress.daily.configured ? `${progress.daily.metDays} de 7 dias cumpridos` : 'minutos lidos'}
              </p>
              <ol className="day-dots">
                {progress.daily.history.map((d) => (
                  <li key={d.dateKey} className={d.met ? 'is-met' : d.minutes > 0 ? 'is-partial' : ''}>
                    <span className="day-dots__dot" aria-hidden="true">
                      {d.met && <Check size={12} />}
                    </span>
                    <span className="day-dots__label">{formatWeekdayShort(d.date)}</span>
                    <span className="visually-hidden">
                      {formatFullDate(d.date)}: {d.minutes} min{d.met ? ', meta cumprida' : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          }
        />
        <GoalCard
          title="Meta semanal"
          unit="páginas"
          goal={progress.weekly}
          configureHint="Defina quantas páginas quer ler por semana."
          onConfigure={() => setEditing(true)}
          summary={
            progress.weekly.status === 'done'
              ? 'Meta da semana cumprida.'
              : progress.weekly.configured
                ? `Faltam ${formatNumber(progress.weekly.remaining)} páginas; ${pluralize(progress.weekly.daysLeft, 'dia restante', 'dias restantes')} depois de hoje.`
                : null
          }
          footer={
            <>
              <p className="goal-card__history-label">
                Últimas 8 semanas{progress.weekly.configured ? `: ${progress.weekly.metWeeks} de 7 semanas completas cumpridas` : ''}
              </p>
              <WeekBars weeks={progress.weekly.history} target={progress.weekly.target} />
            </>
          }
        />
      </section>

      <section className="achievements" aria-labelledby="achievements-title">
        <div className="achievements__header">
          <h2 id="achievements-title">
            <Trophy size={22} aria-hidden="true" /> Conquistas
          </h2>
          <p className="tabular">
            {unlockedTotal} de {list.length} níveis desbloqueados
          </p>
        </div>

        {recent.length > 0 && (
          <p className="achievements__recent">
            <span>Últimas desbloqueadas:</span>{' '}
            {recent.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ' · '}
                <strong>{a.title}</strong> <span className="achievements__recent-date">{formatShortDate(a.unlockedAt)}</span>
              </span>
            ))}
          </p>
        )}

        <ul className="achievement-grid">
          {groups.map((group) => (
            <AchievementCategory key={group.id} group={group} onConfigure={() => setEditing(true)} />
          ))}
        </ul>
        <p className="achievements__note">
          Tudo é calculado das suas sessões (dados de demonstração não contam): adicionar, editar ou excluir uma sessão atualiza o progresso, e
          um nível volta a “em andamento” se os registros deixarem de alcançá-lo. Tempo conta só sessões com duração registrada. Dias e
          sequências usam o seu calendário (pelo menos 1 minuto ou 1 página no dia); a sequência é desbloqueada pela maior que você já fez,
          e o progresso do próximo nível usa a atual. A meta semanal usa a meta de páginas atual e, uma vez cumprida, não é desfeita.
        </p>
      </section>
    </div>
  );
}

/** Valor no formato da categoria: "65 páginas", "45 min", "3 dias seguidos". */
function formatAchievementValue(metric, value) {
  if (metric === 'seconds') return formatDuration(value);
  return formatNumber(value);
}

const UNIT_LABELS = {
  pages: 'páginas',
  sessions: 'sessões',
  readingDays: 'dias',
  streak: 'dias seguidos',
  weeklyGoal: 'semanas',
  finishedBooks: 'livros',
};

/** Uma categoria: anel com o progresso do próximo nível, níveis e histórico. */
function AchievementCategory({ group, onConfigure }) {
  const Icon = CATEGORY_ICONS[group.id] ?? Award;
  const { next } = group;
  const percent = Math.round(group.ratio * 100);
  const unit = UNIT_LABELS[group.metric];
  const progressText = next
    ? `${formatAchievementValue(group.metric, Math.min(next.value, next.target))} / ${formatAchievementValue(group.metric, next.target)}${unit ? ` ${unit}` : ''}`
    : null;
  return (
    <li className={`achievement ${group.complete ? 'is-complete' : ''} ${group.unlockedCount > 0 ? 'has-unlocked' : ''} ${group.blocked ? 'is-blocked' : ''}`}>
      <div className="achievement__ring">
        <ProgressRing
          ratio={group.ratio}
          size={84}
          stroke={7}
          label={next ? `${group.title}: ${percent}% do próximo nível (${next.title})` : `${group.title}: todos os níveis desbloqueados`}
        >
          <span className="achievement__icon" aria-hidden="true">
            <Icon size={26} />
          </span>
        </ProgressRing>
        <span className="achievement__percent tabular" aria-hidden="true">
          {group.complete ? <Check size={14} /> : `${percent}%`}
        </span>
      </div>
      <div className="achievement__body">
        <p className="achievement__category">
          {group.title} · <span className="tabular">nível {group.unlockedCount} de {group.levels.length}</span>
        </p>
        {group.complete ? (
          <>
            <h3 className="achievement__title">Todos os níveis desbloqueados</h3>
            <p className="achievement__description">Último: {group.current.title}, em {formatShortDate(group.current.unlockedAt)}.</p>
          </>
        ) : (
          <>
            <h3 className="achievement__title">
              <span className="visually-hidden">Próximo nível: </span>
              {next.title}
            </h3>
            <p className="achievement__description">{next.description}</p>
            {group.blocked ? (
              <p className="achievement__progress-text">
                Configure a meta semanal para começar.{' '}
                <button type="button" className="achievement__link" onClick={onConfigure}>
                  Configurar
                </button>
              </p>
            ) : (
              <p className="achievement__progress-text tabular">
                <strong>{progressText}</strong>
                {group.metric === 'streak' && next.best > 0 && <span> · maior sequência: {pluralize(next.best, 'dia')}</span>}
              </p>
            )}
          </>
        )}
        <ol className="achievement__levels" aria-label={`Níveis de ${group.title}`}>
          {group.levels.map((level) => (
            <li
              key={level.id}
              className={level.unlocked ? 'is-unlocked' : next?.id === level.id ? 'is-next' : ''}
              title={`${level.title}${level.unlocked ? ` — desbloqueada em ${formatShortDate(level.unlockedAt)}` : ''}`}
            >
              <span className="visually-hidden">
                {level.title}: {level.unlocked ? `desbloqueada em ${formatShortDate(level.unlockedAt)}` : 'bloqueada'}
              </span>
            </li>
          ))}
        </ol>
        {group.unlockedCount > 0 && (
          <details className="achievement__history">
            <summary>Ver desbloqueadas ({group.unlockedCount})</summary>
            <ul>
              {group.levels
                .filter((level) => level.unlocked)
                .map((level) => (
                  <li key={level.id}>
                    <Check size={12} aria-hidden="true" /> {level.title}
                    <span className="tabular">{formatShortDate(level.unlockedAt)}</span>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

function GoalCard({ title, unit, goal, summary, footer, configureHint, onConfigure }) {
  return (
    <Panel title={title} className={`goal-card goal-card--${goal.status}`} action={<span className={`goal-status goal-status--${goal.status}`}>{GOAL_STATUS_LABELS[goal.status]}</span>}>
      {goal.configured ? (
        <div className="goal-card__main">
          <ProgressRing ratio={goal.ratio} size={112} stroke={9} label={`${title}: ${Math.round(goal.ratio * 100)}%`}>
            <span className="goal-card__ring tabular">
              {Math.round(goal.ratio * 100)}%
            </span>
          </ProgressRing>
          <div>
            <p className="goal-card__value tabular">
              <strong>{formatNumber(goal.value)}</strong> de {formatNumber(goal.target)} {unit}
            </p>
            {summary && <p className="goal-card__summary">{summary}</p>}
          </div>
        </div>
      ) : (
        <div className="goal-card__empty">
          <Target size={22} aria-hidden="true" />
          <div>
            <p>{configureHint}</p>
            <p className="goal-card__summary tabular">
              Agora: {formatNumber(goal.value)} {unit}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onConfigure}>
            Configurar
          </Button>
        </div>
      )}
      <div className="goal-card__footer">{footer}</div>
    </Panel>
  );
}

function WeekBars({ weeks, target }) {
  const max = Math.max(target ?? 0, ...weeks.map((w) => w.pages), 1);
  return (
    <ol className="week-bars">
      {weeks.map((w) => (
        <li key={w.start.toISOString()} className={`${w.met ? 'is-met' : ''} ${w.current ? 'is-current' : ''}`}>
          <span className="week-bars__bar" style={{ height: `${Math.max(3, (w.pages / max) * 100)}%` }} aria-hidden="true" />
          <span className="week-bars__label">{`${w.start.getDate()}/${w.start.getMonth() + 1}`}</span>
          <span className="visually-hidden">
            Semana de {formatShortDate(w.start)}: {w.pages} páginas{w.met ? ', meta cumprida' : ''}
            {w.current ? ' (semana atual)' : ''}
          </span>
        </li>
      ))}
      {target && (
        // A linha da meta fica na mesma escala das barras (área acima dos rótulos).
        <span className="week-bars__target" style={{ bottom: `calc(18px + (100% - 18px) * ${target / max})` }} aria-hidden="true" />
      )}
    </ol>
  );
}
