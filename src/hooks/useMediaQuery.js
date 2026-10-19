import { useSyncExternalStore } from 'react';

/** Breakpoints usados também no CSS (styles/tokens.css). */
export const BREAKPOINTS = Object.freeze({
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1099px)',
  desktop: '(min-width: 1100px)',
});

/** Retorna true enquanto a media query corresponder. */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
