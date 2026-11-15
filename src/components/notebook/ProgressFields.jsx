import { Field } from '../ui';
import './Notebook.css';
import { AUDIO_SPEEDS, PROGRESS_KINDS, formatAudioPosition, formatSpeed, parseAudioPosition } from '../../utils/formats.js';
import { parseInteger } from '../../utils/validation.js';

/**
 * Início e fim de uma sessão que não é por páginas:
 * - percent: % inicial e final (e-book);
 * - audio: posição inicial e final no áudio + velocidade (audiobook).
 * Mostra ao lado quanto a sessão avançou.
 */
export function ProgressFields({ kind, book, values, onChange, errorFor, autoFocusEnd = false }) {
  const set = (name) => (event) => onChange(name, event.target.value);

  if (kind === PROGRESS_KINDS.PERCENT) {
    const start = parseInteger(values.startPercent);
    const end = parseInteger(values.endPercent);
    const delta = !Number.isNaN(start) && !Number.isNaN(end) && end >= start ? end - start : null;
    return (
      <div className="progress-fields">
        <Field label="% inicial" required error={errorFor('startPercent')} hint="Onde o e-book estava.">
          <input name="startPercent" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.startPercent ?? ''} onChange={set('startPercent')} />
        </Field>
        <Field label="% final" required error={errorFor('endPercent')} hint="Onde você parou (até 100).">
          <input name="endPercent" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={values.endPercent ?? ''} onChange={set('endPercent')} autoFocus={autoFocusEnd} />
        </Field>
        <div className="progress-fields__delta" aria-live="polite">
          <span className="progress-fields__delta-label">Avanço</span>
          <output className="progress-fields__delta-value tabular">{delta === null ? '—' : `+${delta}%`}</output>
        </div>
      </div>
    );
  }

  const start = parseAudioPosition(values.startPosition);
  const end = parseAudioPosition(values.endPosition);
  const listened = Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null;
  const total = book?.audioDurationSeconds;
  return (
    <>
      <div className="progress-fields">
        <Field label="Posição inicial" required error={errorFor('startPosition')} hint="h:mm:ss, como no app de áudio.">
          <input name="startPosition" className="input input--number" inputMode="text" placeholder="0:00:00" value={values.startPosition ?? ''} onChange={set('startPosition')} />
        </Field>
        <Field label="Posição final" required error={errorFor('endPosition')} hint={total ? `Onde você parou (até ${formatAudioPosition(total)}).` : 'Onde você parou.'}>
          <input name="endPosition" className="input input--number" inputMode="text" placeholder="1:20:00" value={values.endPosition ?? ''} onChange={set('endPosition')} autoFocus={autoFocusEnd} />
        </Field>
        <div className="progress-fields__delta" aria-live="polite">
          <span className="progress-fields__delta-label">Trecho ouvido</span>
          <output className="progress-fields__delta-value tabular">{listened === null ? '—' : formatAudioPosition(listened)}</output>
        </div>
      </div>
      <Field label="Velocidade" error={errorFor('speed')} hint="A velocidade em que você ouviu.">
        <select name="speed" className="select" value={values.speed ?? ''} onChange={set('speed')}>
          <option value="">Não informar</option>
          {AUDIO_SPEEDS.map((s) => (
            <option key={s} value={String(s)}>
              {formatSpeed(s)}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
