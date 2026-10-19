import { cloneElement, isValidElement, useId } from 'react';
import './Form.css';

/**
 * Campo de formulário acessível: liga label, dica e erro ao controle
 * por id / aria-describedby / aria-invalid, sem repetir isso em cada tela.
 *
 * <Field label="Título" required error={errors.title}>
 *   <input className="input" value={...} onChange={...} />
 * </Field>
 */
export function Field({ label, hint, error, required = false, className = '', children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
      })
    : children;

  return (
    <div className={`field ${error ? 'field--invalid' : ''} ${className}`}>
      <label className="field__label" htmlFor={children?.props?.id ?? id}>
        {label}
        {!required && <span className="field__optional"> (opcional)</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Grupo de opções exclusivas com aparência de "chips" (radio buttons nativos,
 * então teclado e leitores de tela funcionam sem código extra).
 */
export function ChoiceGroup({ legend, name, options, value, onChange, error }) {
  const errorId = useId();
  return (
    <fieldset className={`field choice-group ${error ? 'field--invalid' : ''}`} aria-describedby={error ? errorId : undefined}>
      <legend className="field__label">{legend}</legend>
      <div className="choice-group__options">
        {options.map((option) => (
          <label key={option.value} className="choice-group__option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
