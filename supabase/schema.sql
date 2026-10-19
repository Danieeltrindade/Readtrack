-- =====================================================================
-- ReadTrack — esquema do banco (Supabase / PostgreSQL)
--
-- Como usar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- O script é idempotente: pode ser executado de novo sem apagar dados.
--
-- Segurança:
-- * Toda tabela tem Row Level Security (RLS) ligada. Cada linha pertence a
--   um usuário (user_id = auth.uid()) e só ele pode ler ou alterar.
-- * O papel "anon" (visitante sem login) não recebe nenhum privilégio.
-- * Sessões de leitura e o cronômetro referenciam o livro por
--   (user_id, book_id): é impossível ligar uma sessão ao livro de outra pessoa.
--
-- O histórico do dicionário (v1.1–v1.2) foi removido na v1.3; para apagar a
-- tabela antiga de um banco existente, rode supabase/cleanup_dictionary.sql.
--
-- Identificadores: livros e sessões usam o id gerado no navegador
-- (ex.: "book_6f1c…"), único por usuário — chave primária (user_id, id).
-- Assim a migração do localStorage pode ser repetida sem duplicar nada.
--
-- Versões: o script acumula as mudanças (v1.1 → v1.6.0) de forma aditiva.
-- Para um banco novo, rode-o uma vez; para atualizar um banco existente,
-- rode a versão nova inteira de novo — nenhum dado é apagado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------

