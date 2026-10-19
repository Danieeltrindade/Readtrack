-- =====================================================================
-- ReadTrack — verificação das políticas RLS
--
-- Rode DEPOIS de supabase/schema.sql, no SQL Editor do Supabase.
-- (Simula dois usuários, A e B, e confere o isolamento entre as contas.)
-- Tudo acontece dentro de uma transação desfeita no final (ROLLBACK):
-- os dois usuários de teste e seus dados não ficam no banco.
--
-- Se alguma regra falhar, o script para com "FALHOU: ...".
-- Se tudo passar, a última linha mostra "RLS OK: N verificações".
-- =====================================================================
begin;

create temporary table _rls_result (n int not null default 0) on commit drop;
insert into _rls_result values (0);
grant all on _rls_result to authenticated, anon;

create or replace function pg_temp.ok(passed boolean, label text) returns void
language plpgsql as $$
begin
  if not coalesce(passed, false) then
    raise exception 'FALHOU: %', label;
  end if;
  update _rls_result set n = n + 1;
end;
$$;

-- Simula o usuário logado como o PostgREST faz (papel + claims do JWT).
create or replace function pg_temp.act_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Dois usuários de teste (o gatilho cria os perfis).
insert into auth.users (id, email, aud, role, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.test', 'authenticated', 'authenticated', now(), now()),
       ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.test', 'authenticated', 'authenticated', now(), now());

select pg_temp.ok((select count(*) = 2 from public.profiles
  where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b')),
  'o gatilho cria um perfil para cada novo usuário');

-- ---------- Usuário A cria dados ----------
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');

insert into public.books (id, title, author, total_pages, current_page, status, started_at)
values ('book_a1', 'Livro de A', 'Autora', 200, 30, 'reading', now() - interval '2 days');

insert into public.reading_sessions (id, book_id, started_at, finished_at, duration_seconds,
  start_page, end_page, pages_read, new_pages, notes)
values ('session_a1', 'book_a1', now() - interval '1 hour', now() - interval '30 minutes', 1800, 0, 30, 30, 30, 'nota de A');

select pg_temp.ok((select user_id from public.books where id = 'book_a1') = '00000000-0000-4000-8000-00000000000a',
  'user_id é preenchido com auth.uid() por padrão');
select pg_temp.ok((select count(*) = 1 from public.books), 'A vê o próprio livro');
select pg_temp.ok((select count(*) = 1 from public.profiles), 'A vê apenas o próprio perfil');

-- ---------- Usuário B não enxerga nem altera dados de A ----------
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');

select pg_temp.ok((select count(*) = 0 from public.books), 'B não lê livros de A');
select pg_temp.ok((select count(*) = 0 from public.reading_sessions), 'B não lê sessões de A');
select pg_temp.ok((select count(*) = 1 from public.profiles), 'B não lê o perfil de A');

with changed as (update public.books set title = 'invadido' where id = 'book_a1' returning 1)
select pg_temp.ok((select count(*) = 0 from changed), 'B não altera livros de A');

with removed as (delete from public.reading_sessions where id = 'session_a1' returning 1)
select pg_temp.ok((select count(*) = 0 from removed), 'B não exclui sessões de A');

with changed as (update public.profiles set display_name = 'invadido'
  where id = '00000000-0000-4000-8000-00000000000a' returning 1)
select pg_temp.ok((select count(*) = 0 from changed), 'B não altera o perfil de A');

-- B tenta gravar uma linha em nome de A → bloqueado pela política (WITH CHECK).
do $$
begin
  insert into public.books (user_id, id, title, total_pages)
  values ('00000000-0000-4000-8000-00000000000a', 'book_forjado', 'Forjado', 10);
  raise exception 'FALHOU: B conseguiu inserir um livro com o user_id de A';
exception when insufficient_privilege then
  perform pg_temp.ok(true, 'B não insere linhas em nome de A');
end;
$$;

-- B tenta ligar uma sessão ao livro de A → a chave estrangeira composta impede.
do $$
begin
  insert into public.reading_sessions (id, book_id, started_at, finished_at, duration_seconds,
    start_page, end_page, pages_read, new_pages)
  values ('session_b_x', 'book_a1', now(), now(), 60, 0, 1, 1, 1);
  raise exception 'FALHOU: B ligou uma sessão ao livro de A';
exception when foreign_key_violation then
  perform pg_temp.ok(true, 'B não cria sessão para o livro de A');
end;
$$;

-- Ids iguais em contas diferentes não colidem (chave primária = user_id + id).
insert into public.books (id, title, author, total_pages) values ('book_a1', 'Livro de B com o mesmo id', 'X', 50);
select pg_temp.ok((select count(*) = 1 from public.books), 'B tem seu próprio book_a1, separado do de A');

-- ---------- Regras de integridade ----------
do $$
begin
  insert into public.books (id, title, total_pages, current_page) values ('book_bad', 'Ruim', 10, 11);
  raise exception 'FALHOU: aceitou página atual maior que o total';
exception when check_violation then
  perform pg_temp.ok(true, 'página atual não passa do total');
end;
$$;

do $$
begin
  insert into public.books (id, title, total_pages, rating) values ('book_bad2', 'Ruim', 10, 6);
  raise exception 'FALHOU: aceitou avaliação 6';
exception when check_violation then
  perform pg_temp.ok(true, 'avaliação fica entre 1 e 5');
end;
$$;

do $$
begin
  insert into public.reading_sessions (id, book_id, started_at, finished_at, duration_seconds,
    start_page, end_page, pages_read, new_pages)
  values ('session_bad', 'book_a1', now(), now(), 60, 10, 20, 15, 0);
  raise exception 'FALHOU: aceitou pages_read diferente de end_page - start_page';
exception when check_violation then
  perform pg_temp.ok(true, 'páginas lidas = página final − inicial');
end;
$$;

insert into public.books (id, title, status, added_as_read) values ('book_ja_lido', 'Lido antes', 'finished', true);
select pg_temp.ok((select total_pages is null from public.books where id = 'book_ja_lido'), 'livro já lido aceita total de páginas vazio');

-- v1.4: livro comum pode ter o total "não informado" (anotações importadas)…
insert into public.books (id, title, status, current_page) values ('book_sem_paginas', 'Sem páginas', 'reading', 387);
select pg_temp.ok((select total_pages is null and current_page = 387 from public.books where id = 'book_sem_paginas'), 'livro comum aceita total não informado (sem inventar)');
-- …mas, quando o total existe, a página atual continua limitada a ele.
do $$
begin
  insert into public.books (id, title, total_pages, current_page) values ('book_bad3', 'Ruim', 100, 387);
  raise exception 'FALHOU: aceitou página atual maior que o total';
exception when check_violation then
  perform pg_temp.ok(true, 'com total informado, página atual ≤ total');
end;
$$;

-- v1.4: registro manual sem término nem duração é aceito; cronômetro, não.
insert into public.reading_sessions (id, book_id, started_at, start_page, end_page, pages_read, new_pages, source, vocabulary)
values ('session_manual_b', 'book_a1', now() - interval '3 days', 9, 14, 6, 6, 'manual', '[{"term":"Estela","meaning":"Monumento"}]');
select pg_temp.ok((select pages_read = 6 and duration_seconds is null from public.reading_sessions where id = 'session_manual_b'),
  'sessão manual: intervalo inclusivo (9–14 = 6) e duração desconhecida aceita');

do $$
begin
  insert into public.reading_sessions (id, book_id, started_at, start_page, end_page, pages_read, new_pages)
  values ('session_timer_incompleta', 'book_a1', now(), 0, 5, 5, 5);
  raise exception 'FALHOU: aceitou sessão do cronômetro sem término e duração';
exception when check_violation then
  perform pg_temp.ok(true, 'sessão do cronômetro exige término e duração');
end;
$$;

do $$
begin
  insert into public.reading_sessions (id, book_id, started_at, finished_at, start_page, end_page, pages_read, new_pages, source)
  values ('session_manual_volta', 'book_a1', now(), now() - interval '1 hour', 1, 2, 2, 2, 'manual');
  raise exception 'FALHOU: aceitou término antes do início';
exception when check_violation then
  perform pg_temp.ok(true, 'registro manual: término não pode ser antes do início');
end;
$$;

-- ---------- v1.6.0: dados de demonstração não entram em contas ----------
do $$
begin
  insert into public.books (id, title, total_pages, is_demo) values ('demo_book_x', 'Demo', 10, true);
  raise exception 'FALHOU: aceitou um livro marcado como demonstração';
exception when check_violation then
  perform pg_temp.ok(true, 'o banco recusa registros de demonstração');
end;
$$;

-- ---------- v1.6.0: importação atômica (import_backup) ----------
-- B substitui a PRÓPRIA conta por um backup que traz o user_id de A no arquivo:
-- o user_id do arquivo é ignorado e nada de A é tocado.
select pg_temp.ok(
  (public.import_backup(
    'replace',
    '[{"user_id":"00000000-0000-4000-8000-00000000000a","id":"book_imp","title":"Importado","total_pages":100,"current_page":10,"status":"reading"}]',
    '[{"user_id":"00000000-0000-4000-8000-00000000000a","id":"session_imp","book_id":"book_imp","started_at":"2026-10-01T10:00:00Z","finished_at":"2026-10-01T10:20:00Z","duration_seconds":1200,"start_page":0,"end_page":10,"pages_read":10,"new_pages":10,"source":"timer"}]'
  ) ->> 'sessions')::int = 1,
  'B importa (substituir) um backup com 1 livro e 1 sessão');
select pg_temp.ok((select count(*) = 1 and bool_and(user_id = '00000000-0000-4000-8000-00000000000b') from public.books),
  'a importação grava tudo com o user_id de quem está logado (B)');

-- Atomicidade: uma sessão inválida no meio desfaz o livro do mesmo lote.
do $$
begin
  perform public.import_backup(
    'merge',
    '[{"id":"book_atomico","title":"Não pode ficar","total_pages":50}]',
    '[{"id":"session_ruim","book_id":"book_atomico","started_at":"2026-10-02T10:00:00Z","finished_at":"2026-10-02T10:10:00Z","duration_seconds":600,"start_page":0,"end_page":10,"pages_read":99,"new_pages":0}]'
  );
  raise exception 'FALHOU: a importação aceitou uma sessão inválida';
exception when check_violation then
  perform pg_temp.ok(true, 'importação com registro inválido é recusada');
end;
$$;
select pg_temp.ok((select count(*) = 0 from public.books where id = 'book_atomico'), 'nada do lote recusado fica gravado (tudo ou nada)');

-- Acrescentar não duplica: o mesmo id atualiza a linha existente da PRÓPRIA conta.
select public.import_backup('merge', '[{"id":"book_imp","title":"Importado","total_pages":100,"current_page":40,"status":"reading"}]', '[]');
select pg_temp.ok((select count(*) = 1 and max(current_page) = 40 from public.books where id = 'book_imp'),
  'acrescentar com o mesmo id não duplica (atualiza o progresso do livro)');

do $$
begin
  perform public.import_backup('merge', '[{"id":"demo_book_y","title":"Demo","total_pages":10,"is_demo":true}]', '[]');
  raise exception 'FALHOU: a importação aceitou dados de demonstração';
exception when check_violation then
  perform pg_temp.ok(true, 'a importação recusa dados de demonstração');
end;
$$;

-- A continua intacto depois de tudo o que B fez.
reset role;
select pg_temp.ok((select count(*) = 1 from public.books where user_id = '00000000-0000-4000-8000-00000000000a' and id = 'book_a1' and title = 'Livro de A'),
  'o livro de A continua intacto');
select pg_temp.ok((select count(*) = 1 from public.reading_sessions where user_id = '00000000-0000-4000-8000-00000000000a'),
  'a sessão de A continua intacta');

-- ---------- Visitante sem login (anon) ----------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  perform count(*) from public.books;
  raise exception 'FALHOU: anon conseguiu ler a tabela books';
exception when insufficient_privilege then
  perform pg_temp.ok(true, 'visitante sem login não acessa os livros');
end;
$$;
do $$
begin
  perform public.import_backup('merge', '[]', '[]');
  raise exception 'FALHOU: anon conseguiu executar import_backup';
exception when insufficient_privilege then
  perform pg_temp.ok(true, 'visitante sem login não executa a importação');
end;
$$;
do $$
begin
  perform count(*) from public.reading_sessions;
  raise exception 'FALHOU: anon conseguiu ler as sessões';
exception when insufficient_privilege then
  perform pg_temp.ok(true, 'visitante sem login não acessa as sessões');
end;
$$;

-- ---------- Exclusão em cascata ----------
reset role;
delete from public.books where user_id = '00000000-0000-4000-8000-00000000000a' and id = 'book_a1';
select pg_temp.ok((select count(*) = 0 from public.reading_sessions where user_id = '00000000-0000-4000-8000-00000000000a'),
  'excluir o livro exclui as sessões dele');

select 'RLS OK: ' || n || ' verificações' as resultado from _rls_result;

rollback;
