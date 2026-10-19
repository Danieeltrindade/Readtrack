/**
 * Gera um identificador único. Usa crypto.randomUUID quando disponível
 * (navegadores modernos em contexto seguro) e cai para uma combinação
 * de tempo + aleatório caso contrário (ex.: http em rede local).
 */
export function createId(prefix = '') {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}
