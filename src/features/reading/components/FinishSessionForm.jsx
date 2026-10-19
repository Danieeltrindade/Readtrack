import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { BookCover, Button, Field } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useToast } from '../../../hooks/useToast.js';
import { useActiveSession } from '../../../hooks/useActiveSession.js';
import { calculateSessionPages } from '../../../utils/sessions.js';
import { LIMITS, parseInteger, validateSessionForm } from '../../../utils/validation.js';
import { formatDuration, formatNumber, pluralize } from '../../../utils/format.js';

const FIELD_ORDER = ['startPage', 'endPage', 'durationMinutes', 'notes'];

/**
 * Depois de "Finalizar": o tempo fica congelado e o usuário informa as páginas.
 * O rascunho é salvo na sessão ativa, então recarregar a página não perde nada.
 */
export function FinishSessionForm() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { active, book, elapsedSeconds, pauseCount, pausedSeconds, actions } = useActiveSession();
  const navigate = useNavigate();
  const toast = useToast();
  const formRef = useRef(null);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState(null);

  const [values, setValues] = useState(() => ({
    startPage: String(active.startPage),
    endPage: '',
    notes: '',
    durationEdited: false,
    durationMinutes: String(Math.max(1, Math.round(elapsedSeconds / 60))),
    markFinished: true,
    ...(active.draft ?? {}),
  }));

  // Rascunho persistido com atraso, para não gravar a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => actions.saveSessionDraft(values), 400);
    return () => clearTimeout(timer);
  }, [values, actions]);

  const validation = useMemo(
    () => validateSessionForm(values, { book, measuredSeconds: elapsedSeconds }),
    [values, book, elapsedSeconds],
  );
  const errorFor = (name) => (submitted && validation.errors[name]) || undefined;

  const startPage = parseInteger(values.startPage);
  const endPage = parseInteger(values.endPage);
  const hasRange = !Number.isNaN(startPage) && !Number.isNaN(endPage) && endPage > startPage;
  const pages = hasRange ? calculateSessionPages({ startPage, endPage, previousProgress: book.currentPage }) : null;
  const reachesEnd = Boolean(book.totalPages) && endPage === book.totalPages;

  const set = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (saving.current) return; // clique repetido
    setSubmitted(true);
    setFormError(null);

    if (!validation.valid) {
      const first = FIELD_ORDER.find((name) => validation.errors[name]);
      requestAnimationFrame(() => formRef.current?.querySelector(`[name="${first}"]`)?.focus());
      return;
    }

    saving.current = true;
    setIsSaving(true);
    const result = actions.completeSession(values);
    if (!result.ok) {
      saving.current = false;
      setIsSaving(false);
      if (!result.duplicate) setFormError(Object.values(result.errors)[0] ?? 'Não foi possível salvar. Revise os campos.');
      return;
    }

    const { session } = result;
    toast.success(
      result.markFinished
        ? `Sessão salva e “${book.title}” concluído. Parabéns!`
        : `Sessão salva: ${pluralize(session.pagesRead, 'página')} em ${formatDuration(session.durationSeconds)}.`,
    );
    // Livro concluído agora: a página do livro oferece o comentário final.
    navigate(ROUTES.book(book.id), { replace: true, state: result.markFinished ? { askReview: true } : undefined });
  };

  return (
    <form ref={formRef} className="finish-form" onSubmit={onSubmit} noValidate aria-labelledby="finish-title">
      <header className="finish-form__header">
        <BookCover book={book} size="sm" />
        <div>
          <h2 id="finish-title" className="finish-form__title">
            Registrar sessão
          </h2>
          <p className="finish-form__summary">
            <strong className="tabular">{formatDuration(elapsedSeconds)}</strong> de leitura em “{book.title}”
            {pauseCount > 0 && ` (${pluralize(pauseCount, 'pausa')}, ${formatDuration(pausedSeconds)} pausado, não contado)`}
          </p>
        </div>
      </header>

      {formError && (
        <p className="form-alert" role="alert">
          {formError}
        </p>
      )}

      <div className="finish-form__pages">
        <Field label="Página inicial" required error={errorFor('startPage')} hint="Onde o marcador estava.">
          <input
            name="startPage"
            className="input input--number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={values.startPage}
            onChange={set('startPage')}
          />
        </Field>
        <Field label="Página final" required error={errorFor('endPage')} hint={book.totalPages ? `Onde você parou (até ${book.totalPages}).` : 'Onde você parou.'}>
          <input
            name="endPage"
            className="input input--number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={values.endPage}
            onChange={set('endPage')}
            autoFocus
          />
        </Field>
        <div className="finish-form__read" aria-live="polite">
          <span className="finish-form__read-label">Páginas lidas</span>
          <output className="finish-form__read-value tabular">{pages ? formatNumber(pages.pagesRead) : '—'}</output>
        </div>
      </div>

      {pages && pages.overlap > 0 && (
        <p className="finish-form__note">
          Você já tinha passado da página {formatNumber(book.currentPage)}: {pluralize(pages.overlap, 'página é', 'páginas são')}{' '}
          releitura. O progresso do livro avança {pluralize(pages.newPages, 'página')}.
        </p>
      )}

      {reachesEnd && book.status !== 'finished' && (
        <label className="check finish-form__finish">
          <input type="checkbox" name="markFinished" checked={values.markFinished} onChange={set('markFinished')} />
          <span>
            <strong>Marcar “{book.title}” como concluído</strong>
            <br />
            <span className="finish-form__muted">Você chegou à última página.</span>
          </span>
        </label>
      )}

      <div className="finish-form__duration">
        {values.durationEdited ? (
          <Field
            label="Duração em minutos"
            required
            error={errorFor('durationMinutes')}
            hint={`O cronômetro marcou ${formatDuration(elapsedSeconds)}. Você pode diminuir se esqueceu de pausar.`}
          >
            <input
              name="durationMinutes"
              className="input input--number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={values.durationMinutes}
              onChange={set('durationMinutes')}
            />
          </Field>
        ) : (
          <p className="finish-form__duration-text">
            Duração registrada: <strong className="tabular">{formatDuration(elapsedSeconds)}</strong>{' '}
            <button type="button" className="link-button" onClick={() => setValues((v) => ({ ...v, durationEdited: true }))}>
              Ajustar
            </button>
          </p>
        )}
        {!values.durationEdited && errorFor('durationMinutes') && <p className="field__error">{errorFor('durationMinutes')}</p>}
      </div>

      <Field
        label="Observações desta leitura"
        error={errorFor('notes')}
        hint={`Pode deixar em branco. ${values.notes.length}/${LIMITS.notes}`}
      >
        <textarea
          name="notes"
          className="textarea"
          rows={3}
          value={values.notes}
          onChange={set('notes')}
          placeholder="Palavras que você não conhecia, ideias importantes, trechos para lembrar, sua interpretação, dúvidas ou reflexões…"
        />
      </Field>

      <div className="finish-form__actions">
        <Button variant="ghost" icon={ArrowLeft} onClick={actions.backToTimer} disabled={isSaving}>
          Voltar ao cronômetro
        </Button>
        <Button type="submit" icon={Check} size="lg" disabled={isSaving} aria-disabled={isSaving}>
          {isSaving ? 'Salvando…' : 'Salvar sessão'}
        </Button>
      </div>
    </form>
  );
}
