import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DataContext } from './DataContext.js';
import { ACTIONS, dataReducer } from './dataReducer.js';
import { createExportPayload, planBackupMerge } from '../services/storage/dataTransfer.js';
import { diffData } from '../services/sync/diff.js';
import { createLocalPersistence } from '../services/persistence/localPersistence.js';
import { useToast } from '../hooks/useToast.js';
import { buildLedger } from '../utils/ledger.js';
import { evaluateAchievements, findNewAchievements, findStaleAchievements } from '../utils/achievements.js';
import { validateGoalsForm } from '../utils/goals.js';
import { normalizeSettings } from '../utils/settings.js';
import { createId } from '../utils/id.js';
import { applyFinalReview, createBook, createPastBook, updateBook as applyBookUpdate, updatePastBook } from '../utils/books.js';
import { buildManualSession, buildSession, getMeasuredSeconds, getTimerStartPage } from '../utils/sessions.js';
import { isManualSession } from '../utils/pages.js';
import { createActiveSession, getElapsedSeconds } from '../utils/timer.js';
import {
  validateBookForm,
  validateFinalReview,
  validateManualSession,
  parseVocabularyText,
  validateVocabulary,
  validatePastBookForm,
  validateSessionEdit,
  validateSessionForm,
  BOOK_STATUSES,
} from '../utils/validation.js';

/** Usada quando nenhum `persistence` é informado (ex.: testes, modo local puro). */
let defaultPersistence = null;
const getDefaultPersistence = () => (defaultPersistence ??= createLocalPersistence());

const fail = (errors) => ({ ok: false, errors });

/**
 * Estado dos dados do app. ONDE os dados ficam é decidido pela
 * `persistence` recebida (localStorage ou Supabase); as ações, o reducer e
 * as telas são os mesmos nos dois casos.
 */
