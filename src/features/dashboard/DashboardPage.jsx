import { useMemo, useState } from 'react';
import { Flame, Plus, Timer } from 'lucide-react';
import { Button } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { getDashboardSummary } from '../../utils/stats.js';
import { formatLongDate, getGreeting, pluralize } from '../../utils/format.js';
import { evaluateAchievements } from '../../utils/achievements.js';
import { collectNotebook, countByType } from '../../utils/annotations.js';
import { getCurrentWeekByFormat, getNextAchievement, getReadingBooks, sumWeekByFormat } from '../../utils/dashboard.js';
import { NowReading } from './components/NowReading.jsx';
import { Highlights, LatestNotes, SessionsByDay, TodayCard, WeekByFormat } from './components/DashboardBlocks.jsx';
import { ReadingLedger } from './components/ReadingLedger.jsx';
import { DemoBanner } from './components/DemoBanner.jsx';
import { ManualSessionDialog } from '../history/components/ManualSessionDialog.jsx';
import './Dashboard.css';

/**
 * Painel (1.7.0): meta de hoje (anel), "Lendo agora" com a animação do
 * formato, destaques, semana por formato, últimas anotações e sessões.
 */
export default function DashboardPage() {
  useDocumentTitle('Início');
  const ROUTES = usePaths();
  const { books, sessions, goals, settings, ledger, hasDemoData, activeSession, achievements } = useData();
  const [manualFor, setManualFor] = useState(null); // id do livro (ou '' para escolher)

  const summary = useMemo(
    () => getDashboardSummary({ books, sessions, goals, ledger }, new Date(), settings.weekStartsOn),
    [books, sessions, goals, ledger, settings.weekStartsOn],
  );
  const week = useMemo(() => getCurrentWeekByFormat({ sessions, books }, new Date(), settings.weekStartsOn), [sessions, books, settings.weekStartsOn]);
  const weekTotals = useMemo(() => sumWeekByFormat(week), [week]);
  const today = week.find((d) => d.isToday) ?? { seconds: { print: 0, digital: 0, audio: 0 }, totalSeconds: 0 };
  const readingBooks = useMemo(() => getReadingBooks(books, sessions), [books, sessions]);
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const next = useMemo(
    () => getNextAchievement(evaluateAchievements({ books, sessions, stored: achievements, goals, weekStartsOn: settings.weekStartsOn })),
    [books, sessions, achievements, goals, settings.weekStartsOn],
  );
  const notebook = useMemo(() => collectNotebook({ books, sessions }), [books, sessions]);
  const notebookCounts = countByType(notebook);
  const latestNotes = notebook.filter((e) => e.type !== 'summary').slice(0, 8);

  const now = new Date();
  const greeting = settings.userName ? `${getGreeting(now)}, ${settings.userName}` : getGreeting(now);
  const streak = summary.streak;

  return (
    <div className="page dashboard">
      <header className="dashboard__header">
        <div className="dashboard__hello">
          <div className="dashboard__meta">
            <span className="dashboard__date">{formatLongDate(now)}</span>
            {streak.current > 0 && (
              <span className={`dashboard__streak ${streak.readToday ? 'is-lit' : ''}`}>
                <Flame size={13} aria-hidden="true" />
                {pluralize(streak.current, 'dia seguido', 'dias seguidos')}
              </span>
            )}
          </div>
          <h1>{greeting}</h1>
        </div>
        <div className="dashboard__actions">
          <Button variant="secondary" icon={Plus} onClick={() => setManualFor('')} disabled={books.length === 0}>
            <span className="dashboard__btn-label">Registrar sessão</span>
          </Button>
          <Button to={ROUTES.reading} icon={Timer}>
            {activeSession ? 'Voltar ao cronômetro' : 'Ler agora'}
          </Button>
        </div>
      </header>

      {hasDemoData && <DemoBanner />}

      <div className="dashboard__top">
        <TodayCard today={today} goalMinutes={goals.dailyMinutes} week={week} />
        <NowReading books={readingBooks} sessions={sessions} activeSession={activeSession} onManual={(id) => setManualFor(id)} hasBooks={books.length > 0} />
      </div>

      <Highlights
        next={next}
        weekPages={summary.week.pages}
        weeklyGoal={goals.weeklyPages}
        openQuestions={notebookCounts.open}
        notesCount={notebookCounts.all}
      />

      <WeekByFormat week={week} totals={weekTotals} />

      <LatestNotes entries={latestNotes} />

      <div className="dashboard__bottom">
        <SessionsByDay sessions={summary.recentSessions} booksById={booksById} />
        <ReadingLedger totals={summary.totals} pace={summary.pace} streak={summary.streak} counts={summary.counts} />
      </div>

      <ManualSessionDialog open={manualFor !== null} onClose={() => setManualFor(null)} bookId={manualFor || undefined} />
    </div>
  );
}
