import { TriangleAlert, X } from 'lucide-react';
import { useData } from '../../hooks/useData.js';

/**
 * Aviso persistente sobre problemas de armazenamento: dados corrompidos
 * recuperados, navegador sem localStorage, falha de gravação etc.
 */
export function StorageNotice() {
  const { storage, actions } = useData();
  const message = storage.saveError ?? storage.message;
  if (!message) return null;

  return (
    <div className="storage-notice" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <p>{message}</p>
      {!storage.saveError && (
        <button type="button" onClick={actions.dismissStorageMessage} aria-label="Fechar aviso">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
