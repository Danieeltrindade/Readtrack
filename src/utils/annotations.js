/**
 * Caderno de anotações — funções puras.
 *
 * Cada sessão pode ter, além do resumo (`notes`) e do vocabulário
 * (`vocabulary`), uma lista de anotações (`annotations`):
 *   { id, type: 'quote' | 'idea' | 'question', text, note, anchor, resolved, createdAt }
 * - quote:    citação (trecho do livro) + comentário opcional;
 * - idea:     ideia, interpretação ou ligação;
 * - question: dúvida — pode ser marcada como resolvida no Caderno.
 * `anchor` diz onde a anotação foi feita: { kind: 'page' | 'percent' | 'time', value }.
 * As palavras do vocabulário também podem ter uma âncora.
 *
 * O Caderno (página) junta tudo de todas as sessões numa lista só.
 */
import { formatAudioPosition, parseAudioPosition, PROGRESS_KINDS } from './formats.js';

const parseInteger = (value) => (/^\s*\d+\s*$/.test(String(value ?? '')) ? Number(String(value).trim()) : NaN);

export const ANNOTATION_TYPES = Object.freeze({ QUOTE: 'quote', IDEA: 'idea', QUESTION: 'question' });
export const ANNOTATION_TYPE_LIST = ['quote', 'idea', 'question'];

/** Abas do caderno da sessão, na ordem em que aparecem. */
export const NOTEBOOK_TABS = ['summary', 'quote', 'word', 'idea', 'question'];

export const NOTEBOOK_LABELS = Object.freeze({
  summary: 'Resumo',
  quote: 'Citações',
  word: 'Vocabulário',
  idea: 'Ideias',
  question: 'Dúvidas',
});

export const NOTEBOOK_SINGULAR = Object.freeze({
  summary: 'Resumo',
  quote: 'Citação',
  word: 'Palavra',
  idea: 'Ideia',
  question: 'Dúvida',
});

export const ANNOTATION_LIMITS = Object.freeze({ perSession: 200, text: 1000, note: 500 });

export const ANCHOR_KINDS = Object.freeze({ PAGE: 'page', PERCENT: 'percent', TIME: 'time' });

/** Tipo de âncora que combina com o progresso do livro. */
export function anchorKindFor(progressKind) {
  if (progressKind === PROGRESS_KINDS.AUDIO) return ANCHOR_KINDS.TIME;
  if (progressKind === PROGRESS_KINDS.PERCENT) return ANCHOR_KINDS.PERCENT;
  return ANCHOR_KINDS.PAGE;
}

export function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return null;
  const value = Number(anchor.value);
  if (!Number.isFinite(value) || value < 0) return null;
  if (anchor.kind === ANCHOR_KINDS.PAGE) return value >= 1 && value <= 20000 ? { kind: 'page', value: Math.round(value) } : null;
  if (anchor.kind === ANCHOR_KINDS.PERCENT) return value <= 100 ? { kind: 'percent', value: Math.round(value) } : null;
  if (anchor.kind === ANCHOR_KINDS.TIME) return value <= 360000 ? { kind: 'time', value: Math.round(value) } : null;
  return null;
}

/** "p. 124", "45%", "1:02:11". */
export function formatAnchor(anchor) {
  const a = normalizeAnchor(anchor);
  if (!a) return '';
  if (a.kind === 'page') return `p. ${a.value}`;
  if (a.kind === 'percent') return `${a.value}%`;
  return formatAudioPosition(a.value);
}

