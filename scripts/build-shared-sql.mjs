// Gera a versão do banco do ReadTrack para um projeto Supabase COMPARTILHADO
// com outro app (ex.: o FitTrack), a partir de supabase/schema.sql.
//
//   node scripts/build-shared-sql.mjs            → (re)gera os arquivos
//   node scripts/build-shared-sql.mjs --check    → só confere se estão atualizados
//
// Tudo do ReadTrack vai para o schema "readtrack" em vez de "public":
//   - as tabelas, funções e políticas ficam em readtrack.*;
//   - o gatilho de cadastro ganha nome próprio (readtrack_on_auth_user_created),
//     para conviver com o "on_auth_user_created" do outro app sem substituí-lo.
// Nada do schema public é criado, alterado ou apagado.
//
// Saídas:
//   supabase/compartilhado/readtrack.sql   → rodar no SQL Editor do projeto compartilhado
//   supabase/compartilhado/rls_check.sql   → teste de RLS correspondente
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_SCHEMA = 'readtrack';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'supabase', 'compartilhado');

/** Troca o schema public pelo schema do ReadTrack e renomeia o gatilho de cadastro. */
export function toSharedSchema(sql, schema = SHARED_SCHEMA) {
  let out = sql.replace(/\bpublic\./g, `${schema}.`);
  out = out.replace(/\bon_auth_user_created\b/g, `${schema}_on_auth_user_created`);
  return out;
}

/** Tira o cabeçalho original (até a primeira linha de "=" que fecha o bloco). */
function dropHeader(sql) {
  const lines = sql.split('\n');
  let closed = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^-- =+$/.test(lines[i])) {
      closed += 1;
      if (closed === 2) return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
    }
  }
  return sql;
}

const GENERATED = '-- ARQUIVO GERADO por scripts/build-shared-sql.mjs a partir de supabase/schema.sql. Não edite à mão:\n-- mude o schema.sql e rode "npm run sql:compartilhado".';

export function buildSharedSchema(schemaSql, schema = SHARED_SCHEMA) {
  const body = toSharedSchema(dropHeader(schemaSql), schema);
  const header = `-- =====================================================================
-- ReadTrack — banco num projeto Supabase COMPARTILHADO (schema "${schema}")
--
-- Use este arquivo quando o ReadTrack divide o projeto do Supabase com outro
-- app (por exemplo, o FitTrack), para não passar do limite de projetos
-- gratuitos. Num projeto só do ReadTrack, use supabase/schema.sql.
--
-- O que este script faz:
-- * cria o schema "${schema}" e coloca nele TODAS as tabelas, funções e
--   políticas do ReadTrack (${schema}.books, ${schema}.reading_sessions, ...);
-- * cria o gatilho de cadastro com nome próprio (${schema}_on_auth_user_created),
--   que convive com o gatilho do outro app;
-- * NÃO cria, altera nem apaga nada do schema public (onde ficam as tabelas
--   do outro app).
--
-- Como usar:
-- 1. Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- 2. Project Settings → Data API → "Exposed schemas": acrescente "${schema}"
--    (sem tirar o "public") e salve.
-- 3. No .env.local do ReadTrack: VITE_SUPABASE_SCHEMA=${schema}
--
-- Pode ser executado de novo sem apagar dados (é idempotente).
-- Os usuários (Supabase Auth) são os mesmos do outro app: a mesma conta
-- entra nos dois, mas os dados de cada app ficam em tabelas separadas.
-- =====================================================================
${GENERATED}

create schema if not exists ${schema};
comment on schema ${schema} is 'Tabelas do ReadTrack (separadas das do outro app, que ficam em public).';

-- Acesso ao schema pela API. A segurança das linhas continua vindo da RLS
-- e dos privilégios de cada tabela, definidos abaixo.
grant usage on schema ${schema} to anon, authenticated, service_role;

`;
  const footer = `

-- ---------------------------------------------------------------------
-- Papel de serviço do Supabase (usado só pelo painel e por rotinas do
-- servidor, nunca pelo site): acesso administrativo ao schema ${schema}.
-- ---------------------------------------------------------------------
grant all on all tables in schema ${schema} to service_role;
grant execute on all functions in schema ${schema} to service_role;

-- Avisa a API para reler os schemas (tabelas novas aparecem na hora).
notify pgrst, 'reload schema';
`;
  return header + body.trimEnd() + footer;
}

export function buildSharedRlsCheck(rlsSql, schema = SHARED_SCHEMA) {
  const body = toSharedSchema(rlsSql, schema)
    .replace('Rode DEPOIS de supabase/schema.sql', `Rode DEPOIS de supabase/compartilhado/readtrack.sql (schema "${schema}")`);
  return `${GENERATED}\n${body}`;
}

function outputs() {
  const schemaSql = readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const rlsSql = readFileSync(join(ROOT, 'supabase', 'tests', 'rls_check.sql'), 'utf8');
  return {
    [join(OUT_DIR, 'readtrack.sql')]: buildSharedSchema(schemaSql),
    [join(OUT_DIR, 'rls_check.sql')]: buildSharedRlsCheck(rlsSql),
  };
}

export function staleSharedFiles() {
  return Object.entries(outputs())
    .filter(([file, content]) => {
      try {
        return readFileSync(file, 'utf8') !== content;
      } catch {
        return true;
      }
    })
    .map(([file]) => file);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const stale = staleSharedFiles();
    if (stale.length) {
      console.error(`Desatualizado: ${stale.join(', ')}. Rode "npm run sql:compartilhado".`);
      process.exit(1);
    }
    console.log('SQL do projeto compartilhado atualizado.');
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [file, content] of Object.entries(outputs())) {
      writeFileSync(file, content);
      console.log(`Gerado: ${file.replace(ROOT + '/', '')}`);
    }
  }
}
