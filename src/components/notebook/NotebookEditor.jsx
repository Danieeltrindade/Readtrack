import { useState } from 'react';
import { AlignLeft, CircleHelp, Languages, Lightbulb, Plus, Quote, X } from 'lucide-react';
import { Button } from '../ui';
import { ANCHOR_KINDS, NOTEBOOK_LABELS, NOTEBOOK_TABS, formatAnchor } from '../../utils/annotations.js';
import { flushNotebookPending } from './notebookPending.js';
import { LIMITS, parseVocabularyText } from '../../utils/validation.js';
import './Notebook.css';

const TAB_ICONS = { summary: AlignLeft, quote: Quote, word: Languages, idea: Lightbulb, question: CircleHelp };

const COPY = {
  quote: { field: 'Trecho', placeholder: 'Copie o trecho como está no livro', extra: 'Comentário', extraPlaceholder: 'Por que chamou atenção?', add: 'Adicionar citação', empty: 'Nenhuma citação nesta sessão.' },
  word: { field: 'Palavra', placeholder: 'Ex.: agregado', extra: 'Significado', extraPlaceholder: 'O que quer dizer neste contexto', add: 'Adicionar palavra', empty: 'Nenhuma palavra nova.' },
  idea: { field: 'Ideia', placeholder: 'Uma interpretação, ligação ou opinião', add: 'Adicionar ideia', empty: 'Nenhuma ideia ainda.' },
  question: { field: 'Dúvida', placeholder: 'O que ficou sem entender?', add: 'Adicionar dúvida', empty: 'Nenhuma dúvida.' },
};

const ANCHOR_COPY = {
  [ANCHOR_KINDS.PAGE]: { label: 'Página', placeholder: 'Ex.: 124', inputMode: 'numeric' },
  [ANCHOR_KINDS.PERCENT]: { label: '%', placeholder: 'Ex.: 45', inputMode: 'numeric' },
  [ANCHOR_KINDS.TIME]: { label: 'Momento', placeholder: 'Ex.: 1:02:30', inputMode: 'text' },
};

const EMPTY_DRAFT = { anchorText: '', text: '', extra: '' };

/**
 * Caderno da sessão: abas Resumo, Citações, Vocabulário, Ideias e Dúvidas.
 * Tudo é opcional. `value` = { notes, vocabulary, annotations, pending };
 * `onChange(patch)` recebe só o que mudou.
 *
 * O que está sendo digitado (ainda sem "Adicionar") fica em `value.pending`,
 * no estado do formulário pai: assim entra no rascunho da sessão e é
 * acrescentado ao salvar (flushNotebookPending) — nada se perde.
 */
