import { useEffect } from 'react';

/** Atualiza o título da aba: "Biblioteca · ReadTrack". */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ReadTrack` : 'ReadTrack';
  }, [title]);
}
