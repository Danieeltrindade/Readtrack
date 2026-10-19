import { useEffect, useState } from 'react';

/**
 * Devolve o horário atual (ms), atualizado a cada `intervalMs` enquanto
 * `enabled` for verdadeiro. Serve só para RE-RENDERIZAR: o tempo do
 * cronômetro é sempre calculado a partir dos timestamps salvos.
 *
 * Ao voltar para a aba (visibilitychange) atualiza na hora, sem esperar
 * o próximo tique — navegadores atrasam timers em abas ocultas.
 */
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);

  return now;
}
