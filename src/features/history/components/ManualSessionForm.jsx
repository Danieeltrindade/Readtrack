import { useMemo, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button, Field } from '../../../components/ui';
import { addDays, toInputDate } from '../../../utils/date.js';
import { calculateElapsedSeconds, formatDurationText } from '../../../utils/duration.js';
import { LIMITS, combineLocalDateTime, parseVocabularyText } from '../../../utils/validation.js';
import { formatNumber } from '../../../utils/format.js';

const FIELD_ORDER = ['bookId', 'startDate', 'startTime', 'endDate', 'endTime', 'startPage', 'endPage', 'duration', 'notes', 'vocabularyText'];

/**
 * Formulário de sessão manual (cadastro e edição). As páginas são os números
 * IMPRESSOS da primeira e da última página lidas. Data de término só precisa
 * ser informada quando a leitura terminou em outro dia (ex.: depois da
 * meia-noite) — o formulário nunca deduz isso sozinho.
 */
export function ManualSessionForm({ initialValues, books, lockBook = false, onSubmit, onCancel, submitLabel = 'Salvar sessão' }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);
  const book = books.find((b) => b.id === values.bookId) ?? null;
  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  // Prévia: páginas lidas e duração calculada pelos horários (só informativo).
  const preview = useMemo(() => {
    const first = Number(values.startPage);
    const last = Number(values.endPage);
    const pages = Number.isInteger(first) && Number.isInteger(last) && last >= first && first >= 1 ? last - first + 1 : null;
    const start = combineLocalDateTime(values.startDate, values.startTime);
    const end = values.endTime ? combineLocalDateTime(values.endDate || values.startDate, values.endTime) : null;
    const elapsed = start && end ? calculateElapsedSeconds(start, end) : null;
    return { pages, elapsed };
  }, [values]);

  const crossesMidnight =
    values.endTime && values.startTime && values.endTime < values.startTime && (!values.endDate || values.endDate === values.startDate);

  const submit = (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const result = onSubmit(values);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      const first = FIELD_ORDER.find((name) => result.errors?.[name]);
      requestAnimationFrame(() => formRef.current?.querySelector(first ? `[name="${first}"]` : '.form-alert')?.focus());
    }
  };

  const vocabularyCount = parseVocabularyText(values.vocabularyText).length;

  return (
    <form ref={formRef} className="session-dialog__form manual-form" onSubmit={submit} noValidate>
      {errors.form && (
        <p className="form-alert" role="alert" tabIndex={-1}>
          {errors.form}
        </p>
      )}

      {!lockBook && (
        <Field label="Livro" required error={errors.bookId}>
          <select name="bookId" className="select" value={values.bookId} onChange={set('bookId')}>
            <option value="">Escolha um livro</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>
      )}

      <fieldset className="manual-form__group">
        <legend>Quando você leu</legend>
        <div className="session-dialog__row">
          <Field label="Data de início" required error={errors.startDate}>
            <input name="startDate" type="date" className="input" max={toInputDate(new Date())} value={values.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Horário de início" required error={errors.startTime}>
            <input name="startTime" type="time" className="input" value={values.startTime} onChange={set('startTime')} />
          </Field>
        </div>
        <div className="session-dialog__row">
          <Field label="Data de término" error={errors.endDate} hint="Só se for outro dia.">
            <input name="endDate" type="date" className="input" value={values.endDate} onChange={set('endDate')} />
          </Field>
          <Field label="Horário de término" error={errors.endTime}>
            <input name="endTime" type="time" className="input" value={values.endTime} onChange={set('endTime')} />
          </Field>
        </div>
        {crossesMidnight && values.startDate && (
          <p className="manual-form__hint" role="status">
            O término é mais cedo que o início. Se a leitura passou da meia-noite,{' '}
            <button
              type="button"
              className="session-dialog__link"
              onClick={() => setValues((v) => ({ ...v, endDate: toInputDate(addDays(combineLocalDateTime(v.startDate, '12:00'), 1)) }))}
            >
              marcar que terminou no dia seguinte
            </button>
            .
          </p>
        )}
      </fieldset>

      <fieldset className="manual-form__group">
        <legend>Páginas (números impressos)</legend>
        <div className="session-dialog__row">
          <Field label="Primeira página lida" required error={errors.startPage}>
            <input name="startPage" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.startPage} onChange={set('startPage')} />
          </Field>
          <Field label="Última página lida" required error={errors.endPage} hint={book?.totalPages ? `Até ${formatNumber(book.totalPages)}.` : undefined}>
            <input name="endPage" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.endPage} onChange={set('endPage')} />
          </Field>
        </div>
        <p className="manual-form__hint" aria-live="polite">
          {preview.pages ? `${formatNumber(preview.pages)} ${preview.pages === 1 ? 'página' : 'páginas'} (da ${values.startPage} à ${values.endPage}, inclusive).` : 'Ex.: 9 a 14 = 6 páginas.'}
        </p>
      </fieldset>

      <Field
        label="Duração registrada"
        error={errors.duration}
        hint={`Como você anotou: h:mm:ss, mm:ss ou minutos. Deixe em branco se não souber.${
          preview.elapsed !== null ? ` Pelos horários: ${formatDurationText(preview.elapsed)}.` : ''
        }`}
      >
        <input name="duration" className="input" inputMode="numeric" placeholder="ex.: 53:09" value={values.duration} onChange={set('duration')} autoComplete="off" />
      </Field>

      <Field label="Observações" error={errors.notes} hint={`${values.notes.length}/${LIMITS.notes}`}>
        <textarea name="notes" className="textarea" rows={3} value={values.notes} onChange={set('notes')} placeholder="Ideias, trechos, interpretações, dúvidas…" />
      </Field>
      <Field
        label="Vocabulário"
        error={errors.vocabularyText}
        hint={`Uma palavra por linha: “palavra: significado”. ${vocabularyCount ? `${vocabularyCount} ${vocabularyCount === 1 ? 'palavra' : 'palavras'}.` : ''}`}
      >
        <textarea name="vocabularyText" className="textarea" rows={4} value={values.vocabularyText} onChange={set('vocabularyText')} placeholder={'Estela: Monumento histórico.\nRegato: Riacho estreito.'} />
      </Field>

      <div className="confirm-dialog__actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" icon={CalendarPlus} disabled={saving}>
          {saving ? 'Salvando…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
