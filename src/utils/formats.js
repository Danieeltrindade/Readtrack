/**
 * Formatos de leitura — funções puras.
 *
 * Cada livro tem um formato:
 * - print:   livro físico (papel). Progresso pela página.
 * - digital: e-book ou PDF. Progresso pela página (PDF, e-reader com
 *            numeração) OU pela porcentagem (Kindle e afins).
 * - audio:   audiobook. Progresso pela posição no áudio (segundos).
 *
 * O "tipo de progresso" (progressKind) diz como uma sessão mede o avanço:
 * - pages:   página inicial/final (regras de utils/pages.js);
 * - percent: porcentagem inicial/final (0–100);
 * - audio:   posição inicial/final no áudio, em segundos.
 *
 * Sessões em porcentagem ou áudio não têm páginas: startPage = endPage =
 * pagesRead = newPages = 0. Elas contam em tempo, sessões, sequência e
 * livros concluídos, mas NÃO nas metas e estatísticas de páginas — nenhuma
 * página é inventada a partir de porcentagem ou de tempo de áudio.
 */

export const BOOK_FORMATS = Object.freeze({ PRINT: 'print', DIGITAL: 'digital', AUDIO: 'audio' });
export const FORMAT_LIST = [BOOK_FORMATS.PRINT, BOOK_FORMATS.DIGITAL, BOOK_FORMATS.AUDIO];

export const FORMAT_LABELS = Object.freeze({
  print: 'Livro físico',
  digital: 'E-book ou PDF',
  audio: 'Audiobook',
});

/** Rótulos curtos (selos, filtros e gráficos). */
export const FORMAT_SHORT_LABELS = Object.freeze({
  print: 'Físico',
  digital: 'E-book/PDF',
  audio: 'Áudio',
});

/** Cores padrão de cada formato (podem ser trocadas nas Configurações). */
export const DEFAULT_FORMAT_COLORS = Object.freeze({
  print: '#FFB054',
  digital: '#5CC8FF',
  audio: '#FF6FA8',
});

export const PROGRESS_KINDS = Object.freeze({ PAGES: 'pages', PERCENT: 'percent', AUDIO: 'audio' });
export const PROGRESS_MODES = Object.freeze({ PAGES: 'pages', PERCENT: 'percent' });

export const AUDIO_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const MIN_AUDIO_SPEED = 0.5;
export const MAX_AUDIO_SPEED = 3;
/** Duração máxima de um audiobook: 100 horas. */
export const MAX_AUDIO_SECONDS = 100 * 60 * 60;

export function normalizeFormat(value) {
  return FORMAT_LIST.includes(value) ? value : BOOK_FORMATS.PRINT;
}

/** Como o progresso de um livro é medido. */
export function getProgressKind(book) {
  const format = normalizeFormat(book?.format);
  if (format === BOOK_FORMATS.AUDIO) return PROGRESS_KINDS.AUDIO;
  if (format === BOOK_FORMATS.DIGITAL && book?.progressMode === PROGRESS_MODES.PERCENT) return PROGRESS_KINDS.PERCENT;
  return PROGRESS_KINDS.PAGES;
}

export const isPageKind = (kind) => kind !== PROGRESS_KINDS.PERCENT && kind !== PROGRESS_KINDS.AUDIO;

/** Tipo de progresso de uma sessão (sessões antigas: páginas). */
export function getSessionKind(session) {
  const kind = session?.progressKind;
  return kind === PROGRESS_KINDS.PERCENT || kind === PROGRESS_KINDS.AUDIO ? kind : PROGRESS_KINDS.PAGES;
}

/* ---------- Posição no áudio ---------- */

/** 3725 → "1:02:05"; 125 → "2:05"; null → "". */
export function formatAudioPosition(seconds, { withHours = false } = {}) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 || withHours ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 3725 → "1 h 02 min"; 600 → "10 min". Para durações de audiobook. */
export function formatAudioLength(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '';
  const total = Math.round(Number(seconds) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

/**
 * Texto digitado → segundos.
 * Aceita "h:mm:ss", "mm:ss" e "mm" (só minutos). Vazio → null.
 * Devolve NaN quando o texto não é uma posição válida.
 */
export function parseAudioPosition(text) {
  const value = String(text ?? '').trim();
  if (value === '') return null;
  if (/^\d+$/.test(value)) return Number(value) * 60;
  const match = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match) return NaN;
  const [, a, b, c] = match;
  return c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c);
}

