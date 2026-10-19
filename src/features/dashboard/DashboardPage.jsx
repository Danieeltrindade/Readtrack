import { useMemo } from 'react';
import { useData } from '../../hooks/useData.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { getDashboardSummary } from '../../utils/stats.js';
import { formatLongDate, getGreeting } from '../../utils/format.js';
import { ContinueReading } from './components/ContinueReading.jsx';
import { TodayPanel } from './components/TodayPanel.jsx';
import { ReadingLedger } from './components/ReadingLedger.jsx';
import { WeeklyChart } from './components/WeeklyChart.jsx';
import { RecentSessions } from './components/RecentSessions.jsx';
import { DemoBanner } from './components/DemoBanner.jsx';
import { Shortcuts } from './components/Shortcuts.jsx';
import './Dashboard.css';

export default function DashboardPage() {
  useDocumentTitle('Início');
  const { books, sessions, goals, settings, ledger, hasDemoData, activeSession } = useData();

  // Regra de negócio fica em utils/stats.js; aqui só montamos a tela.
  const summary = useMemo(
    () => getDashboardSummary({ books, sessions, goals, ledger }, new Date(), settings.weekStartsOn),
    [books, sessions, goals, ledger, settings.weekStartsOn],
  );
  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const lastSessionOfCurrent = summary.currentBook
    ? summary.recentSessions.find((s) => s.bookId === summary.currentBook.id)
    : null;

  const now = new Date();
  const greeting = settings.userName ? `${getGreeting(now)}, ${settings.userName}` : getGreeting(now);

  return (
    <div className="page dashboard">
      <header className="dashboard__header">
        <h1>{greeting}</h1>
        <p className="dashboard__date">{formatLongDate(now)}</p>
      </header>

      <Shortcuts timerActive={Boolean(activeSession)} />

      {hasDemoData && <DemoBanner />}

      <div className="dashboard__grid">
        <div className="dashboard__area dashboard__area--continue">
          <ContinueReading
            book={summary.currentBook}
            lastSession={lastSessionOfCurrent}
            hasBooks={books.length > 0}
            timerRunning={Boolean(activeSession) && activeSession.bookId === summary.currentBook?.id}
          />
        </div>
        <div className="dashboard__area dashboard__area--today">
          <TodayPanel today={summary.today} week={summary.week} />
        </div>
        <div className="dashboard__area dashboard__area--ledger">
          <ReadingLedger totals={summary.totals} pace={summary.pace} streak={summary.streak} counts={summary.counts} />
        </div>
        <div className="dashboard__area dashboard__area--chart">
          <WeeklyChart series={summary.lastSevenDays} />
        </div>
        <div className="dashboard__area dashboard__area--recent">
          <RecentSessions sessions={summary.recentSessions} booksById={booksById} />
        </div>
      </div>
    </div>
  );
}
