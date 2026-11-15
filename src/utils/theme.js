/**
 * Aparência: tema (escuro, claro ou do sistema), cor de destaque e cores
 * dos formatos, aplicados no <html> como atributo e variáveis CSS
 * (styles/tokens.css). A última escolha fica guardada neste navegador só
 * para evitar um "piscar" de cores ao abrir o site; a fonte da verdade são
 * as Configurações (salvas na conta).
 */
import { DEFAULT_ACCENT } from './settings.js';
import { normalizeFormatColors } from './formats.js';

export const THEME_CACHE_KEY = 'readtrack:appearance';
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Luminância relativa (WCAG) de uma cor #RRGGBB. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Texto sobre a cor de destaque: escuro ou branco, o que tiver mais contraste. */
export function pickContrastText(hex) {
  const color = HEX.test(hex ?? '') ? hex : DEFAULT_ACCENT;
  return contrastRatio(color, '#0B0C10') >= contrastRatio(color, '#FFFFFF') ? '#0B0C10' : '#FFFFFF';
}

/** 'system' → 'dark' | 'light' conforme o sistema. */
export function resolveTheme(theme, prefersLight = false) {
  if (theme === 'light' || theme === 'dark') return theme;
  return prefersLight ? 'light' : 'dark';
}

const prefersLight = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;

/** Aplica a aparência no documento. */
export function applyAppearance({ theme = 'dark', accent = DEFAULT_ACCENT, formatColors } = {}, root = document.documentElement) {
  const resolved = resolveTheme(theme, prefersLight());
  const color = HEX.test(accent ?? '') ? accent : DEFAULT_ACCENT;
  const formats = normalizeFormatColors(formatColors);
  root.dataset.theme = resolved;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent-contrast', pickContrastText(color));
  root.style.setProperty('--format-print', formats.print);
  root.style.setProperty('--format-digital', formats.digital);
  root.style.setProperty('--format-audio', formats.audio);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f4f5f9' : '#0b0c10');
  return resolved;
}

export function cacheAppearance(appearance) {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(appearance));
  } catch {
    /* sem armazenamento: só não evita o piscar */
  }
}

/** Ao abrir o site: aplica a última aparência usada neste navegador. */
export function applyCachedAppearance() {
  try {
    const cached = JSON.parse(localStorage.getItem(THEME_CACHE_KEY) ?? 'null');
    if (cached && typeof cached === 'object') applyAppearance(cached);
  } catch {
    /* ignora valor inválido */
  }
}
