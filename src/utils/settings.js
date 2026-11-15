/**
 * Preferências do usuário — valores padrão e validação.
 */
import { DEFAULT_FORMAT_COLORS, normalizeFormatColors } from './formats.js';

export const SETTINGS_OPTIONS = Object.freeze({
  weekStartsOn: ['monday', 'sunday'],
  textSize: ['normal', 'large'],
  motion: ['system', 'reduce'],
  theme: ['dark', 'light', 'system'],
});

/** Cores de destaque oferecidas nas Configurações (qualquer #RRGGBB é aceito). */
export const ACCENT_COLORS = Object.freeze([
  '#8B7CFF', '#6E8BFF', '#5CC8FF', '#3DD6C6', '#7EF0C1', '#A3E36B',
  '#FFD15C', '#FFB054', '#FF8A5C', '#FF6F7D', '#FF6FA8', '#D67CFF',
]);

export const DEFAULT_ACCENT = '#8B7CFF';

export const DEFAULT_SETTINGS = Object.freeze({
  userName: '',
  weekStartsOn: 'monday',
  textSize: 'normal',
  motion: 'system',
  theme: 'dark',
  accent: DEFAULT_ACCENT,
  formatColors: DEFAULT_FORMAT_COLORS,
  avatarUrl: '',
});

export const USER_NAME_MAX = 40;
/** Foto de perfil: imagem JPEG já reduzida pelo site (data URL), até ~300 KB. */
export const AVATAR_MAX_BYTES = 300_000;

const HEX = /^#[0-9A-Fa-f]{6}$/;
const AVATAR_PATTERN = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

const pick = (value, key) => (SETTINGS_OPTIONS[key].includes(value) ? value : DEFAULT_SETTINGS[key]);

export function isValidAvatar(value) {
  return value === '' || (typeof value === 'string' && value.length <= AVATAR_MAX_BYTES && AVATAR_PATTERN.test(value));
}

export function normalizeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    ...source,
    userName: typeof source.userName === 'string' ? source.userName.trim().slice(0, USER_NAME_MAX) : '',
    weekStartsOn: pick(source.weekStartsOn, 'weekStartsOn'),
    textSize: pick(source.textSize, 'textSize'),
    motion: pick(source.motion, 'motion'),
    theme: pick(source.theme, 'theme'),
    accent: typeof source.accent === 'string' && HEX.test(source.accent) ? source.accent.toUpperCase() : DEFAULT_ACCENT,
    formatColors: normalizeFormatColors(source.formatColors),
    avatarUrl: isValidAvatar(source.avatarUrl) ? source.avatarUrl : '',
  };
}

/** Preferências iguais às padrão? (compara também as cores dos formatos) */
export function isDefaultSettings(settings) {
  const s = normalizeSettings(settings);
  return Object.keys(DEFAULT_SETTINGS).every((key) => JSON.stringify(s[key]) === JSON.stringify(normalizeSettings({})[key]));
}
