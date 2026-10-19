import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Download,
  FileUp,
  FlaskConical,
  HardDrive,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { Button, ChoiceGroup, ConfirmDialog, Field, PageHeader, Panel } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useBackend } from '../../hooks/useBackend.js';
import { PUBLIC_ROUTES } from '../../app/paths.js';
import { useToast } from '../../hooks/useToast.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { GoalsForm } from '../goals/components/GoalsForm.jsx';
import { AccountPanel } from './components/AccountPanel.jsx';
import { exportFileName, parseImportText, prepareForPersonalArea } from '../../services/storage/dataTransfer.js';
import { downloadJson, readFileAsText } from '../../utils/download.js';
import { USER_NAME_MAX } from '../../utils/settings.js';
import { formatFullDate, formatNumber, pluralize } from '../../utils/format.js';
import './Settings.css';

const CLEAR_WORD = 'APAGAR';

export default function SettingsPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  useDocumentTitle('Configurações');
  const { books, sessions, settings, hasDemoData, storage, actions, workspace } = useData();
  const backend = useBackend();
  const isDemo = workspace === 'demo';
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // 'restore' | 'remove' | 'clear' | 'import' | 'backups'
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState(settings.userName);
  // Se o nome mudar por fora (importação, outra aba), o campo acompanha.
  const [savedName, setSavedName] = useState(settings.userName);
  if (savedName !== settings.userName) {
    setSavedName(settings.userName);
    setName(settings.userName);
  }
  const [importState, setImportState] = useState({ status: 'idle' });
  // Padrão seguro: acrescentar. "Substituir tudo" precisa ser escolhido.
  const [importMode, setImportMode] = useState('merge');
  const navigate = useNavigate();
  const [clearText, setClearText] = useState('');
  const [backupCount, setBackupCount] = useState(() => actions.getBackupCount());
  const fileRef = useRef(null);

  const userBooks = books.filter((b) => !b.isDemo).length;
  const userSessions = sessions.filter((s) => !s.isDemo).length;
  const close = () => setDialog(null);
  const remote = storage.mode === 'remote';
  const where = remote ? 'da sua conta' : 'deste navegador';
  const refreshBackups = () => setBackupCount(actions.getBackupCount());

  /* ---------- Exportar ---------- */
  const exportNow = () => {
    try {
      const payload = actions.exportData();
      const fileName = exportFileName();
      downloadJson(fileName, payload);
      toast.success(`Backup exportado: ${fileName}`);
    } catch (error) {
      toast.error(`Não foi possível exportar: ${error.message}`);
    }
  };

  /* ---------- Importar ---------- */
  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportState({ status: 'reading', fileName: file.name });
    try {
      const text = await readFileAsText(file);
      const result = parseImportText(text);
      if (!result.ok && result.kind === 'history') {
        // Arquivo de histórico anotado: vai para a importação certa, já com o arquivo.
        setImportState({ status: 'idle' });
        toast.info('Este arquivo é um histórico anotado: confira a prévia e confirme para acrescentar as sessões.');
        navigate(ROUTES.importHistory, { state: { historyText: text, fileName: file.name } });
        return;
      }
      if (!result.ok) {
        setImportState({ status: 'invalid', fileName: file.name, error: result.error, details: result.details });
        return;
      }
      // Dados de demonstração nunca entram na área pessoal (nem arquivos da demonstração pública).
      const personal = prepareForPersonalArea(result.data);
      if (!personal.ok) {
        setImportState({ status: 'invalid', fileName: file.name, error: personal.error, details: [] });
        return;
      }
      const summary = { ...result.summary, books: personal.data.books.length, sessions: personal.data.sessions.length, demoSkipped: personal.demoSkipped };
      setImportState({ status: 'valid', fileName: file.name, data: personal.data, summary });
      setImportMode('merge');
      setDialog('import');
    } catch (error) {
      setImportState({ status: 'invalid', fileName: file.name, error: error.message, details: [] });
    }
  };

  /** Conta (Supabase): uma única transação no banco; sucesso só depois da confirmação dele. */
  const confirmRemoteImport = async () => {
    setImporting(true);
    const prepared = actions.prepareImport(importState.data, importMode);
    const result = await backend.importAtomic(prepared.request);
    setImporting(false);
    if (!result.ok) {
      close();
      setImportState({ status: 'invalid', fileName: importState.fileName, error: `O banco não confirmou a importação. ${result.error}`, details: [] });
      return;
    }
    close();
    setImportState({ status: 'idle' });
    const skipped = importState.summary.demoSkipped ? ` ${pluralize(importState.summary.demoSkipped, 'registro de demonstração foi ignorado', 'registros de demonstração foram ignorados')}.` : '';
    if (importMode === 'merge') {
      const { summary } = prepared;
      toast.success(
        summary.sessionsAdded || summary.booksAdded
          ? `Salvo na sua conta: ${pluralize(summary.booksAdded, 'livro')} e ${pluralize(summary.sessionsAdded, 'sessão', 'sessões')} acrescentados${summary.sessionsSkipped ? ` (${pluralize(summary.sessionsSkipped, 'já existia', 'já existiam')})` : ''}. Nada foi apagado.${skipped}`
          : `Tudo o que está no arquivo já existia na sua conta. Nada foi alterado.${skipped}`,
      );
    } else {
      toast.success(`Backup salvo na sua conta: ${pluralize(prepared.summary.books, 'livro')} e ${pluralize(prepared.summary.sessions, 'sessão', 'sessões')}. Uma cópia dos dados anteriores ficou neste navegador.${skipped}`);
    }
  };

  const confirmImport = () => {
    if (backend.importAtomic) {
      confirmRemoteImport();
      return;
    }
    if (importMode === 'merge') {
      const { summary } = actions.mergeData(importState.data);
      close();
      setImportState({ status: 'idle' });
      refreshBackups();
      toast.success(
        summary.sessionsAdded || summary.booksAdded
          ? `Acrescentados: ${pluralize(summary.booksAdded, 'livro')} e ${pluralize(summary.sessionsAdded, 'sessão', 'sessões')}${summary.sessionsSkipped ? ` (${pluralize(summary.sessionsSkipped, 'já existia', 'já existiam')})` : ''}. Nada foi apagado.`
          : 'Tudo o que está no arquivo já existia. Nada foi alterado.',
      );
      return;
    }
    actions.importData(importState.data);
    close();
    setImportState({ status: 'idle' });
    refreshBackups();
    toast.success('Dados importados. Seus dados anteriores foram guardados numa cópia de segurança.');
  };

  return (
    <div className="page settings">
      <PageHeader
        title="Configurações"
        description={remote ? 'Conta, preferências, metas e os seus dados.' : 'Preferências, metas e os dados guardados neste navegador.'}
      />

      {/* ---------- Conta e modo de armazenamento ---------- */}
      {isDemo ? (
        <Panel title="Demonstração" id="conta">
          <div className="settings__row">
            <FlaskConical size={20} aria-hidden="true" className="settings__icon" />
            <div className="settings__text">
              <p>
                <strong>Você está na demonstração pública.</strong> Os livros, sessões, metas e conquistas são fictícios e ficam só neste
                navegador, separados de qualquer conta. Nada daqui é enviado ao banco.
              </p>
              <p className="settings__muted">Backup, importações e a conta ficam disponíveis depois de criar a sua conta (que começa vazia).</p>
            </div>
          </div>
          <div className="settings__actions">
            <Button icon={UserPlus} to={PUBLIC_ROUTES.register}>
              Criar minha conta
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={() => setDialog('restore')}>
              Restaurar dados iniciais
            </Button>
          </div>
        </Panel>
      ) : (
        <AccountPanel />
      )}

      {/* ---------- Preferências ---------- */}
      <Panel title="Preferências">
        <form
          className="settings__name"
          onSubmit={(event) => {
            event.preventDefault();
            actions.updateSettings({ userName: name });
            toast.success(name.trim() ? 'Nome salvo.' : 'Nome removido.');
          }}
        >
          <Field label="Seu nome" hint="Usado na saudação do início.">
            <input className="input" value={name} maxLength={USER_NAME_MAX} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
          <Button type="submit" variant="secondary" icon={Save}>
            Salvar nome
          </Button>
        </form>

        <div className="settings__choices">
          <ChoiceGroup
            legend="Tamanho do texto"
            name="textSize"
            value={settings.textSize}
            onChange={(textSize) => actions.updateSettings({ textSize })}
            options={[
              { value: 'normal', label: 'Padrão' },
              { value: 'large', label: 'Maior' },
            ]}
          />
          <ChoiceGroup
            legend="Animações"
            name="motion"
            value={settings.motion}
            onChange={(motion) => actions.updateSettings({ motion })}
            options={[
              { value: 'system', label: 'Seguir o sistema' },
              { value: 'reduce', label: 'Reduzir' },
            ]}
          />
          <ChoiceGroup
            legend="A semana começa"
            name="weekStartsOn"
            value={settings.weekStartsOn}
            onChange={(weekStartsOn) => actions.updateSettings({ weekStartsOn })}
            options={[
              { value: 'monday', label: 'Na segunda-feira' },
              { value: 'sunday', label: 'No domingo' },
            ]}
          />
        </div>
        <p className="settings__muted">O início da semana muda a meta semanal e as estatísticas por semana.</p>
      </Panel>

      {/* ---------- Metas ---------- */}
      <Panel title="Metas">
        <GoalsForm compact />
      </Panel>

      {!isDemo && (
        <>
        {/* ---------- Backup ---------- */}
        <Panel title="Backup dos dados">
          <div className="settings__row">
            <HardDrive size={20} aria-hidden="true" className="settings__icon" />
            <div className="settings__text">
              <p>
                Exporte tudo (livros, sessões, observações, comentários finais, metas e conquistas) para um arquivo JSON. Use-o para
                guardar uma cópia ou levar seus dados para outro navegador.
              </p>
              <p className="settings__muted tabular">
                Seus registros: {pluralize(userBooks, 'livro')} e {pluralize(userSessions, 'sessão', 'sessões')}
                {hasDemoData ? ', além dos dados de demonstração.' : '.'}
              </p>
            </div>
          </div>
          <div className="settings__actions">
            <Button icon={Download} onClick={exportNow}>
              Exportar JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={onFile}
            />
            <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} disabled={importState.status === 'reading'}>
              {importState.status === 'reading' ? 'Lendo arquivo…' : 'Importar JSON'}
            </Button>
          </div>
          {importState.status === 'invalid' && (
            <div className="form-alert settings__import-error" role="alert">
              <p>
                <strong>“{importState.fileName}” não foi importado.</strong> {importState.error}
              </p>
              {importState.details?.length > 0 && (
                <ul>
                  {importState.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
              <p>Seus dados atuais não foram alterados.</p>
            </div>
          )}
          <p className="settings__muted">
            Ao importar, você escolhe: <strong>acrescentar</strong> (padrão; nada é apagado) ou <strong>substituir tudo</strong>. O
            ReadTrack valida o arquivo inteiro antes e guarda uma cópia automática do que existe hoje. Arquivos de histórico anotado são
            encaminhados para Histórico → Importar histórico.
          </p>
        </Panel>

        <Panel title="Histórico anotado à mão">
          <div className="settings__row">
            <FileUp size={20} aria-hidden="true" className="settings__icon" />
            <div className="settings__text">
              <p>
                Traga sessões que você anotou antes de usar o ReadTrack (datas, horários, páginas, duração e vocabulário). Diferente do
                backup, isto <strong>acrescenta</strong> sessões: nada do que existe é substituído, e importar de novo não duplica.
              </p>
            </div>
          </div>
          <div className="settings__actions">
            <Button variant="secondary" icon={FileUp} to={ROUTES.importHistory}>
              Importar histórico
            </Button>
          </div>
        </Panel>

        {/* ---------- Dados de exemplo de versões antigas (só se existirem) ---------- */}
        {hasDemoData && (
          <Panel title="Dados de exemplo antigos">
            <div className="settings__row">
              <FlaskConical size={20} aria-hidden="true" className="settings__icon" />
              <div className="settings__text">
                <p>
                  Versões anteriores do ReadTrack gravavam livros e sessões de exemplo neste navegador. Eles nunca são enviados para uma conta e
                  podem ser removidos sem afetar o que você cadastrou. A demonstração agora fica em{' '}
                  <Link to={PUBLIC_ROUTES.demo}>uma página separada</Link>.
                </p>
              </div>
            </div>
            <div className="settings__actions">
              <Button variant="danger" icon={Trash2} onClick={() => setDialog('remove')}>
                Remover dados de exemplo
              </Button>
            </div>
          </Panel>
        )}

        {/* ---------- Zona de risco ---------- */}
        <Panel title="Apagar dados" className="settings__danger">
          <p className="settings__text">
            Apaga livros, sessões, cronômetro, metas, conquistas e preferências {where}. Uma cópia
            automática é guardada neste navegador antes, mas exporte um backup se quiser ter certeza.
          </p>
          <div className="settings__actions">
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                setClearText('');
                setDialog('clear');
              }}
            >
              Limpar todos os dados
            </Button>
          </div>
          <p className="settings__muted tabular">
            {storage.canPersist
              ? `Cópias de segurança automáticas neste navegador: ${formatNumber(backupCount)} (as 5 mais recentes são mantidas).`
              : 'O armazenamento deste navegador não está disponível; nada está sendo salvo.'}
            {backupCount > 0 && (
              <>
                {' '}
                <button type="button" className="settings__link" onClick={() => setDialog('backups')}>
                  Apagar cópias
                </button>
              </>
            )}
          </p>
        </Panel>
        </>
      )}

      {/* ---------- Diálogos ---------- */}
      <ConfirmDialog
        open={dialog === 'import'}
        title="Importar backup"
        description={
          importState.summary
            ? `O arquivo “${importState.fileName}” é válido e tem ${pluralize(importState.summary.books, 'livro')}, ${pluralize(importState.summary.sessions, 'sessão', 'sessões')}${importState.summary.exportedAt ? `, exportado em ${formatFullDate(importState.summary.exportedAt)}` : ''}${importState.summary.demoSkipped ? ` (${pluralize(importState.summary.demoSkipped, 'registro de demonstração será ignorado', 'registros de demonstração serão ignorados')})` : ''}. Nada muda até você confirmar. Como importar?`
            : ''
        }
        confirmLabel={importing ? 'Salvando na conta…' : importMode === 'merge' ? 'Acrescentar' : 'Substituir tudo'}
        confirmDisabled={importing}
        variant={importMode === 'merge' ? 'primary' : 'danger'}
        onCancel={() => {
          if (importing) return; // a gravação no banco já começou: espera a resposta
          close();
          setImportState({ status: 'idle' });
        }}
        onConfirm={confirmImport}
      >
        <ChoiceGroup
          legend="Modo de importação"
          name="importMode"
          value={importMode}
          onChange={setImportMode}
          options={[
            { value: 'merge', label: 'Acrescentar ao que já existe (recomendado)' },
            { value: 'replace', label: `Substituir tudo ${remote ? 'na conta' : 'neste navegador'}` },
          ]}
        />
        <p className="settings__muted">
          {importMode === 'merge'
            ? 'Só entram livros e sessões que você ainda não tem; sessões repetidas são puladas. Nada é apagado: nos livros que você já tem, só o progresso é atualizado pelas sessões novas. Metas e preferências do arquivo são ignoradas.'
            : `Apaga ${remote ? 'da sua conta' : 'deste navegador'} tudo o que não estiver no arquivo (livros, sessões, metas e preferências). Uma cópia de segurança dos dados atuais é guardada neste navegador.`}
          {remote && ' A gravação na conta é feita de uma só vez: se algo falhar, nada muda.'}
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'restore'}
        title="Restaurar a demonstração?"
        description="Os livros, sessões, metas e conquistas fictícios voltam ao estado inicial, com datas de hoje. O que você alterou na demonstração será descartado. Nenhuma conta é afetada."
        confirmLabel="Restaurar"
        onCancel={close}
        onConfirm={() => {
          actions.resetDemo();
          close();
          toast.success('Demonstração restaurada.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'remove'}
        title="Remover os dados de exemplo antigos?"
        description="Os livros e sessões de exemplo gravados por versões antigas serão apagados deste navegador. O que você cadastrou não muda."
        confirmLabel="Remover dados de exemplo"
        variant="danger"
        onCancel={close}
        onConfirm={() => {
          actions.removeDemo();
          close();
          toast.success('Dados de exemplo removidos.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'clear'}
        title="Limpar todos os dados?"
        description={`Isso apaga ${pluralize(books.length, 'livro')} e ${pluralize(sessions.length, 'sessão', 'sessões')}. Para confirmar, digite ${CLEAR_WORD}.`}
        confirmLabel="Limpar tudo"
        variant="danger"
        confirmDisabled={clearText.trim().toUpperCase() !== CLEAR_WORD}
        onCancel={close}
        onConfirm={() => {
          actions.clearAllData();
          close();
          setName('');
          refreshBackups();
          toast.success('Todos os dados foram apagados.');
        }}
      >
        <Field label={`Digite ${CLEAR_WORD}`} required>
          <input className="input" value={clearText} onChange={(e) => setClearText(e.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'backups'}
        title="Apagar as cópias de segurança?"
        description={`${pluralize(backupCount, 'cópia automática', 'cópias automáticas')} deste navegador ${backupCount === 1 ? 'será apagada' : 'serão apagadas'}. Seus dados atuais não mudam.`}
        confirmLabel="Apagar cópias"
        variant="danger"
        onCancel={close}
        onConfirm={() => {
          const removed = actions.deleteBackups();
          close();
          refreshBackups();
          toast.success(`${pluralize(removed, 'cópia apagada', 'cópias apagadas')}.`);
        }}
      />
    </div>
  );
}
