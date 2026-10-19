import { useEffect, useId, useRef } from 'react';
import { Button } from './Button.jsx';
import './ConfirmDialog.css';

/**
 * Diálogo de confirmação baseado no <dialog> nativo: já traz foco preso,
 * tecla Esc e fundo escurecido, sem bibliotecas extras.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
  confirmDisabled = false,
  children,
}) {
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
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.();
      }}
      onClick={(event) => {
        // Clique no fundo (fora do conteúdo) fecha o diálogo
        if (event.target === ref.current) onCancel?.();
      }}
    >
      <div className="confirm-dialog__body">
        <h2 id={titleId} className="confirm-dialog__title">
          {title}
        </h2>
        {description && (
          <p id={descId} className="confirm-dialog__description">
            {description}
          </p>
        )}
        {children}
        <div className="confirm-dialog__actions">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
