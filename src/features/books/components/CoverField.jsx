import { useId, useRef, useState } from 'react';
import { ImagePlus, Link2, Trash2 } from 'lucide-react';
import { Button, Field } from '../../../components/ui';
import { fileToCoverDataUrl } from '../../../utils/image.js';

/**
 * Capa opcional: endereço da imagem OU arquivo do computador/celular.
 * Arquivos são reduzidos antes de salvar. Sem capa, o site gera uma.
 */
export function CoverField({ value, onChange, error, imageFailed }) {
  const fileRef = useRef(null);
  const statusId = useId();
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState(null);
  const isUpload = value.startsWith('data:');

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    setFileError(null);
    setLoading(true);
    try {
      onChange(await fileToCoverDataUrl(file));
    } catch (problem) {
      setFileError(problem.message);
    } finally {
      setLoading(false);
    }
  };

  const hint = imageFailed
    ? 'Não foi possível carregar esta imagem. A capa gerada será usada no lugar.'
    : 'Cole o endereço de uma imagem ou envie um arquivo. Sem capa, o ReadTrack cria uma.';

  return (
    <div className="cover-field">
      {isUpload ? (
        <div className="field">
          <span className="field__label">Capa</span>
          <p className="cover-field__uploaded">
            <ImagePlus size={16} aria-hidden="true" /> Imagem enviada do seu dispositivo
          </p>
        </div>
      ) : (
        <Field label="Endereço da capa" hint={hint} error={error}>
          <input
            name="coverUrl"
            type="url"
            inputMode="url"
            className="input"
            placeholder="https://…"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
          />
        </Field>
      )}

      <div className="cover-field__actions">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />
        <Button variant="secondary" size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={loading} aria-describedby={statusId}>
          {loading ? 'Processando imagem…' : isUpload ? 'Trocar imagem' : 'Enviar imagem'}
        </Button>
        {isUpload && (
          <Button variant="ghost" size="sm" icon={Link2} onClick={() => onChange('')}>
            Usar endereço
          </Button>
        )}
        {value && (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onChange('')}>
            Remover capa
          </Button>
        )}
      </div>
      <p id={statusId} className={fileError ? 'field__error' : 'visually-hidden'} role="status">
        {fileError ?? (loading ? 'Processando imagem' : '')}
      </p>
    </div>
  );
}
