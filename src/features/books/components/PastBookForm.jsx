import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookCheck, Save } from 'lucide-react';
import { BookCover, Button, Field, PageHeader } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { EMPTY_PAST_BOOK_FORM, pastBookToFormValues, pickCoverColor } from '../../../utils/books.js';
import { toInputDate } from '../../../utils/date.js';
import { LIMITS, validatePastBookForm } from '../../../utils/validation.js';
import { FinalReviewFields } from './FinalReviewFields.jsx';

const FIELD_ORDER = ['title', 'author', 'totalPages', 'finishedAt', 'rating', 'review', 'learnings'];

/**
 * Cadastro e edição de um livro lido ANTES do ReadTrack.
 * Só o título é obrigatório. O livro entra como "Concluído", sem sessões:
 * nenhum tempo de leitura, página por sessão ou dia de leitura é inventado.
 */
export function PastBookForm({ book }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const isEdit = Boolean(book);
  const navigate = useNavigate();
  const toast = useToast();
  const { actions } = useData();
  const formRef = useRef(null);
  const alertRef = useRef(null);
  const saving = useRef(false);

  const initialValues = useMemo(() => (book ? pastBookToFormValues(book) : { ...EMPTY_PAST_BOOK_FORM }), [book]);
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const validation = useMemo(() => validatePastBookForm(values), [values]);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  const errorFor = (name) => ((submitted || touched[name]) && validation.errors[name]) || undefined;

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const setField = (name, value) => setValues((current) => ({ ...current, [name]: value }));
  const touch = (name) => setTouched((t) => ({ ...t, [name]: true }));
  const bind = (name) => ({
    name,
    value: values[name],
    onChange: (event) => setField(name, event.target.value),
    onBlur: () => touch(name),
  });

  const onSubmit = (event) => {
    event.preventDefault();
    if (saving.current) return;
    setSubmitted(true);
    setSubmitError(null);
    if (!validation.valid) {
      const first = FIELD_ORDER.find((name) => validation.errors[name]);
      requestAnimationFrame(() => (formRef.current?.querySelector(`[name="${first}"]`) ?? alertRef.current)?.focus());
      return;
    }
    saving.current = true;
    const result = isEdit ? actions.editPastBook(book.id, values) : actions.addPastBook(values);
    if (!result.ok) {
      saving.current = false;
      setSubmitError(result.errors.form ?? 'Revise os campos destacados.');
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    toast.success(isEdit ? 'Alterações salvas.' : `“${result.book.title}” entrou nos concluídos.`);
    navigate(ROUTES.book(result.book.id), { replace: true });
  };

  const errorCount = Object.keys(validation.errors).length;
  const previewBook = {
    title: values.title.trim() || 'Título do livro',
    author: values.author.trim(),
    coverUrl: book?.coverUrl ?? '',
    coverColor: book?.coverColor ?? pickCoverColor(`${values.title.trim()}${values.author.trim()}`),
  };

  return (
    <div className="page book-form-page">
      <PageHeader
        title={isEdit ? 'Editar livro já lido' : 'Adicionar livro já concluído'}
        description="Para livros que você leu antes de usar o ReadTrack. Só o título é obrigatório."
      />

      <form ref={formRef} className="book-form" onSubmit={onSubmit} noValidate>
        <aside className="book-form__preview" aria-label="Prévia da capa">
          <BookCover book={previewBook} size="fluid" />
        </aside>

        <div className="book-form__fields">
          {submitted && (errorCount > 0 || submitError) && (
            <div ref={alertRef} className="form-alert" role="alert" tabIndex={-1}>
              {submitError ?? (errorCount === 1 ? 'Há 1 campo para corrigir.' : `Há ${errorCount} campos para corrigir.`)}
            </div>
          )}

          <p className="book-form__notice">
            <BookCheck size={18} aria-hidden="true" />
            <span>
              O livro entra como <strong>Concluído</strong>. Como não houve sessões cronometradas, ele conta nos livros
              concluídos, mas não soma tempo de leitura, páginas por sessão, dias de sequência nem metas.
            </span>
          </p>

          <fieldset className="book-form__group">
            <legend className="book-form__legend">Livro</legend>
            <Field label="Título" required error={errorFor('title')}>
              <input className="input" maxLength={LIMITS.title + 20} autoComplete="off" {...bind('title')} />
            </Field>
            <Field label="Autor" error={errorFor('author')}>
              <input className="input" maxLength={LIMITS.author + 20} autoComplete="off" {...bind('author')} />
            </Field>
            <div className="book-form__row">
              <Field label="Total de páginas" error={errorFor('totalPages')} hint="Deixe em branco se não souber.">
                <input className="input input--number" inputMode="numeric" pattern="[0-9]*" {...bind('totalPages')} />
              </Field>
              <Field label="Data em que terminei de ler" error={errorFor('finishedAt')} hint="Se não lembrar, deixe em branco.">
                <input type="date" className="input" max={toInputDate(new Date())} {...bind('finishedAt')} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="book-form__group">
            <legend className="book-form__legend">Comentário final</legend>
            <FinalReviewFields
              values={values}
              errors={{ rating: errorFor('rating'), review: errorFor('review'), learnings: errorFor('learnings') }}
              onChange={setField}
              onBlur={touch}
            />
          </fieldset>

          <div className="book-form__actions">
            <Button variant="ghost" onClick={() => navigate(isEdit ? ROUTES.book(book.id) : ROUTES.library)}>
              Cancelar
            </Button>
            <Button type="submit" icon={Save}>
              {isEdit ? 'Salvar alterações' : 'Adicionar aos concluídos'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