/** Texto do campo de âncora → âncora. Vazio → { anchor: null }. */
export function parseAnchorText(text, kind) {
  const value = String(text ?? '').trim().replace(/^p\.?\s*/i, '').replace(/%$/, '');
  if (value === '') return { anchor: null };
  if (kind === ANCHOR_KINDS.TIME) {
    const seconds = parseAudioPosition(value);
    if (Number.isNaN(seconds) || seconds === null) return { error: 'Use h:mm:ss ou mm:ss (ex.: 1:02:30).' };
    return { anchor: { kind, value: seconds } };
  }
  const n = parseInteger(value);
  if (kind === ANCHOR_KINDS.PERCENT) {
    if (Number.isNaN(n) || n > 100) return { error: 'Use uma porcentagem de 0 a 100.' };
    return { anchor: { kind, value: n } };
  }
  if (Number.isNaN(n) || n < 1) return { error: 'Use o número da página (a partir de 1).' };
  return { anchor: { kind: ANCHOR_KINDS.PAGE, value: n } };
}

export function anchorToText(anchor) {
  const a = normalizeAnchor(anchor);
  if (!a) return '';
  return a.kind === 'time' ? formatAudioPosition(a.value) : String(a.value);
}

const isString = (v) => typeof v === 'string';

export function normalizeAnnotation(item) {
  if (!item || typeof item !== 'object') return null;
  if (!ANNOTATION_TYPE_LIST.includes(item.type)) return null;
  const text = isString(item.text) ? item.text.trim() : '';
  if (!text) return null;
  const out = {
    id: isString(item.id) && item.id ? item.id.slice(0, 100) : `note_${hash(text)}`,
    type: item.type,
    text: text.slice(0, ANNOTATION_LIMITS.text),
    note: isString(item.note) ? item.note.trim().slice(0, ANNOTATION_LIMITS.note) : '',
    anchor: normalizeAnchor(item.anchor),
    createdAt: isString(item.createdAt) && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : null,
  };
  if (item.type === ANNOTATION_TYPES.QUESTION) out.resolved = Boolean(item.resolved);
  return out;
}

export function normalizeAnnotations(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const a = normalizeAnnotation(raw);
    if (!a) continue;
    let id = a.id;
    let n = 1;
    while (seen.has(id)) id = `${a.id}_${(n += 1)}`;
    seen.add(id);
    out.push({ ...a, id });
  }
  return out;
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Confere as anotações já montadas (as telas montam uma a uma). */
export function validateAnnotations(items) {
  if (!Array.isArray(items)) return null;
  if (items.length > ANNOTATION_LIMITS.perSession) return `Use no máximo ${ANNOTATION_LIMITS.perSession} anotações por sessão.`;
  const long = items.find((a) => String(a.text ?? '').length > ANNOTATION_LIMITS.text || String(a.note ?? '').length > ANNOTATION_LIMITS.note);
  if (long) return `Cada anotação pode ter até ${ANNOTATION_LIMITS.text} caracteres (comentário até ${ANNOTATION_LIMITS.note}).`;
  return null;
}

/**
 * Rascunho do formulário de uma anotação → item pronto.
 * type: summary não passa por aqui (é o campo de resumo da sessão).
 */
export function buildNotebookEntry(type, { text, extra, anchorText }, { anchorKind, id, now = new Date() }) {
  const main = String(text ?? '').trim();
  const second = String(extra ?? '').trim();
  if (!main) return { error: type === 'word' ? 'Escreva a palavra.' : 'Escreva a anotação.' };
  const parsed = parseAnchorText(anchorText, anchorKind);
  if (parsed.error) return { error: parsed.error, field: 'anchor' };
  if (type === 'word') {
    if (main.length > 120) return { error: 'A palavra pode ter até 120 caracteres.' };
    if (second.length > 1000) return { error: 'O significado pode ter até 1000 caracteres.' };
    const item = { term: main, meaning: second };
    if (parsed.anchor) item.anchor = parsed.anchor;
    return { item };
  }
  if (!ANNOTATION_TYPE_LIST.includes(type)) return { error: 'Tipo de anotação desconhecido.' };
  if (main.length > ANNOTATION_LIMITS.text) return { error: `Use no máximo ${ANNOTATION_LIMITS.text} caracteres.` };
  if (second.length > ANNOTATION_LIMITS.note) return { error: `O comentário pode ter até ${ANNOTATION_LIMITS.note} caracteres.` };
  const item = { id, type, text: main, note: type === 'quote' ? second : '', anchor: parsed.anchor, createdAt: new Date(now).toISOString() };
  if (type === 'question') item.resolved = false;
  return { item };
}

