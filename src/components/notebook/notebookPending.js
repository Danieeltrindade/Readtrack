import { buildNotebookEntry } from '../../utils/annotations.js';
import { createId } from '../../utils/id.js';

/**
 * Acrescenta ao caderno o que ainda estava sendo digitado (`value.pending`).
 * Devolve { patch } com vocabulary/annotations atualizados (ou vazio se não
 * havia nada) ou { error } quando o texto digitado não é válido.
 */
export function flushNotebookPending(value, anchorKind, { requireText = false } = {}) {
  const pending = value?.pending;
  if (!pending || pending.type === 'summary') return { patch: {} };
  if (!String(pending.text ?? '').trim()) {
    return requireText ? { error: pending.type === 'word' ? 'Escreva a palavra.' : 'Escreva a anotação.' } : { patch: {} };
  }
  const built = buildNotebookEntry(pending.type, pending, { anchorKind, id: createId('note') });
  if (built.error) return { error: built.error };
  if (pending.type === 'word') return { patch: { vocabulary: [...(value.vocabulary ?? []), built.item] } };
  return { patch: { annotations: [...(value.annotations ?? []), built.item] } };
}