export function NotebookEditor({ value, onChange, anchorKind = ANCHOR_KINDS.PAGE, errors = {}, idPrefix = 'nb' }) {
  const [tab, setTab] = useState(value.pending?.type ?? 'summary');
  const [draftError, setDraftError] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const draft = value.pending && value.pending.type === tab ? value.pending : EMPTY_DRAFT;
  const setDraft = (update) => onChange({ pending: { ...update(draft), type: tab } });

  const vocabulary = value.vocabulary ?? [];
  const annotations = value.annotations ?? [];
  const counts = {
    summary: value.notes ? 1 : 0,
    word: vocabulary.length,
    quote: annotations.filter((a) => a.type === 'quote').length,
    idea: annotations.filter((a) => a.type === 'idea').length,
    question: annotations.filter((a) => a.type === 'question').length,
  };

  const pick = (id) => {
    // Trocar de aba guarda o que já foi digitado (se estiver válido).
    const flushed = flushNotebookPending(value, anchorKind);
    if (flushed.error) {
      setDraftError(flushed.error);
      return;
    }
    onChange({ ...flushed.patch, pending: null });
    setTab(id);
    setDraftError(null);
  };

  const add = () => {
    const flushed = flushNotebookPending({ ...value, pending: { ...draft, type: tab } }, anchorKind, { requireText: true });
    if (flushed.error) {
      setDraftError(flushed.error);
      return;
    }
    // A âncora fica: a próxima anotação costuma ser perto da anterior.
    onChange({ ...flushed.patch, pending: { ...EMPTY_DRAFT, anchorText: draft.anchorText, type: tab } });
    setDraftError(null);
  };

  // Várias palavras de uma vez (ex.: anotações antigas): "palavra: significado" por linha.
  const addBulk = () => {
    const items = parseVocabularyText(bulkText);
    if (items.length === 0) {
      setDraftError('Escreva uma palavra por linha: “palavra: significado”.');
      return;
    }
    onChange({ vocabulary: [...vocabulary, ...items] });
    setBulkText('');
    setBulkOpen(false);
    setDraftError(null);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      add();
    }
  };

  const list =
    tab === 'word'
      ? vocabulary.map((v, i) => ({ key: `w${i}`, text: v.term, extra: v.meaning, anchor: v.anchor, remove: () => onChange({ vocabulary: vocabulary.filter((_, j) => j !== i) }) }))
      : annotations
          .filter((a) => a.type === tab)
          .map((a) => ({
            key: a.id,
            text: a.text,
            extra: a.note,
            anchor: a.anchor,
            resolved: a.resolved,
            toggle:
              a.type === 'question'
                ? () => onChange({ annotations: annotations.map((x) => (x.id === a.id ? { ...x, resolved: !x.resolved } : x)) })
                : null,
            remove: () => onChange({ annotations: annotations.filter((x) => x.id !== a.id) }),
          }));

  const copy = COPY[tab];
  const anchor = ANCHOR_COPY[anchorKind] ?? ANCHOR_COPY.page;
  const panelId = `${idPrefix}-panel`;

  return (
    <section className="notebook" aria-label="Caderno da sessão">
      <div className="notebook__head">
        <h3 className="notebook__title">Caderno da sessão</h3>
        <p className="notebook__hint">Escolha o tipo e anote. Tudo é opcional e aparece também no Caderno.</p>
      </div>

      <div className="notebook__tabs" role="tablist" aria-label="Tipo de anotação">
        {NOTEBOOK_TABS.map((id) => {
          const Icon = TAB_ICONS[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={panelId}
              className={`notebook__tab notebook__tab--${id}`}
              onClick={() => pick(id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{NOTEBOOK_LABELS[id]}</span>
              <span className="notebook__count tabular" aria-label={`${counts[id]} itens`}>
                {counts[id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className={`notebook__panel notebook__panel--${tab}`} role="tabpanel" id={panelId} aria-labelledby={`${idPrefix}-tab-${tab}`}>
        {tab === 'summary' ? (
          <div className="field">
            <label className="field__label" htmlFor={`${idPrefix}-notes`}>
              Observações desta leitura <span className="field__optional">(opcional)</span>
            </label>
            <textarea
              id={`${idPrefix}-notes`}
              name="notes"
              className="textarea"
              rows={4}
              value={value.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Resumo em poucas linhas: o que aconteceu, o que você achou…"
              aria-invalid={errors.notes ? true : undefined}
            />
            {errors.notes ? <p className="field__error">{errors.notes}</p> : <p className="field__hint">{(value.notes ?? '').length}/{LIMITS.notes}</p>}
          </div>
        ) : (
          <>
            {list.length > 0 ? (
              <ul className="notebook__list">
                {list.map((item) => (
                  <li key={item.key} className={`notebook__item ${item.resolved ? 'notebook__item--resolved' : ''}`}>
                    {item.anchor && <span className="notebook__anchor tabular">{formatAnchor(item.anchor)}</span>}
                    <div className="notebook__item-body">
                      <p className={`notebook__item-text notebook__item-text--${tab}`}>{tab === 'quote' ? `“${item.text}”` : item.text}</p>
                      {item.extra && <p className="notebook__item-extra">{item.extra}</p>}
                      {item.toggle && (
                        <label className="check notebook__resolved">
                          <input type="checkbox" checked={Boolean(item.resolved)} onChange={item.toggle} />
                          <span>Resolvida</span>
                        </label>
                      )}
                    </div>
                    <button type="button" className="notebook__remove" onClick={item.remove} aria-label={`Remover “${item.text.slice(0, 40)}”`}>
                      <X size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notebook__empty">{copy.empty}</p>
            )}

            <div className="notebook__form" onKeyDown={onKeyDown}>
              <div className="field notebook__anchor-field">
                <label className="field__label" htmlFor={`${idPrefix}-anchor`}>
                  {anchor.label}
                </label>
                <input
                  id={`${idPrefix}-anchor`}
                  className="input"
                  inputMode={anchor.inputMode}
                  value={draft.anchorText}
                  placeholder={anchor.placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, anchorText: e.target.value }))}
                />
              </div>
              <div className="field notebook__text-field">
                <label className="field__label" htmlFor={`${idPrefix}-text`}>
                  {copy.field}
                </label>
                {tab === 'word' ? (
                  <input id={`${idPrefix}-text`} className="input" value={draft.text} placeholder={copy.placeholder} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                ) : (
                  <textarea id={`${idPrefix}-text`} className="textarea" rows={2} value={draft.text} placeholder={copy.placeholder} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                )}
              </div>
              {copy.extra && (
                <div className="field notebook__extra-field">
                  <label className="field__label" htmlFor={`${idPrefix}-extra`}>
                    {copy.extra} {tab === 'quote' && <span className="field__optional">(opcional)</span>}
                  </label>
                  <input id={`${idPrefix}-extra`} className="input" value={draft.extra} placeholder={copy.extraPlaceholder} onChange={(e) => setDraft((d) => ({ ...d, extra: e.target.value }))} />
                </div>
              )}
              {draftError && (
                <p className="field__error notebook__error" role="alert">
                  {draftError}
                </p>
              )}
              <Button variant="secondary" size="sm" icon={Plus} onClick={add} className="notebook__add">
                {copy.add}
              </Button>
            </div>
            {tab === 'word' && (
              <div className="notebook__bulk">
                {bulkOpen ? (
                  <>
                    <div className="field">
                      <label className="field__label" htmlFor={`${idPrefix}-bulk`}>
                        Várias palavras
                      </label>
                      <textarea
                        id={`${idPrefix}-bulk`}
                        name="vocabularyText"
                        className="textarea"
                        rows={4}
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={'Estela: Monumento histórico.\nRegato: Riacho estreito.'}
                      />
                      <p className="field__hint">Uma palavra por linha: “palavra: significado”.</p>
                    </div>
                    <div className="notebook__bulk-actions">
                      <Button variant="ghost" size="sm" onClick={() => setBulkOpen(false)}>
                        Cancelar
                      </Button>
                      <Button variant="secondary" size="sm" onClick={addBulk}>
                        Adicionar todas
                      </Button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="link-button" onClick={() => setBulkOpen(true)}>
                    Colar várias palavras de uma vez
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {(errors.annotations || errors.vocabularyText) && (
          <p className="field__error" role="alert">
            {errors.annotations || errors.vocabularyText}
          </p>
        )}
      </div>
    </section>
  );
}
