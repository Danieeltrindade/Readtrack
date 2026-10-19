import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { CheckCircle2, FileUp, History, TriangleAlert, Upload, X } from 'lucide-react';
import { Button, Field, PageHeader, Panel } from '../../components/ui';
import { usePaths } from '../../hooks/useWorkspace.js';
import { useData } from '../../hooks/useData.js';
import { useBackend } from '../../hooks/useBackend.js';
import { useToast } from '../../hooks/useToast.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { DEFAULT_IMPORT_YEAR, buildImportPlan, parseHistoryFile } from '../../services/historyImport/historyImport.js';
import { formatDurationText } from '../../utils/duration.js';
import { formatNumber, pluralize } from '../../utils/format.js';
import { readFileAsText } from '../../utils/download.js';
import './ImportHistory.css';

const NEW_BOOK = '__novo__';

/**
 * Importação do histórico anotado à mão: escolher o arquivo → conferir a
 * pré-visualização (ano, livros, duplicatas, divergências) → confirmar.
 * Nada é gravado antes de "Confirmar importação".
 */
export default function ImportHistoryPage() {
  const ROUTES = usePaths(); // caminhos do espaço atual (/app ou /demo)
  useDocumentTitle('Importar histórico');
  const { books, sessions, actions, storage } = useData();
  const backend = useBackend();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef(null);
  // Arquivo encaminhado pelo "Importar JSON" das Configurações: já entra na prévia.
  const location = useLocation();
  const [forwarded] = useState(() => {
    const text = location.state?.historyText;
    if (!text) return null;
    const parsed = parseHistoryFile(text);
    return parsed.ok ? { name: location.state.fileName ?? 'arquivo', data: parsed.data } : null;
  });
  const [file, setFile] = useState(forwarded); // { name, data }
  const [fileError, setFileError] = useState(null);
  const [year, setYear] = useState(String(DEFAULT_IMPORT_YEAR));
  const [choices, setChoices] = useState({});
  const [result, setResult] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);

  const eligibleBooks = useMemo(() => books.filter((b) => !b.addedAsRead), [books]);
  const plan = useMemo(
    () => (file ? buildImportPlan(file.data, { year, books, sessions, choices }) : null),
    [file, year, books, sessions, choices],
  );

  // Erros que não são de um livro específico (ano, datas no futuro, arquivo).
  const bookErrors = new Set(plan?.books.flatMap((b) => b.errors) ?? []);
  const generalError = plan?.errors.find((e) => !bookErrors.has(e));

  const onFile = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setBusy(true);
    setFileError(null);
    setResult(null);
    setCancelled(false);
    try {
      const parsed = parseHistoryFile(await readFileAsText(chosen));
      if (!parsed.ok) setFileError(`“${chosen.name}”: ${parsed.error}`);
      else {
        setFile({ name: chosen.name, data: parsed.data });
        setChoices({});
      }
    } catch (error) {
      setFileError(`Não foi possível ler “${chosen.name}”: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const choose = (index, patch) =>
    setChoices((current) => {
      const base = current[index] ?? plan?.books[index]?.choice ?? { mode: 'new' };
      return { ...current, [index]: { ...base, ...patch } };
    });

  const cancel = () => {
    setFile(null);
    setChoices({});
    setCancelled(true);
  };

  /** Conta: tudo numa única transação no banco; sucesso só depois da confirmação. */
  const confirmRemote = async () => {
    setBusy(true);
    setFileError(null);
    const prepared = actions.prepareHistoryImport(plan);
    const outcome = await backend.importAtomic(prepared.request);
    setBusy(false);
    if (!outcome.ok) {
      setFileError(`O banco não confirmou a importação; nada foi gravado. ${outcome.error}`);
      return;
    }
    toast.success(
      `Salvo na sua conta: ${pluralize(prepared.summary.sessions, 'sessão importada', 'sessões importadas')} e ${pluralize(prepared.summary.books, 'livro novo', 'livros novos')}.`,
    );
    navigate(ROUTES.history);
  };

  const confirm = () => {
    if (!plan?.ready || busy) return;
    if (backend.importAtomic) {
      confirmRemote();
      return;
    }
    setBusy(true);
    const outcome = actions.importHistory(plan);
    setBusy(false);
    setResult({ ...outcome, vocabulary: plan.counts.vocabularyEntries, notes: plan.counts.sessionsWithNotes, divergences: plan.divergences.length });
    setFile(null);
    toast.success(`${pluralize(outcome.sessions, 'sessão importada', 'sessões importadas')}.`);
  };

  return (
    <div className="page import-history">
      <PageHeader
        title="Importar histórico"
        description="Traga as sessões que você anotou antes do ReadTrack. Você confere tudo antes de gravar."
        actions={
          <Button to={ROUTES.history} variant="ghost" icon={History}>
            Voltar ao histórico
          </Button>
        }
      />

      {result && (
        <div className="import-history__done" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <p>
              <strong>Importação concluída.</strong> {pluralize(result.sessions, 'sessão', 'sessões')} e{' '}
              {pluralize(result.books, 'livro novo', 'livros novos')}
              {result.notes ? `; ${pluralize(result.notes, 'sessão', 'sessões')} com notas (${pluralize(result.vocabulary, 'palavra')} de vocabulário)` : ''}.
              {storage.mode === 'remote' ? ' Os dados estão sendo enviados para a sua conta: espere o indicador “Salvo na sua conta” antes de fechar a aba.' : ' Os dados foram salvos neste navegador.'}
            </p>
            <Button to={ROUTES.history} size="sm" variant="secondary">
              Ver no histórico
            </Button>
          </div>
        </div>
      )}
      {cancelled && !file && (
        <p className="import-history__muted" role="status">
          Importação cancelada. Nada foi gravado.
        </p>
      )}

      {!file && (
        <Panel title="1. Escolha o arquivo">
          <p className="import-history__text">
            Use um arquivo no formato de histórico do ReadTrack (<code>readtrack-history-import</code>; o README mostra um modelo).
            Nada é gravado antes de você conferir a prévia e confirmar.
          </p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onFile} />
          <div className="import-history__actions">
            <Button icon={Upload} onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Lendo arquivo…' : 'Escolher arquivo'}
            </Button>
          </div>
          {fileError && (
            <p className="form-alert" role="alert">
              {fileError} Nada foi alterado.
            </p>
          )}
        </Panel>
      )}

      {file && plan && (
        <>
          <Panel title="2. Confira antes de importar">
            <p className="import-history__text">
              Arquivo: <strong>{file.name}</strong>. As anotações não têm ano: confirme o ano de todas as datas.
            </p>
            <div className="import-history__year">
              <Field label="Ano das anotações" required error={generalError}>
                <input name="year" className="input input--number" inputMode="numeric" pattern="[0-9]*" value={year} onChange={(e) => setYear(e.target.value)} />
              </Field>
            </div>

            <ul className="import-history__books">
              {plan.books.map((entry) => {
                const choice = choices[entry.index] ?? entry.choice;
                const value = choice.mode === 'existing' ? choice.bookId : NEW_BOOK;
                return (
                  <li key={entry.index} className="import-history__book">
                    <h3>{entry.title}</h3>
                    <p className="import-history__muted">
                      {pluralize(entry.sessionCount, 'sessão', 'sessões')} · páginas {entry.minPage} a {entry.maxPage}
                      {entry.bookId && ` · ${pluralize(entry.newSessions ?? 0, 'nova', 'novas')}`}
                      {entry.duplicateSessions ? `, ${pluralize(entry.duplicateSessions, 'já importada', 'já importadas')}` : ''}
                    </p>
                    <Field label="Livro na sua biblioteca">
                      <select
                        name={`book-${entry.index}`}
                        className="select"
                        value={value}
                        onChange={(e) =>
                          choose(entry.index, e.target.value === NEW_BOOK ? { mode: 'new', bookId: undefined } : { mode: 'existing', bookId: e.target.value })
                        }
                      >
                        <option value={NEW_BOOK}>Criar livro novo “{entry.title}”</option>
                        {eligibleBooks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                            {entry.match?.id === b.id ? ' (mesmo título)' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {choice.mode === 'new' && (
                      <div className="import-history__new-book">
                        <Field label="Total de páginas" hint={`Opcional: não está nas anotações. Em branco, fica “não informado”. Se souber, pelo menos ${entry.maxPage}.`}>
                          <input
                            name={`total-${entry.index}`}
                            className="input input--number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={choice.totalPages ?? ''}
                            onChange={(e) => choose(entry.index, { totalPages: e.target.value })}
                          />
                        </Field>
                        <Field label="Página inicial da leitura" hint="Página impressa onde o texto começa (opcional).">
                          <input
                            name={`start-${entry.index}`}
                            className="input input--number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={choice.contentStartPage ?? ''}
                            onChange={(e) => choose(entry.index, { contentStartPage: e.target.value })}
                          />
                        </Field>
                        <p className="import-history__muted">O livro entra como “Lendo”: nada indica que foi concluído, nem quando.</p>
                      </div>
                    )}
                    {entry.errors.length > 0 && (
                      <ul className="form-alert import-history__errors" role="alert">
                        {entry.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="3. Resumo">
            <dl className="import-history__summary tabular">
              <div>
                <dt>Livros novos</dt>
                <dd>{formatNumber(plan.counts.booksToCreate)}</dd>
              </div>
              <div>
                <dt>Sessões a importar</dt>
                <dd>{formatNumber(plan.counts.sessions)}</dd>
              </div>
              <div>
                <dt>Sessões com notas</dt>
                <dd>{formatNumber(plan.counts.sessionsWithNotes)}</dd>
              </div>
              <div>
                <dt>Palavras de vocabulário</dt>
                <dd>{formatNumber(plan.counts.vocabularyEntries)}</dd>
              </div>
              <div>
                <dt>Já importadas (puladas)</dt>
                <dd>{formatNumber(plan.counts.duplicates)}</dd>
              </div>
            </dl>

            {plan.divergences.length > 0 && (
              <details className="import-history__details">
                <summary>
                  <TriangleAlert size={15} aria-hidden="true" /> {pluralize(plan.divergences.length, 'sessão tem', 'sessões têm')} duração anotada diferente
                  dos horários
                </summary>
                <p className="import-history__muted">
                  A duração anotada é preservada e é a usada nas estatísticas. Nada é corrigido; depois você pode editar cada sessão.
                </p>
                <ul>
                  {plan.divergences.map((d) => (
                    <li key={`${d.book}-${d.label}`} className="tabular">
                      {d.book} · {d.label}: anotada <strong>{formatDurationText(d.recorded)}</strong>, pelos horários{' '}
                      {formatDurationText(d.calculated)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {plan.duplicates.length > 0 && (
              <details className="import-history__details">
                <summary>{pluralize(plan.duplicates.length, 'sessão já existe', 'sessões já existem')} e não será importada de novo</summary>
                <ul>
                  {plan.duplicates.map((d) => (
                    <li key={`${d.book}-${d.label}`}>
                      {d.book} · {d.label}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {!plan.ready && plan.errors.length > 0 && (
              <p className="form-alert" role="alert">
                Corrija {pluralize(plan.errors.length, 'item', 'itens')} acima para poder importar.
              </p>
            )}
            {plan.ready && plan.counts.sessions === 0 && (
              <p className="import-history__muted" role="status">
                Todas as sessões deste arquivo já estão no ReadTrack. Não há nada novo para importar.
              </p>
            )}

            <p className="import-history__muted">
              Tudo é gravado de uma vez: ou entram todas as sessões, ou nenhuma.
              {storage.mode === 'remote' && ' Na conta, a gravação é uma única transação no banco: se algo falhar, nada muda.'}
            </p>
            {fileError && (
              <p className="form-alert" role="alert">
                {fileError}
              </p>
            )}
            <div className="import-history__actions">
              <Button variant="ghost" icon={X} onClick={cancel} disabled={busy}>
                Cancelar
              </Button>
              <Button icon={FileUp} onClick={confirm} disabled={!plan.ready || plan.counts.sessions === 0 || busy}>
                {busy ? 'Salvando…' : 'Confirmar importação'}
              </Button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
