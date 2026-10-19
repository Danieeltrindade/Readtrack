import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, TriangleAlert, Info, X } from 'lucide-react';
import { ToastContext } from './ToastContext.js';
import { createId } from '../utils/id.js';
import '../components/ui/Toast.css';

const ICONS = { success: CircleCheck, error: TriangleAlert, info: Info };
const DURATION_MS = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (message, type = 'info') => {
      const id = createId('toast');
      setToasts((list) => [...list.slice(-2), { id, message, type }]);
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
      info: (message) => show(message, 'info'),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type] ?? Info;
          return (
            <div key={toast.id} className={`toast toast--${toast.type}`}>
              <Icon size={18} aria-hidden="true" />
              <p>{toast.message}</p>
              <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Fechar aviso">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