/** Quantas anotações uma sessão tem (resumo conta 1 se existir). */
export function countSessionNotes(session) {
  return (
    (session.notes ? 1 : 0) +
    (Array.isArray(session.vocabulary) ? session.vocabulary.length : 0) +
    (Array.isArray(session.annotations) ? session.annotations.length : 0)
  );
}

/**
 * Todas as anotações (de todas as sessões) numa lista para o Caderno,
 * da mais recente para a mais antiga.
 */
export function collectNotebook({ books, sessions }) {
  const bookById = new Map(books.map((b) => [b.id, b]));
  const entries = [];
  for (const s of sessions) {
    const book = bookById.get(s.bookId);
    if (!book) continue;
    const base = { sessionId: s.id, bookId: s.bookId, book, date: s.startedAt };
    if (s.notes) entries.push({ ...base, key: `${s.id}:summary`, type: 'summary', text: s.notes, note: '', anchor: sessionAnchor(s) });
    (s.vocabulary ?? []).forEach((v, i) =>
      entries.push({ ...base, key: `${s.id}:word:${i}`, index: i, type: 'word', text: v.term, note: v.meaning ?? '', anchor: v.anchor ?? null }),
    );
    for (const a of s.annotations ?? []) {
      entries.push({ ...base, key: `${s.id}:${a.id}`, annotationId: a.id, type: a.type, text: a.text, note: a.note ?? '', anchor: a.anchor, resolved: Boolean(a.resolved) });
    }
  }
  return entries.sort((a, b) => new Date(b.date) - new Date(a.date) || a.key.localeCompare(b.key));
}

/** Âncora do resumo: o trecho da sessão ("p. 118–140") — só texto. */
function sessionAnchor(session) {
  if (session.progressKind === 'audio') return null;
  if (session.progressKind === 'percent') return null;
  if (session.endPage > 0) return { kind: 'page-range', from: session.startPage, to: session.endPage };
  return null;
}

export function formatEntryAnchor(entry) {
  if (entry.anchor?.kind === 'page-range') {
    const { from, to } = entry.anchor;
    return from && from !== to ? `p. ${from}–${to}` : `p. ${to}`;
  }
  return formatAnchor(entry.anchor);
}

export function filterNotebook(entries, { type = 'all', bookId = 'all', query = '', onlyOpen = false } = {}) {
  const q = query.trim().toLocaleLowerCase('pt-BR');
  return entries.filter((e) => {
    if (type !== 'all' && e.type !== type) return false;
    if (bookId !== 'all' && e.bookId !== bookId) return false;
    if (onlyOpen && (e.type !== 'question' || e.resolved)) return false;
    if (q && !`${e.text} ${e.note} ${e.book.title}`.toLocaleLowerCase('pt-BR').includes(q)) return false;
    return true;
  });
}

export function countByType(entries) {
  const out = { all: entries.length, summary: 0, quote: 0, word: 0, idea: 0, question: 0, open: 0 };
  for (const e of entries) {
    out[e.type] += 1;
    if (e.type === 'question' && !e.resolved) out.open += 1;
  }
  return out;
}

