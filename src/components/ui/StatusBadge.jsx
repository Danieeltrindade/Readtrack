import { BOOK_STATUS_LABELS } from '../../utils/validation.js';
import './StatusBadge.css';

/** Etiqueta de status do livro: Lendo, Concluído, Quero ler. */
export function StatusBadge({ status }) {
  return <span className={`status-badge status-badge--${status}`}>{BOOK_STATUS_LABELS[status] ?? status}</span>;
}
