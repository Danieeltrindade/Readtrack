import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './ConfirmDialog.css';

/**
 * Diálogo genérico (formulários, detalhes) sobre o <dialog> nativo:
 * foco preso, Esc fecha e o foco volta para quem abriu.
 * O conteúdo e os botões ficam a cargo de quem usa.
 */
export function Modal({ open, title, description, onClose, children, size = 'md', className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`confirm-dialog modal modal--${size} ${className}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose?.();
      }}
    >
      {open && (
        <div className="confirm-dialog__body">
          <div className="modal__header">
            <h2 id={titleId} className="confirm-dialog__title">
              {title}
            </h2>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {description && (
            <p id={descId} className="confirm-dialog__description">
              {description}
            </p>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}
