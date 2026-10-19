/**
 * Persistência da DEMONSTRAÇÃO PÚBLICA (/demo).
 *
 * - Usa só a área de armazenamento da demonstração ('readtrack:demo') deste
 *   navegador. Não lê nem grava os dados pessoais ('readtrack:data') e não
 *   tem acesso ao Supabase: nada da demonstração chega a uma conta.
 * - Primeira visita (ou conjunto fictício de outra versão): cria os dados
 *   fictícios com datas relativas a hoje.
 * - Se o visitante NÃO alterou nada, a demonstração é recriada a cada novo
 *   dia, para continuar "viva" (hoje, esta semana...). Se alterou, as
 *   alterações ficam até ele restaurar a demonstração.
 * - Restaurar = voltar aos dados fictícios originais (datas de hoje).
 *
 * Mesma interface das outras persistências (local e remota).
 */
import { DEMO_AREA, LOAD_STATUS } from '../storage/storageService.js';
import { createDemoWorkspaceData, DEMO_DATASET_VERSION, DEMO_WORKSPACE } from '../../demo/demoDataset.js';
import { toDateKey } from '../../utils/date.js';

const UNAVAILABLE_MESSAGE =
  'Este navegador não permite salvar dados neste site. A demonstração funciona, mas suas alterações valem só até fechar a aba.';

function isCurrentDemo(data) {
  return data?.meta?.workspace === DEMO_WORKSPACE && Number(data.meta.demoDatasetVersion) === DEMO_DATASET_VERSION;
}

function computeInitialState(area, now) {
  const result = area.loadData();
  const fresh = () => createDemoWorkspaceData(now);

  switch (result.status) {
    case LOAD_STATUS.OK:
    case LOAD_STATUS.RECOVERED: {
      const stored = result.data;
      if (!isCurrentDemo(stored)) return { data: fresh(), status: LOAD_STATUS.EMPTY, message: null, canPersist: true, pristine: true };
      const sameDay = stored.meta.demoLoadedAt && toDateKey(stored.meta.demoLoadedAt) === toDateKey(now);
      if (!stored.meta.demoModified && !sameDay) {
        return { data: fresh(), status: LOAD_STATUS.EMPTY, message: null, canPersist: true, pristine: true };
      }
      return { data: stored, status: result.status, message: null, canPersist: true, pristine: !stored.meta.demoModified };
    }
    case LOAD_STATUS.UNAVAILABLE:
      return { data: fresh(), status: result.status, message: UNAVAILABLE_MESSAGE, canPersist: false, pristine: true };
    case LOAD_STATUS.NEWER_VERSION:
    case LOAD_STATUS.CORRUPTED:
    case LOAD_STATUS.EMPTY:
    default:
      // Nada a preservar: são dados fictícios. (Arquivo ilegível já foi copiado pela área.)
      return { data: fresh(), status: LOAD_STATUS.EMPTY, message: null, canPersist: true, pristine: true };
  }
}

export function createDemoPersistence({ area = DEMO_AREA, now = () => new Date() } = {}) {
  let boot = null;
  // Estado "como foi criado": enquanto for o mesmo objeto, nada foi alterado.
  let pristineData = null;
  let modified = false;

  return {
    mode: 'demo',
    boot() {
      if (!boot) {
        boot = computeInitialState(area, now());
        pristineData = boot.pristine ? boot.data : null;
        modified = !boot.pristine;
      }
      return boot;
    },
    save(data) {
      if (data !== pristineData) modified = true;
      return area.saveData({ ...data, meta: { ...data.meta, workspace: DEMO_WORKSPACE, demoModified: modified } });
    },
    subscribe(onExternalData) {
      return area.subscribe(() => {
        const result = area.loadData();
        if (result.data && isCurrentDemo(result.data)) onExternalData(result.data);
      });
    },
    /** Dados fictícios originais, com datas de hoje. */
    resetDemo() {
      const data = createDemoWorkspaceData(now());
      pristineData = data;
      modified = false;
      return data;
    },
    isModified: () => modified,
    // A demonstração não tem cópias de segurança: não há nada pessoal a guardar.
    backup: () => null,
    listBackups: () => [],
    deleteBackups: () => 0,
  };
}
