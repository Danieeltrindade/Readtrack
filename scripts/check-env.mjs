// Confere as variáveis do Supabase ANTES do build (usado pelo workflow de publicação).
//
//   node scripts/check-env.mjs            → só informa
//   node scripts/check-env.mjs --require  → falha se faltar algo ou se a chave for secreta
//
// Usa a MESMA validação do app (src/services/supabase/config.js): só aceita a
// chave pública (publishable/anon) e recusa service_role/secret.
import { readSupabaseConfig, ENV_KEYS } from '../src/services/supabase/config.js';

const required = process.argv.includes('--require');
const config = readSupabaseConfig(process.env);

if (config.configured) {
  console.log(`Supabase configurado: ${config.url} (chave pública).`);
  process.exit(0);
}
if (config.problem) {
  console.error(`Configuração do Supabase inválida: ${config.problem}`);
  process.exit(1);
}
const message = `Faltam ${ENV_KEYS.url} e ${ENV_KEYS.key} (ou ${ENV_KEYS.legacyKey}).`;
if (required) {
  console.error(`${message} Configure-as em Settings → Secrets and variables → Actions → Variables (veja o README, etapa C).`);
  process.exit(1);
}
console.log(`${message} O site funcionaria só com a demonstração e o modo local.`);
