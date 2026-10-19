// Gera o SQL que carrega o histórico anotado em UMA conta do Supabase.
//
//   node scripts/build-history-sql.mjs <email-da-conta> <ano> <historico.json> <saida.sql>
//
// ALTERNATIVA AVANÇADA (rodada no SQL Editor, como administrador). O caminho
// recomendado é importar pela própria tela, logado na conta. Guarde o
// histórico e o SQL gerado FORA do repositório (veja .gitignore).
//
// Usa exatamente a mesma conversão da tela "Importar histórico" (mesmos ids,
// datas, páginas, durações anotadas, notas e vocabulário). Por isso, rodar o
// SQL e depois importar pela tela (ou o contrário) NÃO duplica nada.
// Nenhum total de páginas, autor ou data de conclusão é inventado.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildImportPlan, parseHistoryFile } from '../src/services/historyImport/historyImport.js';
import { createEmptyData } from '../src/services/storage/schema.js';
import { dataReducer, ACTIONS } from '../src/context/dataReducer.js';
import { bookToRow, sessionToRow } from '../src/services/supabase/mappers.js';

const [email, yearArg, input, output] = process.argv.slice(2);
if (!email || !email.includes('@') || !yearArg || !input || !output) {
  console.error('Uso: node scripts/build-history-sql.mjs <email-da-conta> <ano> <historico.json> <saida.sql>');
  process.exit(1);
}

const parsed = parseHistoryFile(readFileSync(input, 'utf8'));
if (!parsed.ok) throw new Error(parsed.error);
const now = new Date();
const plan = buildImportPlan(parsed.data, { year: Number(yearArg), books: [], sessions: [], now });
if (!plan.ready) throw new Error(plan.errors.join('\n'));
// Mesmo caminho da tela: o redutor calcula página atual, status "Lendo",
// data de início e páginas novas a partir das sessões.
const state = dataReducer(createEmptyData(), { type: ACTIONS.ADD_SESSIONS, payload: { books: plan.newBooks, sessions: plan.sessions, now } });

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const json = (v) => `${q(JSON.stringify(v))}::jsonb`;
const num = (v) => (v === null || v === undefined ? 'null' : String(Number(v)));
const ts = (v) => (v ? `${q(v)}::timestamptz` : 'null');

const lines = [];
const out = (s = '') => lines.push(s);
out(`-- ReadTrack 1.4 · Carga do histórico anotado (${plan.counts.sessions} sessões, ${state.books.length} livros) em UMA conta.`);
out('-- Gerado por scripts/build-history-sql.mjs a partir de ' + input + ` (ano ${plan.year}).`);
out('--');
out('-- COMO USAR: Supabase → SQL Editor → cole este arquivo inteiro → Run.');
out('--   • A conta precisa existir (crie no ReadTrack antes) e ter este e-mail:');
out(`--       ${email}`);
out('--   • Só a conta desse e-mail recebe os dados (user_id dela). Nenhum outro usuário é tocado.');
out('--   • Tudo ou nada: se algo falhar, nada é gravado.');
out('--   • Pode rodar de novo: o que já existe é pulado (mesmo id, ou mesmo livro + início + páginas).');
out('--   • Se você já tiver um livro com o mesmo título, as sessões vão para ele.');
out('--   • Nada é inventado: total de páginas, autor e data de conclusão ficam em branco;');
out('--     os livros entram como "Lendo". A duração anotada é gravada como foi escrita.');
out('--');
out('-- Segurança: o SQL Editor roda como dono do projeto (fora da RLS) — por isso o script');
out('-- grava explicitamente o user_id da sua conta. Nenhuma chave vai para o frontend.');
out('');
out('create temp table if not exists readtrack_carga (item text, quantidade integer) on commit preserve rows;');
out('truncate readtrack_carga;');
out('');
out('do $$');
out('declare');
out(`  v_email text := ${q(email)};`);
out('  v_uid uuid;');
state.books.forEach((_, i) => out(`  v_book${i} text;`));
out('  v_n integer;');
out('  v_books_new integer := 0;');
out('  v_sessions_new integer := 0;');
out('  v_sessions_skipped integer := 0;');
out('begin');
out('  select id into v_uid from auth.users where lower(email) = lower(v_email);');
out("  if v_uid is null then raise exception 'Nenhuma conta com o e-mail %. Crie a conta no ReadTrack e rode de novo.', v_email; end if;");
out('');

