import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, BookX, Save } from 'lucide-react';
import { BookCover, Button, ChoiceGroup, EmptyState, Field, PageHeader } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useToast } from '../../hooks/useToast.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { EMPTY_BOOK_FORM, bookToFormValues, hasFinalReview, pickCoverColor } from '../../utils/books.js';
import { toInputDate } from '../../utils/date.js';
import { BOOK_STATUS_LABELS, LIMITS, validateBookForm } from '../../utils/validation.js';
import { CoverField } from './components/CoverField.jsx';
import { FinalReviewFields } from './components/FinalReviewFields.jsx';
import { PastBookForm } from './components/PastBookForm.jsx';
import './BookForm.css';

const STATUS_OPTIONS = Object.entries(BOOK_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const FIELD_ORDER = ['title', 'author', 'status', 'totalPages', 'contentStartPage', 'currentPage', 'startedAt', 'finishedAt', 'rating', 'review', 'learnings', 'coverUrl', 'description'];

/** Texto de apoio do campo "Página inicial da leitura", com as páginas de leitura. */
function contentStartHint(values, isEdit) {
  const total = Number(values.totalPages);
  const start = Number(values.contentStartPage);
  const base = 'Opcional. Página impressa onde o texto começa (ex.: 9, se as 8 primeiras são capa, sumário e prefácio).';
  const keep = isEdit ? ' Alterar não apaga nem muda suas sessões.' : '';
  if (values.contentStartPage !== '' && Number.isInteger(total) && total > 0 && Number.isInteger(start) && start >= 1 && start <= total) {
    return `${base} Leitura: ${total - start + 1} de ${total} páginas.${keep}`;
  }
  return base + keep;
}

/** Cadastro (/livros/novo) e edição (/livros/:bookId/editar) do mesmo formulário. */
export default function BookFormPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { bookId } = useParams();
  const { books } = useData();
  const isEdit = Boolean(bookId);
  const book = isEdit ? books.find((b) => b.id === bookId) : null;
  useDocumentTitle(isEdit ? (book?.addedAsRead ? 'Editar livro já lido' : 'Editar livro') : 'Adicionar livro');

  if (isEdit && !book) {
    return (
      <div className="page">
        <EmptyState
          titleAs="h1"
          icon={BookX}
          title="Livro não encontrado"
          description="Ele pode ter sido excluído. Volte para a biblioteca para escolher outro."
          action={<Button to={ROUTES.library} icon={ArrowLeft}>Voltar para a biblioteca</Button>}
        />
      </div>
    );
  }

  // Livro cadastrado como já lido tem um formulário próprio (sem status nem progresso).
  if (book?.addedAsRead) return <PastBookForm key={bookId} book={book} />;

  // `key` recria o formulário se o usuário navegar de um livro para outro.
  return <BookForm key={bookId ?? 'novo'} book={book} />;
}

