import { useState } from 'react';
import { Link } from 'react-router';
import { BookA, NotebookPen, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { Button, Field, Modal } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { getMeasuredSeconds } from '../../../utils/sessions.js';
import { LIMITS, formatVocabularyText } from '../../../utils/validation.js';
import { isManualSession } from '../../../utils/pages.js';
import { formatDurationText, getDurationDivergence } from '../../../utils/duration.js';
import { ManualSessionForm } from './ManualSessionForm.jsx';
import { SessionDuration, SourceBadge } from './SessionBadges.jsx';
import { sessionToManualValues } from '../manualSessionValues.js';
import { formatDuration, formatFullDate, formatNumber, formatSessionPeriod, pluralize } from '../../../utils/format.js';
import './SessionDialog.css';

const FIELD_ORDER = ['startPage', 'endPage', 'durationMinutes', 'notes', 'vocabularyText'];

/**
 * Detalhes de uma sessão salva, com edição e exclusão.
 * mode: 'view' | 'edit' | 'delete'
 */
export function SessionDialog({ session, book, open, onClose, initialMode = 'view' }) {
  return (
    <Modal
      open={open && Boolean(session)}
      onClose={onClose}
      title={book ? `Sessão de “${book.title}”` : 'Sessão de leitura'}
      className="session-dialog"
    >
      {session && book && <SessionDialogContent key={`${session.id}-${initialMode}`} session={session} book={book} onClose={onClose} initialMode={initialMode} />}
    </Modal>
  );
}

function SessionDialogContent({ session, book, onClose, initialMode }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { books, actions } = useData();
  const toast = useToast();
  const [mode, setMode] = useState(initialMode);
  const manual = isManualSession(session);
  const measured = getMeasuredSeconds(session);
  const divergence = getDurationDivergence(session);
  const vocabulary = session.vocabulary ?? [];
  const [values, setValues] = useState(() => ({
    startPage: String(session.startPage),
    endPage: String(session.endPage),
    durationMinutes: String(Math.max(1, Math.round((session.durationSeconds ?? 0) / 60))),
    notes: session.notes ?? '',
    vocabularyText: formatVocabularyText(session.vocabulary),
  }));
  const [errors, setErrors] = useState({});
  const [confirmNotes, setConfirmNotes] = useState(false);

  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  const save = (event) => {
    event.preventDefault();
    const result = actions.updateSession(session.id, values);
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find((name) => result.errors[name]);
      requestAnimationFrame(() => document.querySelector(`.session-dialog [name="${first}"]`)?.focus());
      return;
    }
    toast.success('Sessão atualizada. Histórico, livro e estatísticas foram recalculados.');
    onClose();
  };

  const removeNotes = () => {
    actions.removeSessionNotes(session.id);
    toast.success('Observação excluída. A sessão continua registrada.');
    setConfirmNotes(false);
  };

  const remove = () => {
    actions.deleteSession(session.id);
    toast.success('Sessão excluída. Histórico, livro e estatísticas foram atualizados.');
    onClose();
  };

  if (mode === 'delete') {
    return (
      <>
        <p className="confirm-dialog__description">
          A sessão de {formatFullDate(session.startedAt)} ({pluralize(session.pagesRead, 'página')}
          {session.durationSeconds ? ` em ${formatDuration(session.durationSeconds)}` : ''}) será apagada
          {session.notes || vocabulary.length ? ', junto com as observações e o vocabulário' : ''}. As estatísticas e o
          progresso de “{book.title}” serão recalculados. Essa ação não pode ser desfeita.
        </p>
        <div className="confirm-dialog__actions">
          <Button variant="ghost" onClick={() => setMode('view')}>
            Cancelar
          </Button>
          <Button variant="danger" icon={Trash2} onClick={remove}>
            Excluir sessão
          </Button>
        </div>
      </>
    );
  }

  if (mode === 'edit' && manual) {
    return (
      <ManualSessionForm
        initialValues={sessionToManualValues(session)}
        books={books}
        lockBook
        submitLabel="Salvar alterações"
        onCancel={() => setMode('view')}
        onSubmit={(formValues) => {
          const result = actions.updateSession(session.id, formValues);
          if (result.ok) {
            toast.success('Sessão atualizada. Histórico, livro e estatísticas foram recalculados.');
            onClose();
          }
          return result;
        }}
      />
    );
  }

  if (mode === 'edit') {
    return (
      <form className="session-dialog__form" onSubmit={save} noValidate>
        {errors.form && (
          <p className="form-alert" role="alert">
            {errors.form}
          </p>
        )}
        <div className="session-dialog__row">
          <Field label="Página inicial" required error={errors.startPage}>
            <input name="startPage" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.startPage} onChange={set('startPage')} />
          </Field>
          <Field label="Página final" required error={errors.endPage} hint={book.totalPages ? `Até ${formatNumber(book.totalPages)}.` : undefined}>
            <input name="endPage" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.endPage} onChange={set('endPage')} />
          </Field>
        </div>
        <Field
          label="Duração em minutos"
          required
          error={errors.durationMinutes}
          hint={`O cronômetro mediu ${formatDuration(measured)}. Dá para diminuir (se esqueceu de pausar), não aumentar.`}
        >
          <input name="durationMinutes" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.durationMinutes} onChange={set('durationMinutes')} />
        </Field>
        <Field label="Observações desta leitura" error={errors.notes} hint={`${values.notes.length}/${LIMITS.notes} · deixe vazio para remover`}>
          <textarea name="notes" className="textarea" rows={4} value={values.notes} onChange={set('notes')} />
        </Field>
        <Field label="Vocabulário" error={errors.vocabularyText} hint="Uma palavra por linha: “palavra: significado”.">
          <textarea name="vocabularyText" className="textarea" rows={3} value={values.vocabularyText} onChange={set('vocabularyText')} />
        </Field>
        <p className="session-dialog__muted">Data e horários vêm do cronômetro e não podem ser alterados.</p>
        <div className="confirm-dialog__actions">
          <Button variant="ghost" onClick={() => setMode('view')}>
            Cancelar
          </Button>
          <Button type="submit">Salvar alterações</Button>
        </div>
      </form>
    );
  }

  return (
    <>
      <p>
        <SourceBadge session={session} />
      </p>
      <dl className="session-dialog__facts">
        <div>
          <dt>Data da leitura</dt>
          <dd>{formatFullDate(session.startedAt)}</dd>
        </div>
        <div>
          <dt>Período</dt>
          <dd className="tabular">{formatSessionPeriod(session)}</dd>
        </div>
        <div>
          <dt>{manual ? 'Duração registrada' : 'Duração efetiva'}</dt>
          <dd className="tabular">
            <SessionDuration session={session} />
            {session.pauseCount > 0 && (
              <small>
                {' '}
                · {pluralize(session.pauseCount, 'pausa')} ({formatDuration(session.pausedSeconds)} sem contar)
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Páginas</dt>
          <dd className="tabular">
            {manual ? `${formatNumber(session.startPage)}–${formatNumber(session.endPage)}` : `${formatNumber(session.startPage)} → ${formatNumber(session.endPage)}`} ·{' '}
            {pluralize(session.pagesRead, 'página lida', 'páginas lidas')}
            {session.newPages !== session.pagesRead && <small> ({formatNumber(session.newPages)} novas)</small>}
          </dd>
        </div>
      </dl>

      {divergence && (
        <p className="session-dialog__divergence">
          <TriangleAlert size={14} aria-hidden="true" /> A duração anotada (<strong>{formatDurationText(divergence.recorded)}</strong>) é
          diferente da diferença entre os horários (<strong>{formatDurationText(divergence.calculated)}</strong>). As estatísticas usam a
          anotada; nada foi corrigido automaticamente. Se quiser, ajuste em “Editar sessão”.
        </p>
      )}

      <section className="session-dialog__notes" aria-labelledby="session-notes-title">
        <h3 id="session-notes-title" className="session-dialog__subtitle">
          <NotebookPen size={16} aria-hidden="true" /> Observações desta leitura
        </h3>
        {session.notes ? (
          <>
            <p className="session-dialog__notes-text">{session.notes}</p>
            {confirmNotes ? (
              <div className="session-dialog__inline-confirm" role="group" aria-label="Confirmar exclusão da observação">
                <span>Excluir só a observação? A sessão continua.</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmNotes(false)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="danger" onClick={removeNotes}>
                  Excluir observação
                </Button>
              </div>
            ) : (
              <div className="session-dialog__notes-actions">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setMode('edit')}>
                  Editar observação
                </Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmNotes(true)}>
                  Excluir observação
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="session-dialog__muted">
            Nenhuma observação.{' '}
            <button type="button" className="session-dialog__link" onClick={() => setMode('edit')}>
              Adicionar
            </button>
          </p>
        )}
      </section>

      <section className="session-dialog__notes" aria-labelledby="session-vocab-title">
        <h3 id="session-vocab-title" className="session-dialog__subtitle">
          <BookA size={16} aria-hidden="true" /> Vocabulário
          {vocabulary.length > 0 && <span className="session-dialog__count"> · {vocabulary.length}</span>}
        </h3>
        {vocabulary.length > 0 ? (
          <dl className="vocabulary-list">
            {vocabulary.map((item, index) => (
              <div key={`${item.term}-${index}`}>
                <dt>{item.term}</dt>
                {item.meaning && <dd>{item.meaning}</dd>}
              </div>
            ))}
          </dl>
        ) : (
          <p className="session-dialog__muted">
            Nenhuma palavra.{' '}
            <button type="button" className="session-dialog__link" onClick={() => setMode('edit')}>
              Adicionar
            </button>
          </p>
        )}
      </section>

      <p className="session-dialog__muted">
        Livro: <Link to={ROUTES.book(book.id)}>{book.title}</Link>
        {book.author ? ` · ${book.author}` : ''}
        {manual && session.createdAt ? ` · registrado em ${formatFullDate(session.createdAt)}` : ''}
      </p>

      <div className="confirm-dialog__actions">
        <Button variant="danger" icon={Trash2} onClick={() => setMode('delete')}>
          Excluir sessão
        </Button>
        <Button variant="secondary" icon={Pencil} onClick={() => setMode('edit')}>
          Editar sessão
        </Button>
      </div>
    </>
  );
}