/** Horas + minutos (campos do formulário) → segundos; vazio → null; inválido → NaN. */
export function parseHoursMinutes(hoursText, minutesText) {
  const h = String(hoursText ?? '').trim();
  const m = String(minutesText ?? '').trim();
  if (h === '' && m === '') return null;
  if ((h !== '' && !/^\d+$/.test(h)) || (m !== '' && !/^\d+$/.test(m))) return NaN;
  const minutes = Number(m || 0);
  if (minutes > 59 && h !== '') return NaN;
  return Number(h || 0) * 3600 + minutes * 60;
}

export function splitHoursMinutes(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return { hours: '', minutes: '' };
  const total = Math.round(Number(seconds) / 60);
  return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
}

export function normalizeSpeed(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return null;
  if (n < MIN_AUDIO_SPEED || n > MAX_AUDIO_SPEED) return null;
  return Math.round(n * 100) / 100;
}

export function formatSpeed(speed) {
  const n = normalizeSpeed(speed);
  return n === null ? '' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;
}

/* ---------- Progresso do livro por formato ---------- */

/**
 * Percentual (0–100) de livros em porcentagem ou áudio. Para páginas,
 * devolve null: quem chama usa a regra de páginas (utils/stats.js).
 */
export function getNonPageProgress(book) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return clampPercent(book.progressPercent);
  if (kind === PROGRESS_KINDS.AUDIO) {
    const total = Number(book.audioDurationSeconds);
    if (!total) return 0;
    return clampPercent(Math.round((Math.min(total, Number(book.audioPositionSeconds) || 0) / total) * 100));
  }
  return null;
}

export function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Posição atual do livro no tipo de progresso dele (página, % ou segundos). */
export function getBookPosition(book) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return clampPercent(book.progressPercent);
  if (kind === PROGRESS_KINDS.AUDIO) return Math.max(0, Number(book.audioPositionSeconds) || 0);
  return Math.max(0, Number(book.currentPage) || 0);
}

/** Texto curto do progresso: "p. 120 de 320", "45%", "2:10:00 de 9:30:00". */
export function describeBookPosition(book) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return `${clampPercent(book.progressPercent)}%`;
  if (kind === PROGRESS_KINDS.AUDIO) {
    // Com áudio de 1 hora ou mais, a posição também mostra as horas (0:10:00 de 2:00:00).
    const pos = formatAudioPosition(book.audioPositionSeconds || 0, { withHours: book.audioDurationSeconds >= 3600 });
    return book.audioDurationSeconds ? `${pos} de ${formatAudioPosition(book.audioDurationSeconds)}` : pos;
  }
  return book.totalPages ? `p. ${book.currentPage} de ${book.totalPages}` : `p. ${book.currentPage}`;
}

/** Quanto falta: "180 páginas", "55%", "7 h 20 min". */
export function describeRemaining(book) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return `faltam ${100 - clampPercent(book.progressPercent)}%`;
  if (kind === PROGRESS_KINDS.AUDIO) {
    if (!book.audioDurationSeconds) return '';
    const left = Math.max(0, book.audioDurationSeconds - (book.audioPositionSeconds || 0));
    return left ? `faltam ${formatAudioLength(left)}` : '';
  }
  if (!book.totalPages) return '';
  const left = Math.max(0, book.totalPages - book.currentPage);
  return left ? `faltam ${left} ${left === 1 ? 'página' : 'páginas'}` : '';
}

/** Rótulo do avanço de uma sessão: "+22 p.", "+8%", "+40 min de áudio". */
export function describeSessionProgress(session) {
  const kind = getSessionKind(session);
  if (kind === PROGRESS_KINDS.PERCENT) {
    const delta = Math.max(0, (session.endPercent ?? 0) - (session.startPercent ?? 0));
    return `${session.startPercent ?? 0}% → ${session.endPercent ?? 0}% (+${delta}%)`;
  }
  if (kind === PROGRESS_KINDS.AUDIO) {
    return `${formatAudioPosition(session.startPositionSeconds ?? 0)} → ${formatAudioPosition(session.endPositionSeconds ?? 0)}`;
  }
  return null;
}

