/**
 * Validação de entradas. As funções recebem os valores do formulário
 * (strings, como vêm dos inputs), convertem para os tipos certos e devolvem
 * { valid, errors, data }. `errors` tem uma mensagem por campo, para os
 * formulários exibirem junto de cada input.
 */
import { fromInputDate, isAfterToday } from './date.js';
import { MAX_SESSION_SECONDS } from './timer.js';
import { MAX_RECORDED_SECONDS, calculateElapsedSeconds, parseDurationText } from './duration.js';

export const BOOK_STATUSES = ['reading', 'finished', 'want-to-read'];

export const BOOK_STATUS_LABELS = {
  reading: 'Lendo',
  finished: 'Concluído',
  'want-to-read': 'Quero ler',
};

export const LIMITS = Object.freeze({
  title: 200,
  author: 120,
  description: 2000,
  notes: 1000,
  review: 2000,
  learnings: 2000,
  vocabularyEntries: 300,
  vocabularyTerm: 120,
  vocabularyMeaning: 1000,
  maxPages: 20000,
  coverDataUrlBytes: 1_500_000,
});

/** "12" → 12; "", "1.5", "abc", "-3" → NaN. */
export function parseInteger(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value !== 'string' || !/^\s*\d+\s*$/.test(value)) return NaN;
  return Number(value.trim());
}

const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

