/**
 * Fila de sincronização com o banco remoto.
 *
 * - `confirmed`: último estado que sabemos estar gravado no banco.
 * - `latest`: estado atual da tela.
 * A cada mudança, esperamos um instante (agrupa digitação e cliques
 * seguidos), calculamos diffData(confirmed, latest) e enviamos. Só depois
 * do sucesso `confirmed` avança. Em caso de falha, nada se perde da tela:
 * novas tentativas acontecem com espera crescente, e a diferença é
 * recalculada (operações idempotentes, sem duplicar registros).
 */
import { diffData, isEmptyDiff } from './diff.js';

export const SYNC_STATE = Object.freeze({
  IDLE: 'idle', // tudo salvo
  PENDING: 'pending', // mudanças aguardando envio
  SAVING: 'saving',
  ERROR: 'error', // última tentativa falhou; nova tentativa agendada
});

const DEFAULT_RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];

export function createRemoteSync({
  repository,
  userId,
  initialData,
  onStatusChange = () => {},
  debounceMs = 600,
  retryDelays = DEFAULT_RETRY_DELAYS,
  timers = { setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (id) => globalThis.clearTimeout(id) },
}) {
  let confirmed = initialData;
  let latest = initialData;
  let timer = null;
  let inFlight = null;
  let failures = 0;
  let disposed = false;
  let status = { state: SYNC_STATE.IDLE, error: null, lastSavedAt: null };

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    onStatusChange(status);
  };

  const hasChanges = () => !isEmptyDiff(diffData(confirmed, latest));

  function schedule(delay) {
    if (disposed) return;
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = null;
      flush();
    }, delay);
  }

  async function runFlush() {
    const snapshot = latest;
    const changes = diffData(confirmed, snapshot);
    if (isEmptyDiff(changes)) {
      setStatus({ state: SYNC_STATE.IDLE, error: null });
      return true;
    }
    setStatus({ state: SYNC_STATE.SAVING });
    try {
      await repository.applyChanges(userId, changes);
      confirmed = snapshot;
      failures = 0;
      if (latest !== snapshot && hasChanges()) {
        setStatus({ state: SYNC_STATE.PENDING, error: null, lastSavedAt: new Date().toISOString() });
        schedule(debounceMs);
      } else {
        setStatus({ state: SYNC_STATE.IDLE, error: null, lastSavedAt: new Date().toISOString() });
      }
      return true;
    } catch (error) {
      failures += 1;
      setStatus({ state: SYNC_STATE.ERROR, error });
      // Sessão expirada não se resolve sozinha: espera o usuário entrar de novo.
      if (error?.kind !== 'auth') schedule(retryDelays[Math.min(failures - 1, retryDelays.length - 1)]);
      return false;
    }
  }

  function flush() {
    if (inFlight) return inFlight;
    inFlight = runFlush().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    /** Informa o novo estado da tela. */
    push(data) {
      if (disposed || data === latest) return;
      latest = data;
      if (!hasChanges()) {
        if (status.state === SYNC_STATE.PENDING) setStatus({ state: SYNC_STATE.IDLE });
        return;
      }
      if (status.state !== SYNC_STATE.ERROR && status.state !== SYNC_STATE.SAVING) setStatus({ state: SYNC_STATE.PENDING });
      if (!inFlight) schedule(status.state === SYNC_STATE.ERROR ? retryDelays[0] : debounceMs);
    },

    /** Envia imediatamente e espera terminar (antes de migrar ou sair). */
    async flushNow() {
      if (timer) {
        timers.clearTimeout(timer);
        timer = null;
      }
      if (inFlight) await inFlight;
      if (!hasChanges()) return true;
      return flush();
    },

    /** Tenta de novo agora (botão "Tentar novamente"). */
    retry() {
      failures = 0;
      return this.flushNow();
    },

    /** Dados recarregados do banco passam a ser a referência. */
    reset(data) {
      confirmed = data;
      latest = data;
      failures = 0;
      if (timer) timers.clearTimeout(timer);
      timer = null;
      setStatus({ state: SYNC_STATE.IDLE, error: null });
    },

    hasPendingChanges: () => Boolean(inFlight) || hasChanges(),
    getLatest: () => latest,
    getStatus: () => status,

    dispose() {
      disposed = true;
      if (timer) timers.clearTimeout(timer);
      timer = null;
    },
  };
}
