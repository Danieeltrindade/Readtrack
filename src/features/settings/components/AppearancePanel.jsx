import { useRef, useState } from 'react';
import { Check, ImagePlus, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { Avatar, Button, FormatIcon, Panel } from '../../../components/ui';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { ACCENT_COLORS, DEFAULT_ACCENT } from '../../../utils/settings.js';
import { DEFAULT_FORMAT_COLORS, FORMAT_LABELS, FORMAT_LIST } from '../../../utils/formats.js';
import { fileToAvatarDataUrl } from '../../../utils/image.js';

const THEMES = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Do sistema', icon: Monitor },
];

const COLOR_NAMES = {
  '#8B7CFF': 'Violeta',
  '#6E8BFF': 'Anil',
  '#5CC8FF': 'Azul',
  '#3DD6C6': 'Turquesa',
  '#7EF0C1': 'Menta',
  '#A3E36B': 'Lima',
  '#FFD15C': 'Amarelo',
  '#FFB054': 'Âmbar',
  '#FF8A5C': 'Laranja',
  '#FF6F7D': 'Coral',
  '#FF6FA8': 'Rosa',
  '#D67CFF': 'Lilás',
};

/**
 * Aparência (1.7.0): foto do perfil, tema, cor de destaque e cores dos
 * formatos. Tudo é salvo nas preferências (na conta, quando há login).
 */
export function AppearancePanel() {
  const { settings, actions } = useData();
  const toast = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const accent = settings.accent ?? DEFAULT_ACCENT;
  const formatColors = settings.formatColors ?? DEFAULT_FORMAT_COLORS;
  const customAccent = !ACCENT_COLORS.includes(accent);

  const save = (values) => actions.updateSettings(values);

  const onAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const avatarUrl = await fileToAvatarDataUrl(file);
      save({ avatarUrl });
      toast.success('Foto do perfil atualizada.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Aparência" className="appearance">
      {/* Foto */}
      <div className="appearance__profile">
        <Avatar src={settings.avatarUrl} name={settings.userName} size={72} />
        <div className="appearance__profile-text">
          <p className="appearance__label">Foto do perfil</p>
          <p className="settings__muted">Aparece no menu, no lugar da inicial. A imagem é recortada em quadrado e reduzida.</p>
          <div className="settings__actions">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onAvatar} />
            <Button variant="secondary" size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Preparando…' : settings.avatarUrl ? 'Trocar foto' : 'Escolher foto'}
            </Button>
            {settings.avatarUrl && (
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => save({ avatarUrl: '' })}>
                Remover foto
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tema */}
      <fieldset className="appearance__group">
        <legend className="appearance__label">Tema</legend>
        <div className="appearance__themes">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <label key={value} className={`appearance__theme appearance__theme--${value}`}>
              <input type="radio" name="theme" value={value} checked={settings.theme === value} onChange={() => save({ theme: value })} />
              <span className="appearance__theme-card">
                <span className="appearance__theme-preview" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="appearance__theme-name">
                  <Icon size={15} aria-hidden="true" /> {label}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Destaque */}
      <fieldset className="appearance__group">
        <legend className="appearance__label">Cor de destaque</legend>
        <div className="appearance__swatches">
          {ACCENT_COLORS.map((color) => (
            <label key={color} className="appearance__swatch" style={{ '--swatch': color }} title={COLOR_NAMES[color]}>
              <input type="radio" name="accent" value={color} checked={accent === color} onChange={() => save({ accent: color })} />
              <span className="appearance__swatch-dot">{accent === color && <Check size={16} aria-hidden="true" />}</span>
              <span className="visually-hidden">{COLOR_NAMES[color]}</span>
            </label>
          ))}
          <label className={`appearance__swatch appearance__swatch--custom ${customAccent ? 'is-on' : ''}`} style={{ '--swatch': accent }}>
            <input type="color" value={accent.toLowerCase()} onChange={(e) => save({ accent: e.target.value })} aria-label="Outra cor de destaque" />
            <span className="appearance__swatch-dot">{customAccent ? <Check size={16} aria-hidden="true" /> : '+'}</span>
          </label>
        </div>
        <p className="settings__muted">Botões, links, gráficos e o brilho do fundo usam esta cor.</p>
      </fieldset>

      {/* Formatos */}
      <fieldset className="appearance__group">
        <legend className="appearance__label">Cores dos formatos</legend>
        <div className="appearance__formats">
          {FORMAT_LIST.map((format) => (
            <label key={format} className="appearance__format" style={{ '--swatch': formatColors[format] }}>
              <span className="appearance__format-icon">
                <FormatIcon format={format} size={18} />
              </span>
              <span className="appearance__format-name">{FORMAT_LABELS[format]}</span>
              <input
                type="color"
                value={formatColors[format].toLowerCase()}
                onChange={(e) => save({ formatColors: { ...formatColors, [format]: e.target.value } })}
                aria-label={`Cor de ${FORMAT_LABELS[format]}`}
              />
            </label>
          ))}
        </div>
        <div className="settings__actions">
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={() => save({ accent: DEFAULT_ACCENT, formatColors: { ...DEFAULT_FORMAT_COLORS } })}
            disabled={accent === DEFAULT_ACCENT && FORMAT_LIST.every((f) => formatColors[f] === DEFAULT_FORMAT_COLORS[f])}
          >
            Voltar às cores padrão
          </Button>
        </div>
      </fieldset>
    </Panel>
  );
}
