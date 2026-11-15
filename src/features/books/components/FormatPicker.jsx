import { FormatIcon } from '../../../components/ui/FormatBadge.jsx';
import { FORMAT_LABELS, FORMAT_LIST } from '../../../utils/formats.js';

const DESCRIPTIONS = {
  print: 'Papel. Progresso pela página em que você está.',
  digital: 'Kindle, celular, tablet ou PDF. Por página ou porcentagem.',
  audio: 'Ouvindo. Progresso pela posição no áudio (h:mm:ss).',
};

/**
 * "Como você vai ler?" — três cartões (radio buttons nativos, acessíveis por
 * teclado). `isDisabled(format)` bloqueia formatos incompatíveis com as
 * sessões já registradas.
 */
export function FormatPicker({ value, onChange, isDisabled = () => false, error }) {
  return (
    <fieldset className="format-picker" aria-describedby={error ? 'format-picker-error' : undefined}>
      <legend className="book-form__legend">Como você vai ler?</legend>
      <div className="format-picker__options">
        {FORMAT_LIST.map((format) => {
          const disabled = isDisabled(format);
          return (
            <label key={format} className={`format-picker__option format-picker__option--${format} ${disabled ? 'is-disabled' : ''}`}>
              <input type="radio" name="format" value={format} checked={value === format} disabled={disabled} onChange={() => onChange(format)} />
              <span className="format-picker__card">
                <span className="format-picker__icon">
                  <FormatIcon format={format} size={22} />
                </span>
                <span className="format-picker__label">{FORMAT_LABELS[format]}</span>
                <span className="format-picker__desc">{DESCRIPTIONS[format]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id="format-picker-error" className="field__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
