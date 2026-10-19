import { useState } from 'react';
import { Cloud, CloudUpload, HardDrive, LogOut, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { Button, ConfirmDialog, Panel } from '../../../components/ui';
import { useBackend } from '../../../hooks/useBackend.js';
import { useToast } from '../../../hooks/useToast.js';
import { SYNC_STATE } from '../../../services/sync/remoteSync.js';
import { formatFullDate, pluralize } from '../../../utils/format.js';

const LOCAL_TEXT = {
  'not-configured':
    'O Supabase ainda não foi configurado neste site (faltam as variáveis de ambiente). Tudo funciona no modo local: os dados ficam só neste navegador.',
  'invalid-config': 'A configuração do Supabase é inválida, então o site está usando o modo local.',
};

function syncLabel(status) {
  switch (status?.state) {
    case SYNC_STATE.SAVING:
      return 'Salvando…';
    case SYNC_STATE.PENDING:
      return 'Alterações aguardando envio';
    case SYNC_STATE.ERROR:
      return 'Erro ao salvar';
    default:
      return 'Tudo salvo no banco';
  }
}

/** Conta, modo de armazenamento e migração dos dados locais. */
export function AccountPanel() {
  const backend = useBackend();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [includePreferences, setIncludePreferences] = useState(true);
  const [dialog, setDialog] = useState(null); // 'clear-local' | 'force-signout'
  const [error, setError] = useState(null);

  if (backend.mode === 'local') {
    return (
      <Panel title="Conta e armazenamento" id="conta">
        <div className="settings__row">
          <HardDrive size={20} aria-hidden="true" className="settings__icon" />
          <div className="settings__text">
            <p>
              <strong>Modo local ativo.</strong> {LOCAL_TEXT[backend.localReason]}
            </p>
            {backend.localReason === 'invalid-config' && backend.configProblem && (
              <p className="form-alert" role="alert">
                {backend.configProblem}
              </p>
            )}
            {backend.localReason === 'not-configured' && (
              <p className="settings__muted">
                Para usar contas, configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja o README, etapa B).
              </p>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  const { migration, syncStatus } = backend;
  const summary = migration.summary;
  const migrated = migration.marker?.status === 'done';
  const result = migration.lastResult;
  const hasLocal = !summary.isEmpty;

  const signOut = async (force = false) => {
    setBusy(true);
    setError(null);
    const res = await backend.signOut({ force });
    setBusy(false);
    if (res.pending) setDialog('force-signout');
    else if (!res.ok) setError(res.error);
  };

  const migrate = async () => {
    setBusy(true);
    setError(null);
    const res = await backend.migration.run({ includePreferences });
    setBusy(false);
    if (res.error) setError(res.error);
    else if (res.ok) toast.success('Dados do navegador enviados e conferidos na sua conta.');
  };

  return (
    <Panel title="Conta e armazenamento" id="conta">
      <div className="settings__row">
        <Cloud size={20} aria-hidden="true" className="settings__icon" />
        <div className="settings__text">
          <p>
            Conectado como <strong className="settings__email">{backend.user?.email || 'usuário sem e-mail'}</strong>. Seus dados ficam no banco do
            Supabase, protegidos por usuário.
          </p>
          <p className="settings__muted" role="status">
            {syncLabel(syncStatus)}
            {syncStatus?.lastSavedAt && syncStatus.state === SYNC_STATE.IDLE ? ` · última gravação ${formatFullDate(syncStatus.lastSavedAt)}` : ''}
          </p>
          {syncStatus?.state === SYNC_STATE.ERROR && (
            <p className="form-alert" role="alert">
              {syncStatus.error?.message}
            </p>
          )}
        </div>
      </div>
      <div className="settings__actions">
        {syncStatus?.state === SYNC_STATE.ERROR && (
          <Button variant="secondary" icon={RefreshCw} onClick={backend.retrySync}>
            Tentar salvar agora
          </Button>
        )}
        <Button variant="secondary" icon={LogOut} onClick={() => signOut(false)} disabled={busy}>
          Sair da conta
        </Button>
      </div>

      {(hasLocal || result) && (
        <div className="settings__migration">
          <h3 className="settings__subtitle">Dados salvos neste navegador</h3>
          {hasLocal && (
            <p className="settings__text">
              Este navegador tem {pluralize(summary.books, 'livro')} e {pluralize(summary.sessions, 'sessão', 'sessões')} do modo local
              {summary.demoItems ? ' (os dados de demonstração não são enviados)' : ''}. Eles não aparecem na conta até
              você enviá-los. Enviar de novo não duplica nada, e registros que já existem na conta não são substituídos.
            </p>
          )}

          {result && <MigrationResult result={result} />}

          {hasLocal && (
            <>
              <label className="settings__check">
                <input type="checkbox" checked={includePreferences} onChange={(e) => setIncludePreferences(e.target.checked)} />
                <span>Também usar as preferências e metas deste navegador na conta</span>
              </label>
              <div className="settings__actions">
                <Button icon={CloudUpload} onClick={migrate} disabled={busy}>
                  {busy ? 'Enviando…' : migrated ? 'Enviar de novo' : 'Enviar para a conta'}
                </Button>
                {migrated && (
                  <Button variant="danger" icon={Trash2} onClick={() => setDialog('clear-local')} disabled={busy}>
                    Apagar cópia local
                  </Button>
                )}
              </div>
              {migrated && (
                <p className="settings__muted">
                  Migração conferida em {formatFullDate(migration.marker.at)}. A cópia local continua aqui até você apagá-la.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={dialog === 'clear-local'}
        title="Apagar os dados do modo local?"
        description="A migração foi conferida: os registros deste navegador estão na sua conta. A cópia local será apagada; as cópias de segurança automáticas continuam até você removê-las."
        confirmLabel="Apagar cópia local"
        variant="danger"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          const res = migration.clearLocalCopy();
          setDialog(null);
          if (res.ok) toast.success('Cópia local apagada. Seus dados continuam na conta.');
          else setError(res.error ?? 'Não foi possível apagar a cópia local.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'force-signout'}
        title="Sair sem salvar tudo?"
        description="Algumas alterações ainda não chegaram ao banco (verifique a conexão). Se sair agora, elas serão perdidas."
        confirmLabel="Sair mesmo assim"
        variant="danger"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          signOut(true);
        }}
      />
    </Panel>
  );
}

function MigrationResult({ result }) {
  if (result.error) return null;
  const c = result.counts ?? {};
  const line = (key, one, many) =>
    c[key]?.total
      ? `${pluralize(c[key].inserted, one, many)} enviad${c[key].inserted === 1 ? 'o' : 'os'}${c[key].alreadyExisted ? `, ${c[key].alreadyExisted} já existia(m)` : ''}`
      : null;
  const lines = [line('books', 'livro', 'livros'), line('sessions', 'sessão', 'sessões')].filter(Boolean);

  return (
    <div className={result.ok ? 'settings__notice' : 'form-alert'} role={result.ok ? 'status' : 'alert'}>
      <p>
        {result.ok ? <strong>Migração concluída e conferida.</strong> : (
          <>
            <TriangleAlert size={16} aria-hidden="true" /> <strong>Migração incompleta.</strong> A cópia local foi mantida.
          </>
        )}{' '}
        {lines.join('; ')}
        {lines.length ? '.' : ''}
      </p>
      {result.failed?.length > 0 && (
        <ul className="settings__list">
          {result.failed.slice(0, 5).map((f) => (
            <li key={`${f.kind}-${f.id}`}>
              {f.kind} {f.id}: {f.message}
            </li>
          ))}
          {result.failed.length > 5 && <li>e mais {result.failed.length - 5}.</li>}
        </ul>
      )}
      {result.missing?.length > 0 && <p>{result.missing.length} registro(s) não foram encontrados no banco depois do envio.</p>}
    </div>
  );
}
