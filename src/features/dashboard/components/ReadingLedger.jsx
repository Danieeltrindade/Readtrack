import { BookCheck, Clock, FileText, Flame, Timer } from 'lucide-react';
import { MetricStrip } from '../../../components/ui';
import { formatDuration, formatNumber, pluralize } from '../../../utils/format.js';

/**
 * Totais de toda a leitura registrada. Todos os números vêm de
 * getDashboardSummary (dados persistidos) — nada fixo no componente.
 */
export function ReadingLedger({ totals, pace, streak, counts }) {
  const items = [
    {
      icon: FileText,
      label: 'Páginas lidas',
      value: formatNumber(totals.pages),
      detail:
        totals.sessions === 0
          ? 'nenhuma sessão registrada ainda'
          : totals.newPages !== totals.pages
            ? `${formatNumber(totals.newPages)} novas; o resto é releitura`
            : 'registradas em sessões',
    },
    {
      icon: Clock,
      label: 'Tempo de leitura',
      value: totals.sessions === 0 ? '—' : formatDuration(totals.seconds),
      detail:
        totals.sessions === 0
          ? 'só conta sessões cronometradas'
          : pace.reliable
            ? `ritmo de ${formatNumber(Math.round(pace.pagesPerHour))} pág/h`
            : 'ritmo: dados insuficientes',
    },
    {
      icon: Timer,
      label: 'Sessões',
      value: formatNumber(totals.sessions),
      detail: totals.averageSessionSeconds ? `média de ${formatDuration(totals.averageSessionSeconds)}` : 'nenhuma ainda',
    },
    {
      icon: BookCheck,
      label: 'Livros concluídos',
      value: formatNumber(counts.finished),
      detail: totals.finishedBeforeApp
        ? `${formatNumber(totals.finishedBeforeApp)} lido${totals.finishedBeforeApp === 1 ? '' : 's'} antes do ReadTrack · ${formatNumber(counts.reading)} lendo`
        : `${formatNumber(counts.reading)} lendo, ${formatNumber(counts['want-to-read'])} para ler`,
    },
    {
      icon: Flame,
      label: 'Sequência',
      value: pluralize(streak.current, 'dia'),
      detail: streak.readToday
        ? 'você já leu hoje'
        : streak.current > 0
          ? 'leia hoje para manter'
          : `recorde: ${pluralize(streak.longest, 'dia')}`,
      tone: streak.readToday ? 'highlight' : undefined,
    },
  ];

  return <MetricStrip label="Resumo da leitura" items={items} />;
}
