import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useActiveSession } from '../../hooks/useActiveSession.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { formatClock } from '../../utils/format.js';
import { StartSession } from './components/StartSession.jsx';
import { TimerPanel } from './components/TimerPanel.jsx';
import { FinishSessionForm } from './components/FinishSessionForm.jsx';
import './Reading.css';

/**
 * /leitura — três estados, decididos pela sessão ativa salva:
 * 1. sem sessão → escolher livro e iniciar;
 * 2. rodando ou pausada → cronômetro;
 * 3. revisando → formulário de páginas e observações.
 * Como tudo vem do armazenamento, recarregar a página volta ao mesmo ponto.
 */
export default function ReadingPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const [params] = useSearchParams();
  const requestedBookId = params.get('livro');
  const { active, book, isReviewing, isRunning, elapsedSeconds } = useActiveSession();

  useDocumentTitle(active ? `${isRunning ? '▶' : '❚❚'} ${formatClock(elapsedSeconds)}` : 'Ler agora');

  const otherBookRequested = active && requestedBookId && requestedBookId !== active.bookId;

  return (
    <div className={`page reading ${active ? 'reading--active' : ''}`}>
      {!active && (
        <PageHeader title="Ler agora" description="Escolha o livro e inicie o cronômetro. Você informa as páginas no final." />
      )}

      {otherBookRequested && (
        <p className="reading__notice" role="status">
          Já existe uma sessão em andamento com “{book?.title}”. Finalize ou cancele esta antes de começar outro livro.{' '}
          <Link to={ROUTES.library}>Voltar para a biblioteca</Link>
        </p>
      )}

      {!active || !book ? (
        <StartSession requestedBookId={requestedBookId} />
      ) : isReviewing ? (
        <FinishSessionForm key={active.id} />
      ) : (
        <TimerPanel />
      )}
    </div>
  );
}
