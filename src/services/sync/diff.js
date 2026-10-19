/**
 * Diferença entre dois estados do app → operações para o banco.
 *
 * O reducer continua sendo a fonte da verdade na tela. Para gravar no
 * Supabase, comparamos o último estado CONFIRMADO no banco com o estado
 * atual e enviamos só o que mudou. Como upsert e delete por id são
 * idempotentes, repetir as mesmas operações (nova tentativa após falha)
 * nunca duplica registros.
 *
 * O reducer preserva a identidade dos objetos que não mudaram, então a
 * comparação por referência resolve quase tudo; quando a referência muda,
 * comparamos o conteúdo para não regravar o que é igual.
 */

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

function diffCollection(prev = [], next = [], keyOf = (item) => item.id) {
  const before = new Map(prev.map((item) => [keyOf(item), item]));
  const after = new Map(next.map((item) => [keyOf(item), item]));
  const upsert = [];
  const remove = [];
  for (const [key, item] of after) {
    const old = before.get(key);
    if (!old || !same(old, item)) upsert.push(item);
  }
  for (const key of before.keys()) if (!after.has(key)) remove.push(key);
  return { upsert, remove };
}

const isEmptyCollection = (c) => c.upsert.length === 0 && c.remove.length === 0;

/**
 * @returns {{
 *   profile?: { settings, goals },
 *   books, sessions, achievements: { upsert: object[], remove: string[] },
 *   activeSession?: object | null   // undefined = sem mudança; null = apagar
 * }}
 */
export function diffData(prev, next) {
  const changes = {
    books: diffCollection(prev?.books, next.books),
    sessions: diffCollection(prev?.sessions, next.sessions),
    achievements: diffCollection(prev?.achievements, next.achievements),
  };

  if (!prev || !same(prev.settings, next.settings) || !same(prev.goals, next.goals)) {
    changes.profile = { settings: next.settings, goals: next.goals };
  }

  const prevActive = prev?.activeSession ?? null;
  const nextActive = next.activeSession ?? null;
  if (!same(prevActive, nextActive)) {
    // Objeto = gravar (há no máximo um cronômetro por usuário); null = apagar.
    changes.activeSession = nextActive;
  }

  return changes;
}

export function isEmptyDiff(changes) {
  return (
    !changes.profile &&
    changes.activeSession === undefined &&
    isEmptyCollection(changes.books) &&
    isEmptyCollection(changes.sessions) &&
    isEmptyCollection(changes.achievements)
  );
}
