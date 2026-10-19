import { useContext } from 'react';
import { ToastContext } from '../context/ToastContext.js';

/** Exibe avisos rápidos: toast.success('Salvo'), toast.error('Falhou'). */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return context;
}
