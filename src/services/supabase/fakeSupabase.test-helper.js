/**
 * Cliente falso do Supabase, em memória, só para testes unitários.
 * Implementa o subconjunto da API usado pelo repositório:
 *   from(t).select().eq().in().order().range().maybeSingle()
 *   from(t).upsert(rows, { onConflict, ignoreDuplicates })
 *   from(t).delete().eq().in()
 * Também registra cada chamada para os testes conferirem filtros e opções.
 * (A integração com o Supabase real é testada à parte, contra PostgREST.)
 */
export function createFakeSupabase({ pageLimit = 1000 } = {}) {
  const tables = new Map();
  const log = [];
  let failure = null;

  const rowsOf = (table) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table);
  };

  function builder(table) {
    const state = { table, op: 'select', filters: [], range: null, order: null, single: false, payload: null, options: {} };
    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        state.filters.push((row) => row[column] === value);
        state.eqs = [...(state.eqs ?? []), column];
        return api;
      },
      in(column, values) {
        state.filters.push((row) => values.includes(row[column]));
        return api;
      },
      order(column) {
        state.order = column;
        return api;
      },
      range(from, to) {
        state.range = [from, to];
        return api;
      },
      maybeSingle() {
        state.single = true;
        return api;
      },
      upsert(payload, options = {}) {
        state.op = 'upsert';
        state.payload = Array.isArray(payload) ? payload : [payload];
        state.options = options;
        return api;
      },
      delete() {
        state.op = 'delete';
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve().then(() => execute(state)).then(resolve, reject);
      },
    };
    return api;
  }

  function execute(state) {
    log.push({ table: state.table, op: state.op, eqs: state.eqs ?? [], options: state.options, size: state.payload?.length ?? 0 });
    if (failure) {
      const f = typeof failure === 'function' ? failure(state) : failure;
      if (f) return { data: null, error: f };
    }
    const rows = rowsOf(state.table);
    const match = (row) => state.filters.every((f) => f(row));
    if (state.op === 'select') {
      let out = rows.filter(match);
      if (state.order) out = [...out].sort((a, b) => String(a[state.order]).localeCompare(String(b[state.order])));
      if (state.single) return { data: out[0] ?? null, error: null };
      const [from, to] = state.range ?? [0, Infinity];
      return { data: out.slice(from, Math.min(to + 1, from + pageLimit)), error: null };
    }
    if (state.op === 'delete') {
      const keep = rows.filter((row) => !match(row));
      tables.set(state.table, keep);
      return { data: null, error: null };
    }
    const keys = String(state.options.onConflict ?? 'id').split(',');
    for (const incoming of state.payload) {
      const index = rows.findIndex((row) => keys.every((k) => row[k] === incoming[k]));
      if (index === -1) rows.push({ ...incoming });
      else if (!state.options.ignoreDuplicates) rows[index] = { ...rows[index], ...incoming };
    }
    return { data: null, error: null };
  }

  return {
    from: (table) => builder(table),
    tables,
    log,
    rows: (table) => rowsOf(table),
    /** Faz as próximas chamadas falharem (objeto de erro ou função (state) → erro|null). */
    setFailure(value) {
      failure = value;
    },
  };
}
