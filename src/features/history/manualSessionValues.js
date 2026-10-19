/** Conversões entre sessão manual e os valores (texto) do formulário. */
import { toInputDate, toInputTime } from '../../utils/date.js';
import { formatDurationText } from '../../utils/duration.js';
import { formatVocabularyText } from '../../utils/validation.js';

/** Sessão salva → valores do formulário (datas e horários locais). */
export function sessionToManualValues(session) {
  return {
    bookId: session.bookId,
    startDate: toInputDate(session.startedAt),
    startTime: toInputTime(session.startedAt),
    endDate: session.finishedAt ? toInputDate(session.finishedAt) : '',
    endTime: session.finishedAt ? toInputTime(session.finishedAt) : '',
    startPage: String(session.startPage),
    endPage: String(session.endPage),
    duration: formatDurationText(session.durationSeconds),
    notes: session.notes ?? '',
    vocabularyText: formatVocabularyText(session.vocabulary),
  };
}

export const emptyManualValues = (bookId = '') => ({
  bookId,
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  startPage: '',
  endPage: '',
  duration: '',
  notes: '',
  vocabularyText: '',
});
