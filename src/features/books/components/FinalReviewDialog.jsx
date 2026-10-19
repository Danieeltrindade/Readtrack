import { useState } from 'react';
import { Button, Modal } from '../../../components/ui';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { FinalReviewFields } from './FinalReviewFields.jsx';

/**
 * Comentário final do livro, em diálogo. `afterFinish` muda o texto para o
 * convite que aparece logo depois de concluir: tudo é opcional e "Agora não"
 * conclui sem registrar nada.
 */
export function FinalReviewDialog({ book, open, onClose, afterFinish = false }) {
  return (
    <Modal
      open={open && Boolean(book)}
      onClose={onClose}
      title={afterFinish ? `“${book?.title}” concluído!` : 'Comentário final'}
      description={
        afterFinish
          ? 'Quer registrar o que achou? É opcional: você pode preencher depois nos detalhes do livro.'
          : 'Sua opinião sobre o livro como um todo. As observações de cada sessão ficam separadas, no histórico.'
      }
      className="final-review-dialog"
    >
      {book && <FinalReviewForm key={book.id} book={book} onClose={onClose} afterFinish={afterFinish} />}
    </Modal>
  );
}

function FinalReviewForm({ book, onClose, afterFinish }) {
  const { actions } = useData();
  const toast = useToast();
  const [values, setValues] = useState({
    rating: book.rating ? String(book.rating) : '',
    review: book.review ?? '',
    learnings: book.learnings ?? '',
  });
  const [errors, setErrors] = useState({});

  const onSubmit = (event) => {
    event.preventDefault();
    const result = actions.updateBookReview(book.id, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    toast.success('Comentário final salvo.');
    onClose();
  };

  return (
    <form className="final-review" onSubmit={onSubmit} noValidate>
      {errors.form && (
        <p className="form-alert" role="alert">
          {errors.form}
        </p>
      )}
      <FinalReviewFields values={values} errors={errors} onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))} />
      <div className="confirm-dialog__actions">
        <Button variant="ghost" onClick={onClose}>
          {afterFinish ? 'Agora não' : 'Cancelar'}
        </Button>
        <Button type="submit">Salvar comentário</Button>
      </div>
    </form>
  );
}