/**
 * Avanço de uma sessão de porcentagem/áudio aplicado ao livro: a posição
 * nunca recua (como o marcador de páginas).
 */
export function applyKindProgress(book, session) {
  const kind = getSessionKind(session);
  if (kind === PROGRESS_KINDS.PERCENT && getProgressKind(book) === PROGRESS_KINDS.PERCENT) {
    return { ...book, progressPercent: Math.max(clampPercent(book.progressPercent), clampPercent(session.endPercent)) };
  }
  if (kind === PROGRESS_KINDS.AUDIO && getProgressKind(book) === PROGRESS_KINDS.AUDIO) {
    const end = Math.max(0, Number(session.endPositionSeconds) || 0);
    const cap = book.audioDurationSeconds ? Math.min(book.audioDurationSeconds, end) : end;
    return { ...book, audioPositionSeconds: Math.max(Number(book.audioPositionSeconds) || 0, cap) };
  }
  return book;
}

/** Maior posição alcançada nas sessões (para edição/exclusão). */
export function maxSessionPosition(sessions, kind) {
  const values = sessions
    .filter((s) => getSessionKind(s) === kind)
    .map((s) => (kind === PROGRESS_KINDS.PERCENT ? clampPercent(s.endPercent) : Math.max(0, Number(s.endPositionSeconds) || 0)));
  return values.length ? Math.max(...values) : 0;
}

/** Posição antes da sessão (início dela). */
export function sessionStartPosition(session) {
  const kind = getSessionKind(session);
  if (kind === PROGRESS_KINDS.PERCENT) return clampPercent(session.startPercent);
  if (kind === PROGRESS_KINDS.AUDIO) return Math.max(0, Number(session.startPositionSeconds) || 0);
  return 0;
}

/** O livro chegou ao fim pela posição informada? */
export function reachesEnd(book, { endPage, endPercent, endPositionSeconds }) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return endPercent === 100;
  if (kind === PROGRESS_KINDS.AUDIO) return Boolean(book.audioDurationSeconds) && endPositionSeconds >= book.audioDurationSeconds;
  return Boolean(book.totalPages) && endPage === book.totalPages;
}

/** Ao concluir um livro, a posição vai para o fim (100% / fim do áudio). */
export function withFinishedPosition(book) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return { ...book, progressPercent: 100 };
  if (kind === PROGRESS_KINDS.AUDIO && book.audioDurationSeconds) return { ...book, audioPositionSeconds: book.audioDurationSeconds };
  return book;
}

/** Tempo de leitura (segundos) por formato, a partir das sessões. */
export function sumSecondsByFormat(sessions, books) {
  const formatOf = new Map(books.map((b) => [b.id, normalizeFormat(b.format)]));
  const out = { print: 0, digital: 0, audio: 0 };
  for (const s of sessions) {
    const format = formatOf.get(s.bookId) ?? BOOK_FORMATS.PRINT;
    out[format] += Number(s.durationSeconds) || 0;
  }
  return out;
}

export function normalizeFormatColors(value) {
  const out = { ...DEFAULT_FORMAT_COLORS };
  if (value && typeof value === 'object') {
    for (const key of FORMAT_LIST) {
      if (typeof value[key] === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value[key])) out[key] = value[key].toUpperCase();
    }
  }
  return out;
}

/** Dá para mostrar uma barra de progresso? (páginas: precisa do total; áudio: da duração) */
export function hasMeasurableProgress(book) {
  const kind = getProgressKind(book);
  if (kind === PROGRESS_KINDS.PERCENT) return true;
  if (kind === PROGRESS_KINDS.AUDIO) return Boolean(book.audioDurationSeconds);
  return Boolean(book.totalPages);
}

/** Já começou? (página, porcentagem ou posição no áudio maior que zero) */
export const hasStarted = (book) => getBookPosition(book) > 0;