/** Chave de uma palavra para agrupar: sem acentos, minúsculas e sem espaços sobrando. */
export function wordKey(term) {
  return String(term ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Junta as palavras anotadas mais de uma vez num cartão só. A entrada fica
 * na posição da anotação mais recente, com `history` (todas, da mais nova
 * para a mais antiga) e o significado mais recente que não esteja vazio.
 * Os outros tipos passam sem mudança. Nada é apagado: só a exibição muda.
 */
export function groupWordEntries(entries) {
  const groups = new Map();
  const out = [];
  for (const e of entries) {
    if (e.type !== 'word') {
      out.push(e);
      continue;
    }
    const k = wordKey(e.text);
    const group = groups.get(k);
    if (group) {
      group.history.push(e);
      if (!group.note && e.note) group.note = e.note;
      continue;
    }
    const first = { ...e, key: `word:${k}`, history: [e] };
    groups.set(k, first);
    out.push(first);
  }
  return out;
}

/** Palavras (já agrupadas) por letra inicial, em ordem alfabética. */
export function buildGlossary(entries) {
  const words = entries.filter((e) => e.type === 'word').sort((a, b) => a.text.localeCompare(b.text, 'pt-BR', { sensitivity: 'base' }));
  const letters = [];
  for (const w of words) {
    const letter = wordKey(w.text).charAt(0).toUpperCase() || '#';
    const key = /[A-Z]/.test(letter) ? letter : '#';
    let g = letters.at(-1);
    if (!g || g.letter !== key) letters.push((g = { letter: key, words: [] }));
    g.words.push(w);
  }
  return letters;
}

/** Marca/desmarca uma dúvida como resolvida. Devolve a sessão nova ou null. */
export function toggleQuestionResolved(session, annotationId) {
  const list = session.annotations ?? [];
  const target = list.find((a) => a.id === annotationId && a.type === 'question');
  if (!target) return null;
  return { ...session, annotations: list.map((a) => (a === target ? { ...a, resolved: !a.resolved } : a)) };
}

/** Remove uma anotação (ou palavra) de uma sessão. */
export function removeNotebookEntry(session, entry) {
  if (entry.type === 'summary') return { ...session, notes: '' };
  if (entry.type === 'word') return { ...session, vocabulary: (session.vocabulary ?? []).filter((_, i) => i !== entry.index) };
  return { ...session, annotations: (session.annotations ?? []).filter((a) => a.id !== entry.annotationId) };
}

/** Agrupa as anotações por livro, na ordem da anotação mais recente. */
export function groupNotebookByBook(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.bookId)) groups.set(e.bookId, { book: e.book, entries: [] });
    groups.get(e.bookId).entries.push(e);
  }
  return [...groups.values()];
}

/** Uma citação para "Relembre" (escolhida por um número, para ser estável). */
export function pickQuote(entries, seed = 0) {
  const quotes = entries.filter((e) => e.type === 'quote');
  if (quotes.length === 0) return null;
  return quotes[Math.abs(Math.floor(seed)) % quotes.length];
}

/** Caderno → Markdown (para exportar e guardar fora do site). */
export function notebookToMarkdown(entries, { title = 'Caderno — ReadTrack', now = new Date() } = {}) {
  const lines = [`# ${title}`, '', `Exportado em ${new Date(now).toLocaleDateString('pt-BR')}.`, ''];
  for (const group of groupNotebookByBook(entries)) {
    lines.push(`## ${group.book.title}${group.book.author ? ` — ${group.book.author}` : ''}`, '');
    for (const e of group.entries) {
      const anchor = formatEntryAnchor(e);
      const where = [new Date(e.date).toLocaleDateString('pt-BR'), anchor].filter(Boolean).join(' · ');
      const label = NOTEBOOK_SINGULAR[e.type];
      const body =
        e.type === 'quote'
          ? `> ${e.text.replace(/\n/g, '\n> ')}`
          : e.type === 'word'
            ? `**${e.text}**${e.note ? ` — ${e.note}` : ''}`
            : e.text;
      lines.push(`- **${label}** (${where})${e.type === 'question' ? (e.resolved ? ' ✓ resolvida' : ' · em aberto') : ''}`);
      lines.push(`  ${body.replace(/\n/g, '\n  ')}`);
      if (e.type === 'quote' && e.note) lines.push(`  _${e.note}_`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