-- updated_at: se o app enviou um valor novo, ele é mantido (ex.: a data da
-- sessão que atualizou o livro); se não mudou, o banco usa o horário atual.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
  elsif new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfil (identificação do usuário, preferências e metas)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null default '' check (char_length(display_name) <= 40),
  week_starts_on     text not null default 'monday' check (week_starts_on in ('monday', 'sunday')),
  text_size          text not null default 'normal' check (text_size in ('normal', 'large')),
  motion             text not null default 'system' check (motion in ('system', 'reduce')),
  daily_minutes_goal integer default 30 check (daily_minutes_goal between 1 and 1440),
  weekly_pages_goal  integer default 150 check (weekly_pages_goal between 1 and 10000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.profiles is 'Um perfil por usuário do Supabase Auth: nome exibido, preferências e metas.';

-- Cria o perfil automaticamente quando alguém se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Livros
-- ---------------------------------------------------------------------
create table if not exists public.books (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (char_length(id) between 1 and 100),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  author       text not null default '' check (char_length(author) <= 120),
  description  text not null default '' check (char_length(description) <= 2000),
  -- URL http(s) ou imagem enviada (data URL JPEG já reduzida pelo app, até ~1,5 MB).
  cover_url    text not null default '' check (char_length(cover_url) <= 1600000),
  cover_color  text check (cover_color is null or cover_color ~ '^#[0-9A-Fa-f]{6}$'),
  total_pages  integer check (total_pages between 1 and 20000),
  current_page integer not null default 0,
  status       text not null default 'want-to-read' check (status in ('want-to-read', 'reading', 'finished')),
  started_at   timestamptz,
  finished_at  timestamptz,
  rating       smallint check (rating between 1 and 5),
  review       text not null default '' check (char_length(review) <= 2000),
  learnings    text not null default '',
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  constraint books_current_page_range check (current_page between 0 and total_pages),
  constraint books_finished_only_when_finished check (status = 'finished' or finished_at is null)
);

comment on column public.books.current_page is 'Maior página alcançada (marcador). Não é a soma das sessões.';
comment on column public.books.rating is 'Avaliação final opcional, de 1 a 5.';
comment on column public.books.review is 'Comentário final opcional: o que achei do livro.';

-- v1.2: "o que aprendi ou levo desta leitura". Para bancos criados com a
-- versão anterior deste script, a coluna é acrescentada sem tocar nos dados.
alter table public.books add column if not exists learnings text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_learnings_length' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_learnings_length check (char_length(learnings) <= 2000);
  end if;
end;
$$;
comment on column public.books.learnings is 'Comentário final opcional: o que aprendi ou levo desta leitura.';

-- v1.3: livros lidos ANTES de usar o ReadTrack ("já concluídos").
-- Não têm sessões, tempo nem páginas por sessão; o total de páginas é
-- opcional só para eles. Bancos da versão anterior são atualizados aqui.
alter table public.books add column if not exists added_as_read boolean not null default false;
alter table public.books alter column total_pages drop not null;
-- (v1.3 criava aqui a regra books_total_pages_required; a v1.4 a remove — veja abaixo.)
comment on column public.books.added_as_read is 'Livro cadastrado como já lido antes do ReadTrack: concluído, sem sessões cronometradas.';

create index if not exists books_user_status_idx on public.books (user_id, status);
create index if not exists books_user_updated_idx on public.books (user_id, updated_at desc);

-- ---------------------------------------------------------------------
-- Sessões de leitura (inclui a observação opcional da sessão)
-- ---------------------------------------------------------------------
create table if not exists public.reading_sessions (
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id               text not null check (char_length(id) between 1 and 100),
  book_id          text not null,
  started_at       timestamptz not null,
  finished_at      timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  paused_seconds   integer not null default 0 check (paused_seconds >= 0),
  pause_count      integer not null default 0 check (pause_count >= 0),
  -- Intervalos efetivamente lidos: [{ "start": ISO, "end": ISO }, ...]
  segments         jsonb not null default '[]'::jsonb check (jsonb_typeof(segments) = 'array'),
  start_page       integer not null check (start_page >= 0),
  end_page         integer not null,
  pages_read       integer not null,
  new_pages        integer not null default 0,
  notes            text not null default '' check (char_length(notes) <= 1000),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade,
  constraint sessions_page_order check (end_page >= start_page),
  constraint sessions_pages_read check (pages_read = end_page - start_page),
  constraint sessions_new_pages check (new_pages between 0 and pages_read),
  constraint sessions_time_order check (finished_at >= started_at)
);

comment on column public.reading_sessions.pages_read is 'Página final − página inicial (convenção do marcador).';
comment on column public.reading_sessions.new_pages is 'Quanto o progresso do livro avançou (0 numa releitura).';
comment on column public.reading_sessions.notes is 'Observação opcional da sessão.';

create index if not exists sessions_user_book_idx on public.reading_sessions (user_id, book_id);
create index if not exists sessions_user_started_idx on public.reading_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- v1.4 — sessões manuais, vocabulário e página inicial da leitura
-- Migração aditiva e segura: só acrescenta colunas e afrouxa/ajusta regras
-- para aceitar registros manuais. Nenhum dado existente é alterado: as
-- sessões antigas recebem source = 'timer' e vocabulary = '[]'.
-- ---------------------------------------------------------------------
alter table public.reading_sessions add column if not exists source text not null default 'timer';
alter table public.reading_sessions add column if not exists vocabulary jsonb not null default '[]'::jsonb;

-- Registro manual pode não ter término nem duração conhecidos (nada é inventado).
alter table public.reading_sessions alter column finished_at drop not null;
alter table public.reading_sessions alter column duration_seconds drop not null;

do $$
begin
  -- Cronômetro: páginas pelo marcador (final − inicial).
  -- Manual: intervalo anotado, inclusivo (final − inicial + 1).
  alter table public.reading_sessions drop constraint if exists sessions_pages_read;
  alter table public.reading_sessions add constraint sessions_pages_read
    check (pages_read = end_page - start_page + case when source = 'manual' then 1 else 0 end);

  if not exists (select 1 from pg_constraint where conname = 'sessions_source_valid' and conrelid = 'public.reading_sessions'::regclass) then
    alter table public.reading_sessions add constraint sessions_source_valid check (source in ('timer', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_vocabulary_array' and conrelid = 'public.reading_sessions'::regclass) then
    alter table public.reading_sessions add constraint sessions_vocabulary_array check (jsonb_typeof(vocabulary) = 'array');
  end if;
  -- Só o registro manual pode ficar sem término ou sem duração.
  if not exists (select 1 from pg_constraint where conname = 'sessions_timer_complete' and conrelid = 'public.reading_sessions'::regclass) then
    alter table public.reading_sessions add constraint sessions_timer_complete
      check (source = 'manual' or (finished_at is not null and duration_seconds is not null));
  end if;
  -- No registro manual, páginas são números impressos a partir de 1 e o
  -- término (quando informado) é depois do início.
  if not exists (select 1 from pg_constraint where conname = 'sessions_manual_rules' and conrelid = 'public.reading_sessions'::regclass) then
    alter table public.reading_sessions add constraint sessions_manual_rules
      check (source <> 'manual' or (start_page >= 1 and (finished_at is null or finished_at > started_at)));
  end if;
end;
$$;

comment on column public.reading_sessions.source is 'timer = cronometrada pelo app; manual = registro manual (anotações antigas).';
comment on column public.reading_sessions.vocabulary is 'Vocabulário da sessão: [{ "term": "...", "meaning": "..." }].';
comment on column public.reading_sessions.duration_seconds is 'Duração registrada (efetiva). Num registro manual é a anotada e pode ser nula; nunca é deduzida dos horários.';

alter table public.books add column if not exists content_start_page integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_content_start_valid' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_content_start_valid
      check (content_start_page is null or (content_start_page >= 1 and (total_pages is null or content_start_page <= total_pages)));
  end if;
end;
$$;
comment on column public.books.content_start_page is 'Página impressa em que a leitura começa (ex.: 9). Nulo = página 1.';

-- v1.4: o total de páginas pode ficar "não informado" também em livros comuns
-- (ex.: livros criados a partir de anotações importadas, que não traziam o total).
-- Só RELAXA uma regra: nenhum dado é alterado. A faixa 1–20000 e
-- "página atual ≤ total" continuam valendo quando o total existe.
alter table public.books drop constraint if exists books_total_pages_required;
comment on column public.books.total_pages is 'Total de páginas. Nulo = não informado (nunca inventado).';

-- ---------------------------------------------------------------------
-- Cronômetro em andamento (no máximo um por usuário)
-- ---------------------------------------------------------------------
create table if not exists public.active_sessions (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 100),
  book_id    text not null,
  -- Estado do cronômetro (status, intervalos, rascunho do formulário).
  state      jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now(),
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade
);

create index if not exists active_sessions_book_idx on public.active_sessions (user_id, book_id);

-- ---------------------------------------------------------------------
-- Conquistas desbloqueadas
-- ---------------------------------------------------------------------
create table if not exists public.achievements (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  achievement_id text not null check (char_length(achievement_id) between 1 and 60),
  unlocked_at    timestamptz not null,
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------
-- Gatilhos de updated_at
-- ---------------------------------------------------------------------
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before insert or update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at before insert or update on public.books
  for each row execute function public.set_updated_at();

drop trigger if exists sessions_updated_at on public.reading_sessions;
create trigger sessions_updated_at before insert or update on public.reading_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists active_sessions_updated_at on public.active_sessions;
create trigger active_sessions_updated_at before insert or update on public.active_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Privilégios: visitantes sem login (anon) não acessam nada.
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.books, public.reading_sessions,
  public.active_sessions, public.achievements from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.books, public.reading_sessions,
  public.active_sessions, public.achievements to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- (select auth.uid()) é avaliado uma vez por consulta (recomendação do Supabase).
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.books              enable row level security;
alter table public.reading_sessions   enable row level security;
alter table public.active_sessions    enable row level security;
alter table public.achievements       enable row level security;

-- Perfis: cada usuário lê, cria e altera só o próprio. Não há exclusão
-- direta: o perfil some junto com a conta (on delete cascade).
drop policy if exists "profiles: ler o próprio" on public.profiles;
create policy "profiles: ler o próprio" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles: criar o próprio" on public.profiles;
create policy "profiles: criar o próprio" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "profiles: alterar o próprio" on public.profiles;
create policy "profiles: alterar o próprio" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Demais tabelas: as quatro operações, sempre restritas a user_id = auth.uid().
do $$
declare
  t text;
begin
  foreach t in array array['books', 'reading_sessions', 'active_sessions', 'achievements']
  loop
    execute format('drop policy if exists "%1$s: ler as próprias" on public.%1$I', t);
    execute format('create policy "%1$s: ler as próprias" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);

    execute format('drop policy if exists "%1$s: criar as próprias" on public.%1$I', t);
    execute format('create policy "%1$s: criar as próprias" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);

    execute format('drop policy if exists "%1$s: alterar as próprias" on public.%1$I', t);
    execute format('create policy "%1$s: alterar as próprias" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);

    execute format('drop policy if exists "%1$s: excluir as próprias" on public.%1$I', t);
    execute format('create policy "%1$s: excluir as próprias" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- v1.6.0 — publicação: demonstração fora do banco e importação atômica
-- Migração aditiva: só cria regras novas e uma função. Nenhuma linha
-- existente é alterada ou apagada.
-- ---------------------------------------------------------------------

-- A demonstração pública usa dados fictícios guardados no navegador do
-- visitante e NUNCA chega ao banco. Estas regras impedem gravar registros
-- marcados como demonstração em qualquer conta. "not valid": linhas que já
-- existam não são conferidas (nada é apagado); valem para gravações novas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'books_no_demo' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_no_demo check (not is_demo) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_no_demo' and conrelid = 'public.reading_sessions'::regclass) then
    alter table public.reading_sessions add constraint sessions_no_demo check (not is_demo) not valid;
  end if;
end;
$$;
comment on column public.books.is_demo is 'Legado (até 1.5.0). Desde a 1.6.0 sempre false: a demonstração não grava no banco.';
comment on column public.reading_sessions.is_demo is 'Legado (até 1.5.0). Desde a 1.6.0 sempre false.';

-- Importação de backup numa ÚNICA transação: ou entra tudo, ou nada muda.
-- - Roda com os privilégios de quem chama (security invoker): a RLS vale
--   normalmente e cada linha recebe user_id = auth.uid() — os user_id que
--   vierem no arquivo são ignorados.
-- - p_mode 'merge': grava (insere ou atualiza pelo id) só as linhas enviadas
--   e nunca apaga nada. O app envia apenas o que é novo ou mudou: livros e
--   sessões novos e, nos livros que já existiam, a página atual/status
--   recalculados pelas sessões acrescentadas.
--   p_mode 'replace': apaga livros, sessões, cronômetro e conquistas da
--   PRÓPRIA conta e grava o conteúdo do backup (e as preferências, se vierem).
-- - Qualquer erro (regra violada, dado inválido) desfaz tudo.
create or replace function public.import_backup(
  p_mode text,
  p_books jsonb default '[]'::jsonb,
  p_sessions jsonb default '[]'::jsonb,
  p_active_session jsonb default null,
  p_profile jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_books integer := 0;
  v_sessions integer := 0;
  v_active integer := 0;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado para importar um backup.' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('merge', 'replace') then
    raise exception 'Modo de importação inválido: %', coalesce(p_mode, 'vazio') using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_books, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_sessions, '[]'::jsonb)) <> 'array' then
    raise exception 'Livros e sessões precisam ser listas.' using errcode = '22023';
  end if;

  if p_mode = 'replace' then
    delete from public.active_sessions where user_id = v_uid;
    delete from public.reading_sessions where user_id = v_uid;
    delete from public.books where user_id = v_uid;
    delete from public.achievements where user_id = v_uid;
  end if;

  insert into public.books (
    user_id, id, title, author, description, cover_url, cover_color, total_pages, added_as_read,
    content_start_page, current_page, status, started_at, finished_at, rating, review, learnings,
    is_demo, created_at, updated_at
  )
  select
    v_uid, b.id, b.title, coalesce(b.author, ''), coalesce(b.description, ''), coalesce(b.cover_url, ''),
    b.cover_color, b.total_pages, coalesce(b.added_as_read, false), b.content_start_page,
    coalesce(b.current_page, 0), coalesce(b.status, 'want-to-read'), b.started_at, b.finished_at,
    b.rating, coalesce(b.review, ''), coalesce(b.learnings, ''), coalesce(b.is_demo, false),
    coalesce(b.created_at, now()), coalesce(b.updated_at, now())
  from jsonb_populate_recordset(null::public.books, coalesce(p_books, '[]'::jsonb)) as b
  on conflict (user_id, id) do update set
    title = excluded.title, author = excluded.author, description = excluded.description,
    cover_url = excluded.cover_url, cover_color = excluded.cover_color, total_pages = excluded.total_pages,
    added_as_read = excluded.added_as_read, content_start_page = excluded.content_start_page,
    current_page = excluded.current_page, status = excluded.status, started_at = excluded.started_at,
    finished_at = excluded.finished_at, rating = excluded.rating, review = excluded.review,
    learnings = excluded.learnings, is_demo = excluded.is_demo, updated_at = excluded.updated_at;
  get diagnostics v_books = row_count;

  insert into public.reading_sessions (
    user_id, id, book_id, started_at, finished_at, duration_seconds, paused_seconds, pause_count,
    segments, start_page, end_page, pages_read, new_pages, notes, is_demo, source, vocabulary,
    created_at, updated_at
  )
  select
    v_uid, s.id, s.book_id, s.started_at, s.finished_at, s.duration_seconds, coalesce(s.paused_seconds, 0),
    coalesce(s.pause_count, 0), coalesce(s.segments, '[]'::jsonb), s.start_page, s.end_page, s.pages_read,
    coalesce(s.new_pages, 0), coalesce(s.notes, ''), coalesce(s.is_demo, false), coalesce(s.source, 'timer'),
    coalesce(s.vocabulary, '[]'::jsonb), coalesce(s.created_at, now()), coalesce(s.updated_at, now())
  from jsonb_populate_recordset(null::public.reading_sessions, coalesce(p_sessions, '[]'::jsonb)) as s
  on conflict (user_id, id) do update set
    book_id = excluded.book_id, started_at = excluded.started_at, finished_at = excluded.finished_at,
    duration_seconds = excluded.duration_seconds, paused_seconds = excluded.paused_seconds,
    pause_count = excluded.pause_count, segments = excluded.segments, start_page = excluded.start_page,
    end_page = excluded.end_page, pages_read = excluded.pages_read, new_pages = excluded.new_pages,
    notes = excluded.notes, is_demo = excluded.is_demo, source = excluded.source,
    vocabulary = excluded.vocabulary, updated_at = excluded.updated_at;
  get diagnostics v_sessions = row_count;

  if p_active_session is not null and jsonb_typeof(p_active_session) = 'object' then
    insert into public.active_sessions (user_id, id, book_id, state)
    values (v_uid, p_active_session ->> 'id', p_active_session ->> 'book_id', p_active_session -> 'state')
    on conflict (user_id) do nothing;
    get diagnostics v_active = row_count;
  end if;

  if p_profile is not null and jsonb_typeof(p_profile) = 'object' then
    insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
    update public.profiles set
      display_name = coalesce(p_profile ->> 'display_name', display_name),
      week_starts_on = coalesce(p_profile ->> 'week_starts_on', week_starts_on),
      text_size = coalesce(p_profile ->> 'text_size', text_size),
      motion = coalesce(p_profile ->> 'motion', motion),
      daily_minutes_goal = case when p_profile ? 'daily_minutes_goal' then (p_profile ->> 'daily_minutes_goal')::integer else daily_minutes_goal end,
      weekly_pages_goal = case when p_profile ? 'weekly_pages_goal' then (p_profile ->> 'weekly_pages_goal')::integer else weekly_pages_goal end
    where id = v_uid;
  end if;

  return jsonb_build_object('mode', p_mode, 'books', v_books, 'sessions', v_sessions, 'activeSession', v_active);
end;
$$;

comment on function public.import_backup(text, jsonb, jsonb, jsonb, jsonb) is
  'Importa um backup do ReadTrack para a conta logada numa única transação (merge = acrescentar, replace = substituir).';

-- Só usuários logados podem chamar (o Supabase concede EXECUTE a todos por padrão).
revoke all on function public.import_backup(text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_backup(text, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Perfis para usuários que já existiam antes deste script.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
