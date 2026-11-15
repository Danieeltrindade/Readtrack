import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { BookCover, Button, Field } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useToast } from '../../../hooks/useToast.js';
import { useActiveSession } from '../../../hooks/useActiveSession.js';
import { calculateSessionPages } from '../../../utils/sessions.js';
import { MOOD_LABELS, SESSION_MOODS, parseInteger, validateSessionForm } from '../../../utils/validation.js';
import { formatDuration, formatNumber, pluralize } from '../../../utils/format.js';
import { PROGRESS_KINDS, formatAudioPosition, getProgressKind, parseAudioPosition, reachesEnd as reachesEndOf } from '../../../utils/formats.js';
import { anchorKindFor } from '../../../utils/annotations.js';
import { NotebookEditor } from '../../../components/notebook/NotebookEditor.jsx';
import { ProgressFields } from '../../../components/notebook/ProgressFields.jsx';
import { flushNotebookPending } from '../../../components/notebook/notebookPending.js';

const FIELD_ORDER = ['startPage', 'endPage', 'startPercent', 'endPercent', 'startPosition', 'endPosition', 'speed', 'durationMinutes', 'notes'];

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

  const kind = getProgressKind(book);
  const byPages = kind === PROGRESS_KINDS.PAGES;

  const [values, setValues] = useState(() => ({
    startPage: String(active.startPage),
    endPage: '',
    startPercent: String(active.startPercent ?? book.progressPercent ?? 0),
    endPercent: '',
    startPosition: formatAudioPosition(active.startPositionSeconds ?? book.audioPositionSeconds ?? 0),
    endPosition: '',
    speed: book.audioSpeed ? String(book.audioSpeed) : '',
    notes: '',
    vocabulary: [],
    annotations: [],
    pending: null,
    mood: null,
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
  const hasRange = byPages && !Number.isNaN(startPage) && !Number.isNaN(endPage) && endPage > startPage;
  const pages = hasRange ? calculateSessionPages({ startPage, endPage, previousProgress: book.currentPage }) : null;
  const reachesEnd = reachesEndOf(book, {
    endPage,
    endPercent: parseInteger(values.endPercent),
    endPositionSeconds: parseAudioPosition(values.endPosition),
  });
  const endText = kind === PROGRESS_KINDS.AUDIO ? 'Você chegou ao fim do áudio.' : kind === PROGRESS_KINDS.PERCENT ? 'Você chegou a 100%.' : 'Você chegou à última página.';
  const patch = (next) => setValues((current) => ({ ...current, ...next }));

  const set = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [name]: value }));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (saving.current) return; // clique repetido
    setSubmitted(true);
    setFormError(null);

    // O que ainda estava digitado no caderno (sem "Adicionar") entra também.
    const flushed = flushNotebookPending(values, anchorKindFor(kind));
    if (flushed.error) {
      setFormError(`Caderno: ${flushed.error}`);
      return;
    }
    const finalValues = { ...values, ...flushed.patch, pending: null };

    if (!validation.valid) {
      const first = FIELD_ORDER.find((name) => validation.errors[name]);
      requestAnimationFrame(() => formRef.current?.querySelector(`[name="${first}"]`)?.focus());
      return;
    }

    saving.current = true;
    setIsSaving(true);
    const result = actions.completeSession(finalValues);
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
        : byPages
          ? `Sessão salva: ${pluralize(session.pagesRead, 'página')} em ${formatDuration(session.durationSeconds)}.`
          : `Sessão salva: ${formatDuration(session.durationSeconds)} ${kind === PROGRESS_KINDS.AUDIO ? 'ouvindo' : 'de leitura'}.`,
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

      {!byPages && <ProgressFields kind={kind} book={book} values={values} onChange={(name, value) => patch({ [name]: value })} errorFor={errorFor} autoFocusEnd />}

      {byPages && (
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
      )}

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
            <span className="finish-form__muted">{endText}</span>
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

      <NotebookEditor
        value={values}
        onChange={patch}
        anchorKind={anchorKindFor(kind)}
        errors={{ notes: errorFor('notes'), annotations: errorFor('annotations'), vocabularyText: errorFor('vocabularyText') }}
        idPrefix="finish-nb"
      />

      <fieldset className="field mood-picker">
        <legend className="field__label">
          Como foi? <span className="field__optional">(opcional)</span>
        </legend>
        <div className="mood-picker__options">
          {SESSION_MOODS.map((mood) => (
            <button
              key={mood}
              type="button"
              className="mood-picker__option"
              aria-pressed={values.mood === mood}
              onClick={() => patch({ mood: values.mood === mood ? null : mood })}
            >
              {MOOD_LABELS[mood]}
            </button>
          ))}
        </div>
      </fieldset>

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
