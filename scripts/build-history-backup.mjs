// Gera um arquivo no formato de BACKUP do ReadTrack (botão "Importar JSON" das
// Configurações) com os livros e sessões do histórico anotado.
//
//   node scripts/build-history-backup.mjs <ano> <historico.json> <saida.json>
//
// Exemplo com o histórico fictício do projeto:
//   node scripts/build-history-backup.mjs 2026 src/services/historyImport/fixtures/historico-exemplo.json /tmp/backup-exemplo.json
// Guarde históricos e backups PESSOAIS fora do repositório (veja .gitignore).
//
// Usa a mesma conversão da tela "Importar histórico" e do SQL (mesmos ids,
// datas, páginas, durações anotadas e vocabulário). Por isso, qualquer
// combinação dos três caminhos não duplica nada.
// Importe com a opção "Acrescentar" (padrão): nada do que você já tem é apagado.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildImportPlan, parseHistoryFile } from '../src/services/historyImport/historyImport.js';
import { createEmptyData } from '../src/services/storage/schema.js';
import { dataReducer, ACTIONS } from '../src/context/dataReducer.js';
import { createExportPayload, parseImportText } from '../src/services/storage/dataTransfer.js';

const [yearArg, input, output] = process.argv.slice(2);
if (!yearArg || !input || !output) {
  console.error('Uso: node scripts/build-history-backup.mjs <ano> <historico.json> <saida.json>');
  process.exit(1);
}

const parsed = parseHistoryFile(readFileSync(input, 'utf8'));
if (!parsed.ok) throw new Error(parsed.error);
const now = new Date();
const plan = buildImportPlan(parsed.data, { year: Number(yearArg), books: [], sessions: [], now });
if (!plan.ready) throw new Error(plan.errors.join('\n'));

// Mesmo caminho da tela: página atual, "Lendo", data de início e páginas novas.
const state = dataReducer(createEmptyData(), { type: ACTIONS.ADD_SESSIONS, payload: { books: plan.newBooks, sessions: plan.sessions, now } });
const payload = createExportPayload(state, now);
const text = JSON.stringify(payload, null, 2) + '\n';

// O arquivo tem de passar pelo MESMO validador do botão "Importar JSON".
const check = parseImportText(text);
if (!check.ok) throw new Error(`Backup gerado não passou na validação: ${check.error} ${check.details?.join('; ') ?? ''}`);

writeFileSync(output, text);
console.log(`${output}: ${check.summary.books} livros, ${check.summary.sessions} sessões — validado por parseImportText.`);