function BookForm({ book }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const isEdit = Boolean(book);
  const navigate = useNavigate();
  const toast = useToast();
  const { actions } = useData();
  const formRef = useRef(null);
  const alertRef = useRef(null);

  const initialValues = useMemo(() => (book ? bookToFormValues(book) : { ...EMPTY_BOOK_FORM }), [book]);
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const saving = useRef(false);

  // Livro importado sem total ou autor: a edição pode mantê-los em branco.
  const formOptions = useMemo(
    () => ({ allowMissingTotal: Boolean(book) && !book.totalPages, allowMissingAuthor: Boolean(book) && !book.author }),
    [book],
  );
  const validation = useMemo(() => validateBookForm(values, new Date(), formOptions), [values, formOptions]);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  // Erros aparecem depois que o campo perde o foco ou após tentar salvar.
  const errorFor = (name) => ((submitted || touched[name]) && validation.errors[name]) || undefined;

  // Aviso do navegador ao fechar/recarregar com alterações não salvas.
  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const setField = (name, value) => {
    setValues((current) => {
      const next = { ...current, [name]: value };
      // Preenche datas óbvias ao trocar de status, sem sobrescrever o que já existe.
      if (name === 'status') {
        const today = toInputDate(new Date());
        if (value !== 'want-to-read' && !next.startedAt) next.startedAt = today;
        if (value === 'finished') {
          if (!next.finishedAt) next.finishedAt = today;
          next.currentPage = next.totalPages || next.currentPage;
        }
      }
      if (name === 'totalPages' && next.status === 'finished') next.currentPage = value;
      return next;
    });
    if (name === 'coverUrl') setCoverFailed(false);
  };

  const bind = (name) => ({
    name,
    value: values[name],
    onChange: (event) => setField(name, event.target.value),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
  });

  const onSubmit = (event) => {
    event.preventDefault();
    if (saving.current) return; // clique duplo no "Salvar"
    setSubmitted(true);
    setSubmitError(null);

    if (!validation.valid) {
      const first = FIELD_ORDER.find((name) => validation.errors[name]);
      requestAnimationFrame(() => {
        const node = formRef.current?.querySelector(`[name="${first}"]`);
        (node ?? alertRef.current)?.focus();
      });
      return;
    }

    saving.current = true;
    const result = isEdit ? actions.updateBook(book.id, values) : actions.addBook(values);
    if (!result.ok) {
      saving.current = false;
      setSubmitError(result.errors.form ?? 'Revise os campos destacados.');
      requestAnimationFrame(() => alertRef.current?.focus());
      return;
    }
    toast.success(isEdit ? 'Alterações salvas.' : `“${result.book.title}” foi adicionado à biblioteca.`);
    navigate(ROUTES.book(result.book.id), { replace: true });
  };

  const cancel = () => navigate(isEdit ? ROUTES.book(book.id) : ROUTES.library);

  const previewBook = {
    title: values.title.trim() || 'Título do livro',
    author: values.author.trim() || 'Autor',
    coverUrl: validation.errors.coverUrl ? '' : values.coverUrl.trim(),
    coverColor: book?.coverColor ?? pickCoverColor(`${values.title.trim()}${values.author.trim()}`),
  };
  const errorCount = Object.keys(validation.errors).length;
  const isFinished = values.status === 'finished';

  return (
    <div className="page book-form-page">
      <PageHeader
        title={isEdit ? 'Editar livro' : 'Adicionar livro'}
        description={isEdit ? book.title : 'Só título, autor e número de páginas são obrigatórios.'}
      />

      <form ref={formRef} className="book-form" onSubmit={onSubmit} noValidate>
        <aside className="book-form__preview" aria-label="Prévia da capa">
          <BookCover book={previewBook} size="fluid" onImageError={() => setCoverFailed(true)} />
        </aside>

        <div className="book-form__fields">
          {submitted && (errorCount > 0 || submitError) && (
            <div ref={alertRef} className="form-alert" role="alert" tabIndex={-1}>
              {submitError ??
                (errorCount === 1 ? 'Há 1 campo para corrigir.' : `Há ${errorCount} campos para corrigir.`)}
            </div>
          )}

          <fieldset className="book-form__group">
            <legend className="book-form__legend">Livro</legend>
            <Field label="Título" required error={errorFor('title')}>
              <input className="input" maxLength={LIMITS.title + 20} autoComplete="off" {...bind('title')} />
            </Field>
            <Field
              label="Autor"
              required={!formOptions.allowMissingAuthor}
              error={errorFor('author')}
              hint={formOptions.allowMissingAuthor ? 'Não estava nas anotações importadas. Preencha quando quiser.' : undefined}
            >
              <input className="input" maxLength={LIMITS.author + 20} autoComplete="off" {...bind('author')} />
            </Field>
            <Field
              label="Descrição"
              error={errorFor('description')}
              hint={`${values.description.length}/${LIMITS.description} caracteres`}
            >
              <textarea className="textarea" rows={4} {...bind('description')} />
            </Field>
          </fieldset>

          <fieldset className="book-form__group">
            <legend className="book-form__legend">Leitura</legend>
            <ChoiceGroup
              legend="Status"
              name="status"
              options={STATUS_OPTIONS}
              value={values.status}
              onChange={(value) => setField('status', value)}
              error={errorFor('status')}
            />
            <div className="book-form__row">
              <Field
                label="Total de páginas"
                required={!formOptions.allowMissingTotal}
                error={errorFor('totalPages')}
                hint={formOptions.allowMissingTotal ? 'Não informado nas anotações. Deixe em branco se não souber.' : undefined}
              >
                <input className="input input--number" inputMode="numeric" pattern="[0-9]*" {...bind('totalPages')} />
              </Field>
              <Field
                label="Página atual"
                error={errorFor('currentPage')}
                hint={isFinished ? 'Livro concluído: igual ao total.' : 'Última página que você terminou.'}
              >
                <input
                  className="input input--number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={isFinished}
                  {...bind('currentPage')}
                />
              </Field>
            </div>
            <div className="book-form__row">
              <Field
                label="Página inicial da leitura"
                error={errorFor('contentStartPage')}
                hint={contentStartHint(values, isEdit)}
              >
                <input
                  className="input input--number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="1"
                  {...bind('contentStartPage')}
                />
              </Field>
            </div>
            {values.status !== 'want-to-read' && (
              <div className="book-form__row">
                <Field label="Data de início" error={errorFor('startedAt')}>
                  <input type="date" className="input" max={toInputDate(new Date())} {...bind('startedAt')} />
                </Field>
                {isFinished && (
                  <Field label="Data de conclusão" required error={errorFor('finishedAt')}>
                    <input type="date" className="input" max={toInputDate(new Date())} {...bind('finishedAt')} />
                  </Field>
                )}
              </div>
            )}
          </fieldset>

          {(isFinished || hasFinalReview(book)) && (
            <fieldset className="book-form__group">
              <legend className="book-form__legend">Comentário final</legend>
              <p className="book-form__muted">
                Opcional. É a sua opinião sobre o livro inteiro; as observações de cada sessão ficam no histórico.
              </p>
              <FinalReviewFields
                values={values}
                errors={{ rating: errorFor('rating'), review: errorFor('review'), learnings: errorFor('learnings') }}
                onChange={setField}
                onBlur={(name) => setTouched((t) => ({ ...t, [name]: true }))}
              />
            </fieldset>
          )}

          <fieldset className="book-form__group">
            <legend className="book-form__legend">Capa</legend>
            <CoverField
              value={values.coverUrl}
              onChange={(value) => {
                setField('coverUrl', value);
                setTouched((t) => ({ ...t, coverUrl: true }));
              }}
              error={errorFor('coverUrl')}
              imageFailed={coverFailed}
            />
          </fieldset>

          <div className="book-form__actions">
            <Button variant="ghost" onClick={cancel}>
              Cancelar
            </Button>
            <Button type="submit" icon={Save}>
              {isEdit ? 'Salvar alterações' : 'Adicionar livro'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
