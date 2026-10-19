// Confere a pasta dist/ antes de publicar (usado pelo workflow).
// Falha se faltar o fallback de rotas, se houver arquivos que não devem ir
// para a internet (.env, backups, históricos pessoais) ou se o JavaScript
// contiver algo que pareça uma chave SECRETA do Supabase.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const problems = [];

if (!existsSync(join(dist, 'index.html'))) problems.push('dist/index.html não existe (rode npm run build).');
if (!existsSync(join(dist, '404.html'))) problems.push('dist/404.html não existe: recarregar uma rota daria 404 no GitHub Pages.');

const FORBIDDEN_NAME = /(^|\/)\.env|readtrack-backup-.*\.json$|historico-.*\.(json|sql)$|\.sql$/i;
const SECRET = /sb_secret_[A-Za-z0-9_-]{10,}|"role"\s*:\s*"service_role"/;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    const rel = relative(dist, path);
    if (FORBIDDEN_NAME.test(rel)) problems.push(`arquivo que não deve ser publicado: ${rel}`);
    if (/\.(js|html|json|map)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      if (SECRET.test(text)) problems.push(`possível chave secreta do Supabase em ${rel}`);
      // JWTs embutidos: só a chave anon é aceitável.
      for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
        try {
          const payload = JSON.parse(Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
          if (payload.role !== 'anon') problems.push(`JWT com papel "${payload.role}" em ${rel}`);
        } catch {
          /* não é JWT de verdade */
        }
      }
    }
  }
}
if (existsSync(dist)) walk(dist);

if (problems.length) {
  console.error('dist/ NÃO está pronta para publicar:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('dist/ conferida: index.html, 404.html, nenhum arquivo sensível e nenhuma chave secreta.');