export function isValidCoverUrl(value) {
  if (!value) return true;
  if (DATA_IMAGE_PATTERN.test(value)) return value.length <= LIMITS.coverDataUrlBytes;
  if (!URL_PATTERN.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function result(errors, data) {
  return { valid: Object.keys(errors).length === 0, errors, data };
}

/**
 * Formulário de livro.
 * Regras de status:
 * - Concluído: página atual = total de páginas e data de conclusão obrigatória.
 * - Quero ler: datas de início e conclusão são ignoradas.
 * - Datas não podem estar no futuro; conclusão não pode ser antes do início.
 */
export function validateBookForm(values, now = new Date(), { allowMissingTotal = false, allowMissingAuthor = false } = {}) {
  const errors = {};
  const title = String(values.title ?? '').trim();
  const author = String(values.author ?? '').trim();
  const description = String(values.description ?? '').trim();
  const coverUrl = String(values.coverUrl ?? '').trim();
  const status = values.status;
  // Livro com dados importados sem total/autor (não estavam nas anotações):
  // a edição pode manter esses campos em branco — nada é inventado.
  const totalText = String(values.totalPages ?? '').trim();
  const totalPages = allowMissingTotal && totalText === '' ? null : parseInteger(values.totalPages);
  let currentPage = values.currentPage === '' || values.currentPage === undefined ? 0 : parseInteger(values.currentPage);

  if (!title) errors.title = 'Informe o título do livro.';
  else if (title.length > LIMITS.title) errors.title = `Use no máximo ${LIMITS.title} caracteres.`;

  if (!author && !allowMissingAuthor) errors.author = 'Informe o autor.';
  else if (author.length > LIMITS.author) errors.author = `Use no máximo ${LIMITS.author} caracteres.`;

  if (!BOOK_STATUSES.includes(status)) errors.status = 'Escolha um status.';

  if (totalPages === null) {
    /* total não informado (permitido só nesse caso) */
  } else if (Number.isNaN(totalPages) || totalPages < 1) errors.totalPages = 'Informe um número inteiro de páginas maior que zero.';
  else if (totalPages > LIMITS.maxPages) errors.totalPages = `O máximo é ${LIMITS.maxPages.toLocaleString('pt-BR')} páginas.`;

  if (status === 'finished' && !errors.totalPages && totalPages !== null) currentPage = totalPages;
  if (Number.isNaN(currentPage)) errors.currentPage = 'Informe um número inteiro (0 se ainda não começou).';
  else if (!errors.totalPages && totalPages !== null && currentPage > totalPages)
    errors.currentPage = `A página atual não pode passar de ${totalPages}.`;

  // Página inicial da leitura (opcional): página impressa em que o conteúdo começa.
  const startText = String(values.contentStartPage ?? '').trim();
  const contentStartPage = startText === '' ? null : parseInteger(startText);
  if (contentStartPage !== null) {
    if (Number.isNaN(contentStartPage) || contentStartPage < 1) errors.contentStartPage = 'Use um número inteiro a partir de 1, ou deixe em branco.';
    else if (!errors.totalPages && totalPages !== null && contentStartPage > totalPages)
      errors.contentStartPage = `A página inicial não pode passar do total (${totalPages}).`;
  }

  if (!isValidCoverUrl(coverUrl)) errors.coverUrl = 'Use um endereço que comece com http:// ou https://.';
  if (description.length > LIMITS.description) errors.description = `Use no máximo ${LIMITS.description} caracteres.`;

  // Comentário final (opcional): avaliação, opinião e aprendizados.
  const finalReview = validateFinalReview(values);
  Object.assign(errors, finalReview.errors);

  let startedAt = null;
  let finishedAt = null;
  if (status !== 'want-to-read') {
    if (values.startedAt) {
      startedAt = fromInputDate(values.startedAt);
      if (!startedAt) errors.startedAt = 'Data inválida.';
      else if (isAfterToday(startedAt, now)) errors.startedAt = 'A data de início não pode estar no futuro.';
    }
    if (status === 'finished') {
      finishedAt = values.finishedAt ? fromInputDate(values.finishedAt) : null;
      if (!values.finishedAt) errors.finishedAt = 'Informe quando você terminou o livro.';
      else if (!finishedAt) errors.finishedAt = 'Data inválida.';
      else if (isAfterToday(finishedAt, now)) errors.finishedAt = 'A data de conclusão não pode estar no futuro.';
      else if (startedAt && finishedAt < startedAt)
        errors.finishedAt = 'A conclusão não pode ser antes do início.';
    }
  }

  return result(errors, {
    title,
    author,
    description,
    coverUrl,
    status,
    totalPages,
    currentPage,
    startedAt: startedAt ? startedAt.toISOString() : null,
    finishedAt: finishedAt ? finishedAt.toISOString() : null,
    contentStartPage: Number.isInteger(contentStartPage) ? contentStartPage : null,
    ...finalReview.data,
  });
}

/**
 * Comentário final de um livro — tudo opcional:
 * - rating: vazio = sem nota; senão inteiro de 1 a 5;
 * - review: "O que achei do livro";
 * - learnings: "O que aprendi ou levo desta leitura".
 */
export function validateFinalReview(values) {
  const errors = {};
  const ratingText = String(values.rating ?? '').trim();
  const rating = ratingText === '' ? null : parseInteger(ratingText);
  if (rating !== null && (Number.isNaN(rating) || rating < 1 || rating > 5)) errors.rating = 'Escolha uma nota de 1 a 5.';
  const review = String(values.review ?? '').trim();
  if (review.length > LIMITS.review) errors.review = `Use no máximo ${LIMITS.review} caracteres.`;
  const learnings = String(values.learnings ?? '').trim();
  if (learnings.length > LIMITS.learnings) errors.learnings = `Use no máximo ${LIMITS.learnings} caracteres.`;
  return result(errors, { rating: Number.isInteger(rating) ? rating : null, review, learnings });
}

/**
 * Edição de uma sessão já salva.
 * - páginas: mesma regra do registro (0 ≤ inicial < final ≤ total);
 * - duração: em minutos, de 1 até o tempo medido pelo cronômetro
 *   (nunca maior: não inventamos tempo). Se o valor não mudar, os segundos
 *   exatos são mantidos;
 * - observação: opcional (vazia remove a observação, não a sessão).
 * Data e horários vêm do cronômetro e não são editáveis.
 */
export function validateSessionEdit(values, { book, session, measuredSeconds }) {
  const errors = {};
  // Total não informado (livro importado): sem limite superior de página.
  const total = book?.totalPages ?? Infinity;
  const startPage = parseInteger(values.startPage);
  const endPage = parseInteger(values.endPage);
  const notes = String(values.notes ?? '').trim();

  if (Number.isNaN(startPage)) errors.startPage = 'Informe a página inicial (0 para o início).';
  else if (startPage > total) errors.startPage = `O livro tem ${total} páginas.`;
  if (Number.isNaN(endPage)) errors.endPage = 'Informe a página final.';
  else if (endPage > total) errors.endPage = `O livro tem ${total} páginas.`;
  else if (!errors.startPage && endPage <= startPage) errors.endPage = 'A página final precisa ser maior que a inicial.';

  const originalMinutes = Math.max(1, Math.round(session.durationSeconds / 60));
  const maxMinutes = Math.max(1, Math.ceil(measuredSeconds / 60));
  const minutes = parseInteger(values.durationMinutes);
  let durationSeconds = session.durationSeconds;
  if (Number.isNaN(minutes) || minutes < 1) errors.durationMinutes = 'Informe ao menos 1 minuto.';
  else if (minutes > maxMinutes) errors.durationMinutes = `O cronômetro mediu ${maxMinutes} min; a duração não pode ser maior.`;
  else if (minutes !== originalMinutes) durationSeconds = Math.min(measuredSeconds, minutes * 60);

  if (notes.length > LIMITS.notes) errors.notes = `Use no máximo ${LIMITS.notes} caracteres.`;

  return result(errors, {
    startPage,
    endPage,
    pagesRead: Number.isNaN(startPage) || Number.isNaN(endPage) ? 0 : Math.max(0, endPage - startPage),
    durationSeconds,
    notes,
  });
}

/**
 * Formulário de finalização de sessão.
 * Convenção de páginas (marcador): veja utils/sessions.js.
 * - página inicial: 0 até o total de páginas;
 * - página final: maior que a inicial e até o total de páginas;
 * - duração: medida pelo cronômetro; pode ser reduzida (se o usuário
 *   esqueceu o cronômetro ligado), nunca aumentada.
 */
export function validateSessionForm(values, { book, measuredSeconds }) {
  const errors = {};
  // Total não informado (livro importado): sem limite superior de página.
  const total = book?.totalPages ?? Infinity;
  const startPage = parseInteger(values.startPage);
  const endPage = parseInteger(values.endPage);
  const notes = String(values.notes ?? '').trim();

  if (Number.isNaN(startPage)) errors.startPage = 'Informe a página em que você começou (0 para o início).';
  else if (startPage > total) errors.startPage = `O livro tem ${total} páginas.`;

  if (Number.isNaN(endPage)) errors.endPage = 'Informe a página em que você parou.';
  else if (endPage > total) errors.endPage = `O livro tem ${total} páginas.`;
  else if (!errors.startPage && endPage <= startPage) errors.endPage = 'A página final precisa ser maior que a inicial.';

  let durationSeconds = Math.floor(measuredSeconds || 0);
  const maxMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
  if (values.durationEdited) {
    const minutes = parseInteger(values.durationMinutes);
    if (Number.isNaN(minutes) || minutes < 1) errors.durationMinutes = 'Informe ao menos 1 minuto.';
    else if (minutes > maxMinutes)
      errors.durationMinutes = `O cronômetro marcou ${maxMinutes} min; a duração não pode ser maior.`;
    // Nunca aumenta o tempo medido: se o usuário digitar o próprio valor
    // arredondado para cima, mantemos os segundos exatos do cronômetro.
    else durationSeconds = Math.min(durationSeconds, minutes * 60);
  }
  if (!errors.durationMinutes) {
    if (durationSeconds < 1) errors.durationMinutes = 'O cronômetro não registrou tempo de leitura.';
    else if (durationSeconds > MAX_SESSION_SECONDS)
      errors.durationMinutes = 'Uma sessão pode ter no máximo 24 horas. Ajuste a duração.';
  }

  if (notes.length > LIMITS.notes) errors.notes = `Use no máximo ${LIMITS.notes} caracteres.`;

  return result(errors, {
    startPage,
    endPage,
    pagesRead: Number.isNaN(startPage) || Number.isNaN(endPage) ? 0 : Math.max(0, endPage - startPage),
    durationSeconds,
    notes,
    markFinished: Boolean(values.markFinished) && endPage === total,
  });
}

/**
 * Livro lido ANTES de usar o ReadTrack ("Adicionar livro já concluído").
 * Só o título é obrigatório. Total de páginas e data de conclusão são
 * opcionais: se ficarem vazios, nada é inventado (ficam "não informados").
 */
export function validatePastBookForm(values, now = new Date()) {
  const errors = {};
  const title = String(values.title ?? '').trim();
  const author = String(values.author ?? '').trim();
  const pagesText = String(values.totalPages ?? '').trim();
  const totalPages = pagesText === '' ? null : parseInteger(pagesText);
  let finishedAt = null;

  if (!title) errors.title = 'Informe o título do livro.';
  else if (title.length > LIMITS.title) errors.title = `Use no máximo ${LIMITS.title} caracteres.`;
  if (author.length > LIMITS.author) errors.author = `Use no máximo ${LIMITS.author} caracteres.`;

  if (totalPages !== null && (Number.isNaN(totalPages) || totalPages < 1)) {
    errors.totalPages = 'Use um número inteiro maior que zero, ou deixe em branco.';
  } else if (totalPages !== null && totalPages > LIMITS.maxPages) {
    errors.totalPages = `O máximo é ${LIMITS.maxPages.toLocaleString('pt-BR')} páginas.`;
  }

  if (values.finishedAt) {
    finishedAt = fromInputDate(values.finishedAt);
    if (!finishedAt) errors.finishedAt = 'Data inválida.';
    else if (isAfterToday(finishedAt, now)) errors.finishedAt = 'A data de conclusão não pode estar no futuro.';
  }

  const review = validateFinalReview(values);
  Object.assign(errors, review.errors);

  return result(errors, {
    title,
    author,
    totalPages: Number.isInteger(totalPages) ? totalPages : null,
    finishedAt: finishedAt ? finishedAt.toISOString() : null,
    ...review.data,
  });
}

/* ---------- Vocabulário da sessão ---------- */

/**
 * Texto "uma palavra por linha" → [{ term, meaning }].
 * Cada linha: "Termo: significado" (separado pelo primeiro ":"). Linha sem
 * ":" vira só o termo. O texto de cada parte é mantido como digitado.
 */
export function parseVocabularyText(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(':');
      if (index === -1) return { term: line, meaning: '' };
      return { term: line.slice(0, index).trim(), meaning: line.slice(index + 1).trim() };
    })
    .filter((item) => item.term);
}

