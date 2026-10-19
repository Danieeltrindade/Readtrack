/**
 * Preferências do usuário — valores padrão e validação.
 */
export const SETTINGS_OPTIONS = Object.freeze({
  weekStartsOn: ['monday', 'sunday'],
  textSize: ['normal', 'large'],
  motion: ['system', 'reduce'],
});

export const DEFAULT_SETTINGS = Object.freeze({
  userName: '',
  weekStartsOn: 'monday',
  textSize: 'normal',
  motion: 'system',
});

export const USER_NAME_MAX = 40;

const pick = (value, key) => (SETTINGS_OPTIONS[key].includes(value) ? value : DEFAULT_SETTINGS[key]);

export function normalizeSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    ...source,
    userName: typeof source.userName === 'string' ? source.userName.trim().slice(0, USER_NAME_MAX) : '',
    weekStartsOn: pick(source.weekStartsOn, 'weekStartsOn'),
    textSize: pick(source.textSize, 'textSize'),
    motion: pick(source.motion, 'motion'),
  };
}