state.books.forEach((book, i) => {
  const r = bookToRow(book, null);
  const bookSessions = state.sessions.filter((s) => s.bookId === book.id);
  const maxEnd = Math.max(...bookSessions.map((s) => s.endPage));
  const firstStart = bookSessions.map((s) => s.startedAt).sort()[0];
  out(`  -- Livro: ${book.title} (${bookSessions.length} sessões)`);
  out(`  select id into v_book${i} from public.books where user_id = v_uid and lower(btrim(title)) = lower(${q(book.title)}) order by created_at limit 1;`);
  out(`  if v_book${i} is null then`);
  out(`    v_book${i} := ${q(book.id)};`);
  out('    insert into public.books (user_id, id, title, author, description, cover_url, cover_color, total_pages, added_as_read, content_start_page,');
  out('                              current_page, status, started_at, finished_at, rating, review, learnings, is_demo)');
  out(
    `    values (v_uid, v_book${i}, ${q(r.title)}, ${q(r.author)}, ${q(r.description)}, ${q(r.cover_url)}, ${q(r.cover_color)}, ${num(r.total_pages)}, false, ${num(r.content_start_page)},`,
  );
  out(`            ${num(r.current_page)}, ${q(r.status)}, ${ts(r.started_at)}, null, null, '', '', false);`);
  out('    v_books_new := v_books_new + 1;');
  out('  end if;');
  out('');
  for (const s of bookSessions) {
    const row = sessionToRow(s, null);
    out(
      `  insert into public.reading_sessions (user_id, id, book_id, started_at, finished_at, duration_seconds, paused_seconds, pause_count, segments, start_page, end_page, pages_read, new_pages, notes, source, vocabulary, is_demo)`,
    );
    out(
      `  select v_uid, ${q(row.id)}, v_book${i}, ${ts(row.started_at)}, ${ts(row.finished_at)}, ${num(row.duration_seconds)}, 0, 0, '[]'::jsonb, ${row.start_page}, ${row.end_page}, ${row.pages_read}, ${row.new_pages}, ${q(row.notes)}, 'manual', ${json(row.vocabulary)}, false`,
    );
    out(
      `  where not exists (select 1 from public.reading_sessions x where x.user_id = v_uid and (x.id = ${q(row.id)} or (x.book_id = v_book${i} and x.started_at = ${ts(row.started_at)} and x.start_page = ${row.start_page} and x.end_page = ${row.end_page})));`,
    );
    out('  get diagnostics v_n = row_count; v_sessions_new := v_sessions_new + v_n; v_sessions_skipped := v_sessions_skipped + 1 - v_n;');
  }
  out('');
  out('  -- Livro já existente: só avança a página atual e "Quero ler" → "Lendo" (nunca conclui nem recua).');
  out(`  update public.books set current_page = greatest(current_page, ${maxEnd}),`);
  out(`         status = case when status = 'want-to-read' then 'reading' else status end,`);
  out(`         started_at = least(coalesce(started_at, ${ts(firstStart)}), ${ts(firstStart)})`);
  out(`   where user_id = v_uid and id = v_book${i} and status <> 'finished' and (total_pages is null or total_pages >= ${maxEnd})`);
  out(`     and (current_page < ${maxEnd} or status = 'want-to-read' or started_at is null or started_at > ${ts(firstStart)});`);
  out('');
});

out("  insert into readtrack_carga values ('livros criados', v_books_new), ('sessões gravadas agora', v_sessions_new), ('sessões que já existiam (puladas)', v_sessions_skipped);");
out('end;');
out('$$;');
out('');
out('-- Resultado desta execução e o que a conta tem agora:');
out('select * from readtrack_carga');
out('union all');
out(`select 'total na conta: ' || b.title, count(s.id)::integer from public.books b`);
out('  join auth.users u on u.id = b.user_id');
out('  left join public.reading_sessions s on s.user_id = b.user_id and s.book_id = b.id');
out(`  where lower(u.email) = lower(${q(email)}) and b.title in (${state.books.map((b) => q(b.title)).join(', ')})`);
out('  group by b.title;');

writeFileSync(output, lines.join('\n') + '\n');
console.log(`${output}: ${state.books.length} livros, ${plan.counts.sessions} sessões, ${plan.counts.vocabularyEntries} palavras de vocabulário, ano ${plan.year}.`);