export function formatVocabularyText(vocabulary) {
  return (Array.isArray(vocabulary) ? vocabulary : []).map((v) => (v.meaning ? `${v.term}: ${v.meaning}` : v.term)).join('\n');
}

export function validateVocabulary(vocabulary) {
  if (vocabulary.length > LIMITS.vocabularyEntries) return `Use no máximo ${LIMITS.vocabularyEntries} palavras por sessão.`;
  const long = vocabulary.find((v) => v.term.length > LIMITS.vocabularyTerm || v.meaning.length > LIMITS.vocabularyMeaning);
  if (long) return `“${long.term.slice(0, 30)}”: termo até ${LIMITS.vocabularyTerm} e significado até ${LIMITS.vocabularyMeaning} caracteres.`;
  return null;
}

/* ---------- Sessão registrada manualmente ---------- */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "AAAA-MM-DD" + "HH:MM" → Date no horário local (ou null). */
export function combineLocalDateTime(dateText, timeText) {
  if (!DATE_PATTERN.test(dateText ?? '') || !TIME_PATTERN.test(timeText ?? '')) return null;
  const [y, m, d] = dateText.split('-').map(Number);
  const [h, min] = timeText.split(':').map(Number);
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** Mesma sessão já registrada? (mesmo livro, mesmo início e mesmas páginas) */
export function isSameSessionRecord(a, b) {
  return (
    a.bookId === b.bookId &&
    new Date(a.startedAt).getTime() === new Date(b.startedAt).getTime() &&
    a.startPage === b.startPage &&
    a.endPage === b.endPage
  );
}

/**
 * Formulário de sessão manual. Páginas são números IMPRESSOS, da primeira à
 * última lida (inclusive). Término e duração são opcionais; quando a leitura
 * passa da meia-noite, a data de término precisa ser informada — nunca é
 * deduzida só porque o horário final é menor que o inicial.
 */
export function validateManualSession(values, { book, sessions = [], editingId = null, now = new Date() }) {
  const errors = {};
  const notes = String(values.notes ?? '').trim();
  const vocabulary = parseVocabularyText(values.vocabularyText);

  if (!book) errors.bookId = 'Escolha o livro desta sessão.';
  else if (book.addedAsRead) errors.bookId = 'Livros marcados como lidos antes do ReadTrack não recebem sessões.';

  const startedAt = combineLocalDateTime(values.startDate, values.startTime);
  if (!values.startDate) errors.startDate = 'Informe a data em que a leitura começou.';
  else if (!DATE_PATTERN.test(values.startDate)) errors.startDate = 'Data inválida.';
  if (!values.startTime) errors.startTime = 'Informe o horário de início.';
  else if (!TIME_PATTERN.test(values.startTime)) errors.startTime = 'Use o formato HH:MM.';
  if (startedAt && startedAt > now) errors.startDate = 'A sessão não pode começar no futuro.';

  let finishedAt = null;
  const endDate = values.endDate || values.startDate;
  if (values.endTime) {
    if (!TIME_PATTERN.test(values.endTime)) errors.endTime = 'Use o formato HH:MM.';
    else if (!DATE_PATTERN.test(endDate ?? '')) errors.endDate = 'Data inválida.';
    else if (startedAt) {
      finishedAt = combineLocalDateTime(endDate, values.endTime);
      if (!finishedAt) errors.endDate = 'Data inválida.';
      else if (finishedAt <= startedAt) {
        errors.endTime =
          endDate === values.startDate && values.endTime < values.startTime
            ? `O término (${values.endTime}) é antes do início (${values.startTime}) no mesmo dia. Se a leitura passou da meia-noite, informe o dia seguinte na data de término.`
            : 'O término precisa ser depois do início.';
      } else if (calculateElapsedSeconds(startedAt, finishedAt) > MAX_RECORDED_SECONDS) {
        errors.endDate = 'Uma sessão pode ter no máximo 24 horas. Confira as datas.';
      } else if (finishedAt > now) {
        errors.endTime = 'O término não pode estar no futuro.';
      }
    }
  } else if (values.endDate && values.endDate !== values.startDate) {
    errors.endTime = 'Informe o horário de término (ou deixe a data igual à de início).';
  }

  const startPage = parseInteger(values.startPage);
  const endPage = parseInteger(values.endPage);
  const total = book?.totalPages ?? null;
  if (Number.isNaN(startPage) || startPage < 1) errors.startPage = 'Informe a primeira página lida (número impresso, a partir de 1).';
  else if (total && startPage > total) errors.startPage = `O livro tem ${total} páginas.`;
  if (Number.isNaN(endPage) || endPage < 1) errors.endPage = 'Informe a última página lida.';
  else if (total && endPage > total) errors.endPage = `O livro tem ${total} páginas.`;
  else if (!errors.startPage && endPage < startPage) errors.endPage = 'A última página não pode ser menor que a primeira.';

  const duration = parseDurationText(values.duration);
  if (duration.error) errors.duration = duration.error;
  else if (duration.seconds !== null && duration.seconds <= 0) errors.duration = 'A duração precisa ser maior que zero (ou deixe em branco).';
  else if (duration.seconds !== null && duration.seconds > MAX_RECORDED_SECONDS) errors.duration = 'Uma sessão pode ter no máximo 24 horas.';

  if (notes.length > LIMITS.notes) errors.notes = `Use no máximo ${LIMITS.notes} caracteres.`;
  const vocabularyError = validateVocabulary(vocabulary);
  if (vocabularyError) errors.vocabularyText = vocabularyError;

  const data = {
    bookId: book?.id ?? null,
    startedAt: startedAt ? startedAt.toISOString() : null,
    finishedAt: finishedAt ? finishedAt.toISOString() : null,
    startPage,
    endPage,
    pagesRead: Number.isNaN(startPage) || Number.isNaN(endPage) ? 0 : Math.max(0, endPage - startPage + 1),
    durationSeconds: duration.seconds ?? null,
    notes,
    vocabulary,
  };

  if (Object.keys(errors).length === 0 && sessions.some((s) => s.id !== editingId && isSameSessionRecord(s, data))) {
    errors.form = 'Já existe uma sessão deste livro com o mesmo início e as mesmas páginas. Nada foi salvo para não duplicar.';
  }
  return result(errors, data);
}
