import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BookCheck, BookMarked, BookOpen, Pencil, Timer, Trash2 } from 'lucide-react';
import { ConfirmDialog, Menu } from '../../../components/ui';
import { usePaths } from '../../../hooks/useWorkspace.js';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { BOOK_STATUS_LABELS } from '../../../utils/validation.js';
import { FinalReviewDialog } from './FinalReviewDialog.jsx';
import { formatDuration, pluralize } from '../../../utils/format.js';

const STATUS_ICONS = { reading: BookOpen, finished: BookCheck, 'want-to-read': BookMarked };
const STATUS_TOASTS = {
  reading: 'marcado como "Lendo".',
  finished: 'marcado como concluído.',
  'want-to-read': 'movido para "Quero ler".',
};

/**
 * Menu de ações de um livro: ler, editar, mudar status e excluir.
 * A exclusão sempre pede confirmação e diz o que será apagado junto.
 */
export function BookActionsMenu({ book, onDeleted, showRead = true, align = 'end' }) {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  const { sessions, activeSession, actions } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [askReview, setAskReview] = useState(false);

  const bookSessions = sessions.filter((s) => s.bookId === book.id);
  const sessionCount = bookSessions.length;
  const hasActiveTimer = activeSession?.bookId === book.id;
  // Livro lido antes do ReadTrack é um registro de leitura concluída:
  // não recebe sessões nem muda de status pelo menu.
  const pastRead = Boolean(book.addedAsRead);

  const changeStatus = (status) => {
    if (status === book.status) return;
    const result = actions.changeBookStatus(book.id, status);
    if (!result.ok) return;
    toast.success(`“${book.title}” ${STATUS_TOASTS[status]}`);
    // Concluiu por aqui: oferece (sem obrigar) o comentário final.
    if (status === 'finished') setAskReview(true);
  };

  const items = [
    ...(showRead && book.status !== 'finished' && !pastRead
      ? [{ label: hasActiveTimer ? 'Voltar ao cronômetro' : 'Iniciar leitura', icon: Timer, onSelect: () => navigate(`${ROUTES.reading}?livro=${book.id}`) }]
      : []),
    { label: 'Editar livro', icon: Pencil, onSelect: () => navigate(ROUTES.editBook(book.id)) },
    ...(pastRead
      ? []
      : [
          { separator: true },
          ...Object.entries(BOOK_STATUS_LABELS).map(([status, label]) => ({
            label,
            icon: STATUS_ICONS[status],
            checked: book.status === status,
            onSelect: () => changeStatus(status),
          })),
        ]),
    { separator: true },
    { label: 'Excluir livro', icon: Trash2, danger: true, onSelect: () => setConfirmingDelete(true) },
  ];

  // Regra de integridade: sessões pertencem ao livro. Excluir o livro exclui
  // as sessões dele (também no banco, por chave estrangeira em cascata).
  // A confirmação diz exatamente o que sai das estatísticas.
  const pagesRead = bookSessions.reduce((t, s) => t + (s.pagesRead || 0), 0);
  const seconds = bookSessions.reduce((t, s) => t + (s.durationSeconds || 0), 0);
  const notes = bookSessions.filter((s) => s.notes).length;
  const consequences = [
    sessionCount > 0 &&
      `${pluralize(sessionCount, 'sessão', 'sessões')} de leitura também ${sessionCount === 1 ? 'será apagada' : 'serão apagadas'} (${pluralize(pagesRead, 'página')}, ${formatDuration(seconds)}${notes ? `, ${pluralize(notes, 'observação', 'observações')}` : ''}), e as estatísticas, metas e o histórico deixarão de contá-${sessionCount === 1 ? 'la' : 'las'}.`,
    sessionCount > 0 && 'Se quiser guardar esses dados, exporte um backup em Configurações antes.',
    hasActiveTimer && 'O cronômetro em andamento será descartado.',
    'Essa ação não pode ser desfeita.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Menu label={`Ações para ${book.title}`} items={items} align={align} />
      <FinalReviewDialog book={book} open={askReview} afterFinish onClose={() => setAskReview(false)} />
      <ConfirmDialog
        open={confirmingDelete}
        title={`Excluir “${book.title}”?`}
        description={consequences}
        confirmLabel="Excluir livro"
        variant="danger"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          actions.deleteBook(book.id);
          toast.success(`“${book.title}” foi excluído.`);
          onDeleted?.();
        }}
      />
    </>
  );
}
