/**
 * Marcas que identificam os dados da DEMONSTRAÇÃO PÚBLICA (módulo pequeno,
 * sem o gerador, para poder ser usado nas regras de importação da conta).
 */
export const DEMO_ID_PREFIX = 'demo_';
export const DEMO_WORKSPACE = 'demo';

/** Registro criado pelo conjunto fictício (ou por versões antigas da demonstração)? */
export const isDemoRecordId = (value) => typeof value === 'string' && value.startsWith(DEMO_ID_PREFIX);
