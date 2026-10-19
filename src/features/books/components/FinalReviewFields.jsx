import { ChoiceGroup, Field } from '../../../components/ui';
import { LIMITS } from '../../../utils/validation.js';

const RATING_OPTIONS = [
  { value: '', label: 'Sem nota' },
  ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ★` })),
];

/**
 * Campos do comentário final (todos opcionais). Usados no diálogo que
 * aparece ao concluir um livro e no formulário de edição do livro.
 */
export function FinalReviewFields({ values, onChange, errors = {}, onBlur }) {
  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (event) => onChange(name, event.target.value),
    onBlur: onBlur ? () => onBlur(name) : undefined,
  });
  return (
    <>
      <ChoiceGroup
        legend="Minha avaliação"
        name="rating"
        options={RATING_OPTIONS}
        value={values.rating ?? ''}
        onChange={(value) => onChange('rating', value)}
        error={errors.rating}
      />
      <Field label="O que achei do livro" error={errors.review} hint={`${(values.review ?? '').length}/${LIMITS.review}`}>
        <textarea className="textarea" rows={3} placeholder="Sua opinião sobre a obra, os personagens, o estilo…" {...bind('review')} />
      </Field>
      <Field label="O que aprendi ou levo desta leitura" error={errors.learnings} hint={`${(values.learnings ?? '').length}/${LIMITS.learnings}`}>
        <textarea className="textarea" rows={3} placeholder="Uma ideia, uma mudança de opinião, algo para lembrar…" {...bind('learnings')} />
      </Field>
    </>
  );
}
