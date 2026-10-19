import { Modal } from '../../../components/ui';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { ManualSessionForm } from './ManualSessionForm.jsx';
import { emptyManualValues } from '../manualSessionValues.js';
import './SessionDialog.css';

/**
 * "Adicionar sessão manual": para leituras anotadas fora do cronômetro.
 * Com `bookId`, o livro já vem escolhido (página do livro).
 */
export function ManualSessionDialog({ open, onClose, bookId = '' }) {
  const { books, actions } = useData();
  const toast = useToast();
  // Livros "lidos antes do ReadTrack" são registros fechados e não recebem sessões.
  const eligible = books.filter((b) => !b.addedAsRead);
  // Só trava o livro se ele puder receber sessões (o filtro do histórico pode apontar um "lido antes").
  const lockedId = eligible.some((b) => b.id === bookId) ? bookId : '';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar sessão manual"
      description="Para leituras que você anotou fora do cronômetro. Use os números impressos das páginas."
      className="session-dialog"
    >
      <ManualSessionForm
        key={`${lockedId}-${open}`}
        initialValues={emptyManualValues(lockedId)}
        books={eligible}
        lockBook={Boolean(lockedId)}
        submitLabel="Adicionar sessão"
        onCancel={onClose}
        onSubmit={(values) => {
          const result = actions.addManualSession(values);
          if (result.ok) {
            toast.success('Sessão manual adicionada. Histórico, livro e estatísticas foram atualizados.');
            onClose();
          }
          return result;
        }}
      />
    </Modal>
  );
}