export function DataProvider({ children, persistence: persistenceProp }) {
  const [persistence] = useState(() => persistenceProp ?? getDefaultPersistence());
  const [boot] = useState(() => persistence.boot());
  const [data, dispatch] = useReducer(dataReducer, boot.data);
  const [storageMessage, setStorageMessage] = useState(boot.message);
  const [saveError, setSaveError] = useState(null);
  const skipNextSave = useRef(false);
  const toast = useToast();

  // As ações leem o estado mais recente por esta referência, sem precisar
  // ser recriadas a cada mudança (o que re-renderizaria toda a árvore).
  const stateRef = useRef(data);
  useLayoutEffect(() => {
    stateRef.current = data;
  }, [data]);

  // Ids de sessões já enviadas para salvar: impede gravação dupla por clique repetido.
  const completedIds = useRef(new Set());

  // Persiste a cada mudança. Falhas não derrubam o app: viram aviso.
  useEffect(() => {
    if (!boot.canPersist) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const result = persistence.save(data);
    setSaveError(result.ok ? null : result.error);
  }, [data, boot.canPersist, persistence]);

  // Dados alterados fora desta aba: outra aba (modo local) ou outro
  // dispositivo (modo conta, relido ao voltar para a aba).
  useEffect(() => {
    if (!boot.canPersist) return undefined;
    return persistence.subscribe((external) => {
      skipNextSave.current = true; // evita "pingue-pongue" entre abas
      dispatch({ type: ACTIONS.HYDRATE, payload: external });
    });
  }, [boot.canPersist, persistence]);

  // Livro-razão diário: calculado UMA vez por mudança nas sessões e
  // compartilhado por Dashboard, Estatísticas, Metas e Conquistas.
  const ledger = useMemo(() => buildLedger(data.sessions), [data.sessions]);

  // Conquistas: desbloqueio automático a partir dos dados reais.
  // O aviso só aparece para conquistas atingidas DEPOIS que a página abriu
  // (ex.: a sessão que você acabou de salvar). Abrir o site, importar ou
  // restaurar a demonstração não gera avisos de conquistas antigas.
  const openedAt = useRef(Date.now());
  const announced = useRef(new Set());
  // Ao adicionar, editar ou excluir sessões, tudo é recalculado: conquistas que
  // os registros já não sustentam saem da lista salva (exceto meta semanal).
  useEffect(() => {
    const evaluated = evaluateAchievements({
      books: data.books,
      sessions: data.sessions,
      stored: data.achievements,
      goals: data.goals,
      weekStartsOn: data.settings.weekStartsOn,
    });
    const fresh = findNewAchievements(evaluated, data.achievements);
    const stale = findStaleAchievements(evaluated, data.achievements);
    if (fresh.length === 0 && stale.length === 0) return;
    dispatch({ type: ACTIONS.SYNC_ACHIEVEMENTS, payload: { add: fresh, remove: stale } });
    // Também avisa quando a conquista veio de uma sessão REGISTRADA nesta visita,
    // mesmo com data de leitura antiga (ex.: registro manual de ontem).
    const registeredNow = data.sessions.some((s) => !s.isDemo && new Date(s.createdAt).getTime() >= openedAt.current - 1000);
    const toAnnounce = fresh.filter(
      (item) => !announced.current.has(item.id) && (registeredNow || new Date(item.unlockedAt).getTime() >= openedAt.current - 1000),
    );
    toAnnounce.forEach((item) => announced.current.add(item.id)); // evita aviso duplicado (StrictMode)
    if (toAnnounce.length > 3) toast.success(`${toAnnounce.length} conquistas desbloqueadas. Veja em Metas e conquistas.`);
    else for (const item of toAnnounce) toast.success(`Conquista desbloqueada: ${evaluated.find((e) => e.id === item.id).title}`);
  }, [data.books, data.sessions, data.achievements, data.goals, data.settings.weekStartsOn, toast]);

  // Preferências visuais aplicadas no <html> (o CSS lê esses atributos).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = data.settings.textSize;
    root.dataset.motion = data.settings.motion;
  }, [data.settings.textSize, data.settings.motion]);

  /* ---------- Livros ---------- */

  const addBook = useCallback((values) => {
    const { valid, errors, data: parsed } = validateBookForm(values);
    if (!valid) return fail(errors);
    const book = createBook(parsed, { id: createId('book'), now: new Date() });
    dispatch({ type: ACTIONS.ADD_BOOK, payload: book });
    return { ok: true, book };
  }, []);

  const updateBook = useCallback((id, values) => {
    const current = stateRef.current.books.find((b) => b.id === id);
    if (!current) return fail({ form: 'Este livro não existe mais. Ele pode ter sido excluído em outra aba.' });
    const { valid, errors, data: parsed } = validateBookForm(values, new Date(), {
      allowMissingTotal: !current.totalPages,
      allowMissingAuthor: !current.author,
    });
    if (!valid) return fail(errors);
    const book = applyBookUpdate(current, parsed, new Date());
    dispatch({ type: ACTIONS.UPDATE_BOOK, payload: book });
    return { ok: true, book };
  }, []);

  const changeBookStatus = useCallback((id, status) => {
    if (!BOOK_STATUSES.includes(status)) return { ok: false };
    if (!stateRef.current.books.some((b) => b.id === id)) return { ok: false };
    dispatch({ type: ACTIONS.CHANGE_BOOK_STATUS, payload: { id, status, now: new Date() } });
    return { ok: true };
  }, []);

  /** Livro lido antes do ReadTrack: concluído, sem sessões nem tempo. */
  const addPastBook = useCallback((values) => {
    const { valid, errors, data: parsed } = validatePastBookForm(values);
    if (!valid) return fail(errors);
    const book = createPastBook(parsed, { id: createId('book'), now: new Date() });
    dispatch({ type: ACTIONS.ADD_BOOK, payload: book });
    return { ok: true, book };
  }, []);

  const editPastBook = useCallback((id, values) => {
    const current = stateRef.current.books.find((b) => b.id === id);
    if (!current) return fail({ form: 'Este livro não existe mais. Ele pode ter sido excluído em outra aba.' });
    const { valid, errors, data: parsed } = validatePastBookForm(values);
    if (!valid) return fail(errors);
    const book = updatePastBook(current, parsed, new Date());
    dispatch({ type: ACTIONS.UPDATE_BOOK, payload: book });
    return { ok: true, book };
  }, []);

  /** Comentário final (avaliação, opinião, aprendizados). Tudo opcional. */
  const updateBookReview = useCallback((id, values) => {
    const current = stateRef.current.books.find((b) => b.id === id);
    if (!current) return fail({ form: 'Este livro não existe mais.' });
    const { valid, errors, data: review } = validateFinalReview(values);
    if (!valid) return fail(errors);
    const book = applyFinalReview(current, review, new Date());
    dispatch({ type: ACTIONS.UPDATE_BOOK, payload: book });
    return { ok: true, book };
  }, []);

  const deleteBook = useCallback((id) => {
    dispatch({ type: ACTIONS.DELETE_BOOK, payload: { id } });
  }, []);

  /* ---------- Cronômetro ---------- */

  const startSession = useCallback((bookId) => {
    const state = stateRef.current;
    if (state.activeSession) return { ok: false, error: 'Já existe uma sessão em andamento. Finalize ou cancele antes de começar outra.' };
    const book = state.books.find((b) => b.id === bookId);
    if (!book) return { ok: false, error: 'Escolha um livro para começar.' };
    if (book.status === 'finished') {
      return { ok: false, error: 'Este livro está concluído. Mude o status para "Lendo" para registrar uma nova leitura.' };
    }
    const active = createActiveSession({
      id: createId('session'),
      bookId,
      startPage: getTimerStartPage(book),
      now: new Date(),
    });
    dispatch({ type: ACTIONS.START_SESSION, payload: active });
    return { ok: true };
  }, []);

  const pauseSession = useCallback(() => dispatch({ type: ACTIONS.PAUSE_SESSION, payload: { now: new Date() } }), []);
  const resumeSession = useCallback(() => dispatch({ type: ACTIONS.RESUME_SESSION, payload: { now: new Date() } }), []);
  const reviewSession = useCallback(() => dispatch({ type: ACTIONS.REVIEW_SESSION, payload: { now: new Date() } }), []);
  const backToTimer = useCallback(() => dispatch({ type: ACTIONS.BACK_TO_TIMER }), []);

  const saveSessionDraft = useCallback((draft) => {
    const active = stateRef.current.activeSession;
    if (active) dispatch({ type: ACTIONS.SAVE_DRAFT, payload: { id: active.id, draft } });
  }, []);

  const cancelSession = useCallback(() => {
    const active = stateRef.current.activeSession;
    if (active) dispatch({ type: ACTIONS.CANCEL_SESSION, payload: { id: active.id } });
  }, []);

  const completeSession = useCallback((values) => {
    const state = stateRef.current;
    const active = state.activeSession;
    if (!active) return { ok: false, errors: { form: 'Não há sessão em andamento.' } };
    if (completedIds.current.has(active.id)) return { ok: false, duplicate: true, errors: {} };

    const book = state.books.find((b) => b.id === active.bookId);
    if (!book) return fail({ form: 'O livro desta sessão não existe mais.' });

    const now = new Date();
    const measuredSeconds = getElapsedSeconds(active, now);
    const { valid, errors, data: parsed } = validateSessionForm(values, { book, measuredSeconds });
    if (!valid) return fail(errors);

    const session = buildSession(active, parsed, { book, now });
    completedIds.current.add(active.id);
    dispatch({ type: ACTIONS.COMPLETE_SESSION, payload: { session, markFinished: parsed.markFinished } });
    return { ok: true, session, book, markFinished: parsed.markFinished };
  }, []);

  /* ---------- Sessões já salvas (Histórico) ---------- */

  const updateSession = useCallback((id, values) => {
    const state = stateRef.current;
    const session = state.sessions.find((s) => s.id === id);
    if (!session) return fail({ form: 'Esta sessão não existe mais. Ela pode ter sido excluída em outra aba.' });
    const book = state.books.find((b) => b.id === session.bookId);
    if (!book) return fail({ form: 'O livro desta sessão não existe mais.' });
    const now = new Date();

    // Registro manual: datas, horários, páginas e duração anotada editáveis.
    if (isManualSession(session)) {
      const { valid, errors, data: parsed } = validateManualSession(values, {
        book,
        sessions: state.sessions,
        editingId: id,
        now,
      });
      if (!valid) return fail(errors);
      const next = { ...session, ...parsed, bookId: session.bookId, updatedAt: now.toISOString() };
      dispatch({ type: ACTIONS.UPDATE_SESSION, payload: { session: next, now } });
      return { ok: true, session: next };
    }

    const { valid, errors, data: parsed } = validateSessionEdit(values, {
      book,
      session,
      measuredSeconds: getMeasuredSeconds(session),
    });
    if (!valid) return fail(errors);
    // Vocabulário (opcional) também nas sessões do cronômetro.
    const vocabulary = values.vocabularyText === undefined ? session.vocabulary ?? [] : parseVocabularyText(values.vocabularyText);
    const vocabularyError = validateVocabulary(vocabulary);
    if (vocabularyError) return fail({ vocabularyText: vocabularyError });
    const next = { ...session, ...parsed, vocabulary, updatedAt: now.toISOString() };
    dispatch({ type: ACTIONS.UPDATE_SESSION, payload: { session: next, now } });
    return { ok: true, session: next };
  }, []);

  /** Remove só a observação; a sessão continua. */
  const removeSessionNotes = useCallback((id) => {
    const session = stateRef.current.sessions.find((s) => s.id === id);
    if (!session) return fail({ form: 'Esta sessão não existe mais.' });
    const now = new Date();
    dispatch({ type: ACTIONS.UPDATE_SESSION, payload: { session: { ...session, notes: '', updatedAt: now.toISOString() }, now } });
    return { ok: true };
  }, []);

  /** Sessão registrada à mão (leituras anotadas fora do cronômetro). */
  const addManualSession = useCallback((values) => {
    const state = stateRef.current;
    const book = state.books.find((b) => b.id === values.bookId);
    const now = new Date();
    const { valid, errors, data: parsed } = validateManualSession(values, { book, sessions: state.sessions, now });
    if (!valid) return fail(errors);
    const session = buildManualSession(parsed, { id: createId('session'), now });
    dispatch({ type: ACTIONS.ADD_SESSIONS, payload: { sessions: [session], now } });
    return { ok: true, session };
  }, []);

  /** Importação do histórico: plano já validado e confirmado pelo usuário. */
  const importHistory = useCallback((plan) => {
    if (!plan?.ready) return { ok: false, sessions: 0, books: 0 };
    const state = stateRef.current;
    const existing = new Set(state.sessions.map((s) => s.id));
    const sessions = plan.sessions.filter((s) => !existing.has(s.id));
    const now = new Date();
    dispatch({ type: ACTIONS.ADD_SESSIONS, payload: { books: plan.newBooks, sessions, now } });
    return { ok: true, sessions: sessions.length, books: plan.newBooks.length };
  }, []);

  /**
   * Para a conta (Supabase): calcula o pedido de gravação ATÔMICA do
   * histórico, sem mudar nada na tela. Quem chama envia ao banco
   * (backend.importAtomic) e a tela é relida do banco depois.
   */
  const prepareHistoryImport = useCallback((plan) => {
    if (!plan?.ready) return null;
    const state = stateRef.current;
    const existing = new Set(state.sessions.map((s) => s.id));
    const sessions = plan.sessions.filter((s) => !existing.has(s.id));
    const next = dataReducer(state, { type: ACTIONS.ADD_SESSIONS, payload: { books: plan.newBooks, sessions, now: new Date() } });
    const changes = diffData(state, next);
    return {
      request: { mode: 'merge', books: changes.books.upsert, sessions: changes.sessions.upsert },
      summary: { sessions: sessions.length, books: plan.newBooks.length },
    };
  }, []);

  const deleteSession = useCallback((id) => {
    if (!stateRef.current.sessions.some((s) => s.id === id)) return { ok: false };
    dispatch({ type: ACTIONS.DELETE_SESSION, payload: { deleteId: id, now: new Date() } });
    return { ok: true };
  }, []);

  /* ---------- Demonstração e preferências ---------- */

  /** Só na demonstração pública: volta aos dados fictícios originais (datas de hoje). */
  const resetDemo = useCallback(() => {
    const fresh = persistence.resetDemo?.();
    if (!fresh) return { ok: false };
    completedIds.current.clear();
    dispatch({ type: ACTIONS.HYDRATE, payload: fresh });
    return { ok: true };
  }, [persistence]);
  /** Remove dados de demonstração gravados por versões antigas no modo local. */
  const removeDemo = useCallback(() => {
    dispatch({ type: ACTIONS.REMOVE_DEMO });
  }, []);
  const updateGoals = useCallback((values) => {
    const { valid, errors, data: goals } = validateGoalsForm(values);
    if (!valid) return fail(errors);
    dispatch({ type: ACTIONS.UPDATE_GOALS, payload: goals });
    return { ok: true, goals };
  }, []);

  const updateSettings = useCallback((values) => {
    const settings = normalizeSettings({ ...stateRef.current.settings, ...values });
    dispatch({ type: ACTIONS.UPDATE_SETTINGS, payload: settings });
    return { ok: true, settings };
  }, []);

  /* ---------- Dados ---------- */

  const exportData = useCallback(() => createExportPayload(stateRef.current), []);

  /** Recebe dados JÁ validados (parseImportText) e guarda uma cópia dos atuais antes. */
  const importData = useCallback((validData) => {
    const backupKey = persistence.backup(stateRef.current);
    completedIds.current.clear();
    dispatch({ type: ACTIONS.REPLACE_ALL, payload: validData });
    return { ok: true, backupKey };
  }, [persistence]);

  /** Backup ACRESCENTADO aos dados atuais: só entra o que é novo; nada é apagado. */
  const mergeData = useCallback((validData) => {
    const state = stateRef.current;
    const plan = planBackupMerge(state, validData);
    const backupKey = persistence.backup(state);
    if (plan.books.length || plan.sessions.length) {
      dispatch({ type: ACTIONS.ADD_SESSIONS, payload: { books: plan.books, sessions: plan.sessions, now: new Date() } });
    }
    return { ok: true, backupKey, summary: plan.summary };
  }, [persistence]);

  /**
   * Para a conta (Supabase): monta o pedido de importação ATÔMICA (função
   * import_backup do banco) sem mudar nada na tela. Guarda antes uma cópia
   * dos dados atuais neste navegador.
   * - merge: só o que é novo ou mudou (livros/sessões novos e o progresso
   *   recalculado dos livros que já existiam); nada é apagado.
   * - replace: o conteúdo inteiro do arquivo substitui o da conta.
   */
  const prepareImport = useCallback(
    (validData, mode) => {
      const state = stateRef.current;
      const backupKey = persistence.backup(state);
      if (mode === 'merge') {
        const plan = planBackupMerge(state, validData);
        const next = dataReducer(state, { type: ACTIONS.ADD_SESSIONS, payload: { books: plan.books, sessions: plan.sessions, now: new Date() } });
        const changes = diffData(state, next);
        return { backupKey, summary: plan.summary, request: { mode, books: changes.books.upsert, sessions: changes.sessions.upsert } };
      }
      const next = dataReducer(state, { type: ACTIONS.REPLACE_ALL, payload: validData });
      return {
        backupKey,
        summary: { books: next.books.length, sessions: next.sessions.length },
        request: { mode: 'replace', books: next.books, sessions: next.sessions, activeSession: next.activeSession, settings: next.settings, goals: next.goals },
      };
    },
    [persistence],
  );

  const clearAllData = useCallback(() => {
    const backupKey = persistence.backup(stateRef.current);
    completedIds.current.clear();
    dispatch({ type: ACTIONS.CLEAR_ALL });
    return { ok: true, backupKey };
  }, [persistence]);

  const getBackupCount = useCallback(() => persistence.listBackups().length, [persistence]);
  const deleteBackups = useCallback(() => persistence.deleteBackups(), [persistence]);
  const dismissStorageMessage = useCallback(() => setStorageMessage(null), []);

  const actions = useMemo(
    () => ({
      addBook,
      updateBook,
      changeBookStatus,
      updateBookReview,
      addPastBook,
      editPastBook,
      deleteBook,
      startSession,
      pauseSession,
      resumeSession,
      reviewSession,
      backToTimer,
      saveSessionDraft,
      cancelSession,
      completeSession,
      updateSession,
      addManualSession,
      importHistory,
      prepareHistoryImport,
      removeSessionNotes,
      deleteSession,
      resetDemo,
      removeDemo,
      updateGoals,
      updateSettings,
      exportData,
      importData,
      mergeData,
      prepareImport,
      clearAllData,
      getBackupCount,
      deleteBackups,
      dismissStorageMessage,
    }),
    [
      addBook,
      updateBook,
      changeBookStatus,
      updateBookReview,
      addPastBook,
      editPastBook,
      deleteBook,
      startSession,
      pauseSession,
      resumeSession,
      reviewSession,
      backToTimer,
      saveSessionDraft,
      cancelSession,
      completeSession,
      updateSession,
      addManualSession,
      importHistory,
      prepareHistoryImport,
      removeSessionNotes,
      deleteSession,
      resetDemo,
      removeDemo,
      updateGoals,
      updateSettings,
      exportData,
      importData,
      mergeData,
      prepareImport,
      clearAllData,
      getBackupCount,
      deleteBackups,
      dismissStorageMessage,
    ],
  );

  const value = useMemo(() => {
    const hasDemoData = data.books.some((b) => b.isDemo) || data.sessions.some((s) => s.isDemo);
    return {
      ...data,
      ledger,
      dispatch,
      workspace: persistence.mode === 'demo' ? 'demo' : 'personal',
      hasDemoData,
      storage: {
        mode: persistence.mode,
        status: boot.status,
        canPersist: boot.canPersist,
        message: storageMessage,
        saveError,
      },
      actions,
    };
  }, [data, ledger, boot, storageMessage, saveError, actions, persistence.mode]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
