# ReadTrack

**Acompanhamento pessoal de leitura.** Cadastre seus livros (inclusive os que você leu antes de usar o app), cronometre as sessões de leitura, registre observações e acompanhe histórico, estatísticas, metas e conquistas.

Site web responsivo (celular, tablet e desktop) feito com React + Vite, com contas e banco de dados no Supabase (Auth + PostgreSQL + Row Level Security) e publicação automática no GitHub Pages. Versão **1.6.0**.

<!-- Depois de publicar, troque pelo endereço real (veja a Etapa D): -->
**Site:** _https://SEU-USUARIO.github.io/SEU-REPOSITORIO/_

Um único endereço, três caminhos:

| Quem | Onde | O que acontece |
| --- | --- | --- |
| Visitante | `/` | Página inicial com **Experimentar demonstração**, **Criar minha conta** e **Entrar**. |
| Visitante na demonstração | `/demo` | O app completo com **dados fictícios**, sem login. As alterações ficam só neste navegador, numa área separada, e podem ser desfeitas em **Restaurar dados iniciais**. Nada vai para o banco. |
| Usuário com conta | `/app` | A área pessoal, protegida por login. Começa **vazia**: sem livros, sessões ou conquistas inventadas. |

Outras rotas: `/login`, `/register`, `/forgot-password` (pedir link de nova senha) e `/reset-password` (definir a nova senha pelo link do e-mail).

<!-- Capturas de tela: veja docs/screenshots/README.md -->

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Metas predefinidas (conquistas) na 1.6.0](#metas-predefinidas-conquistas-na-160)
- [Tecnologias e arquitetura](#tecnologias-e-arquitetura)
- [Tutorial: do zero ao site publicado](#tutorial-do-zero-ao-site-publicado)
  - [Etapa A — Preparar o ambiente](#etapa-a--preparar-o-ambiente)
  - [Etapa B — Configurar o Supabase](#etapa-b--configurar-o-supabase)
  - [Etapa C — Configurar o GitHub](#etapa-c--configurar-o-github)
  - [Etapa D — Publicar](#etapa-d--publicar)
  - [Etapa E — Testar a demonstração](#etapa-e--testar-a-demonstração)
  - [Etapa F — Importar o seu backup](#etapa-f--importar-o-seu-backup)
  - [Etapa G — Atualizações futuras](#etapa-g--atualizações-futuras)
- [Banco de dados e segurança](#banco-de-dados-e-segurança)
- [Backup e importação](#backup-e-importação)
- [Regras de cálculo](#regras-de-cálculo)
- [Testes](#testes)
- [Limitações conhecidas](#limitações-conhecidas)

## Funcionalidades

**Página inicial, demonstração e contas (1.6.0)**
- Página inicial pública com a proposta do ReadTrack e as três opções. Quem já está logado vê "Continuar como …".
- **Demonstração pública** com livros em todos os estados (lendo, concluídos, quero ler e um "já lido antes do ReadTrack"), cerca de 90 sessões nos últimos 5 meses (inclusive uma que passa da meia-noite, registros manuais e sessões com pausa), observações, vocabulário, comentários finais, metas com progresso e conquistas desbloqueadas e em andamento. As datas acompanham o dia de hoje, então Dia, Semana, Mês, 3 meses e Histórico total sempre têm dados.
- Faixa fixa **"Modo demonstração — dados fictícios"** com **Restaurar dados iniciais**, **Criar minha conta** e **Página inicial**. Na demonstração não há backup, importação nem conta (as Configurações explicam o motivo).
- Cadastro com e-mail e senha (com confirmação da senha), confirmação de e-mail (quando ligada no Supabase), login, saída, "esqueci minha senha" e nova senha pelo link do e-mail, mensagens claras para e-mail inválido, senha incorreta, e-mail não confirmado, link expirado, limite de tentativas e falta de conexão.
- A sessão de login continua ao recarregar a página. A área pessoal é protegida: sem login, `/app/...` leva a `/login` e, depois de entrar, volta para a página pedida. Sair leva à página inicial.

**Biblioteca e livros**
- Cadastro, edição e exclusão (com confirmação) de livros: título, autor, páginas, página atual, descrição, status, datas de início e conclusão.
- **Livros lidos antes do ReadTrack:** "Adicionar livro já concluído" na Biblioteca. Só o título é obrigatório; autor, total de páginas, data em que terminou, avaliação, "O que achei do livro" e "O que aprendi" são opcionais. O livro entra como **Concluído**, marcado "Lido antes do ReadTrack", e pode ser editado ou excluído depois. Nenhuma sessão, tempo, página por sessão, dia de sequência ou meta é inventado para ele.
- **Comentário final** ao concluir um livro (pelo menu de status, pelo formulário ou pela última sessão): "O que achei do livro", "O que aprendi ou levo desta leitura" e "Minha avaliação" (1 a 5 estrelas). Tudo opcional, editável depois e exibido nos detalhes do livro, separado das observações das sessões.
- Capa opcional por endereço de imagem ou arquivo enviado (reduzido automaticamente). Sem capa, o site gera uma capa tipográfica.
- Pesquisa por título e autor (ignora acentos), filtros por status (em andamento, concluídos, quero ler) e ordenação. A busca fica na URL.
- **Página inicial da leitura (opcional):** a página impressa onde o texto começa (ex.: 9, se as 8 primeiras são capa, sumário e prefácio). Os detalhes mostram a página física e o progresso de leitura ("Página 20 de 200 · 12 de 192 páginas de leitura"); as páginas antes dela não contam como lidas. Sem ela, nada muda. Alterar o campo não apaga nem altera nenhuma sessão.
- Página de detalhes com progresso, páginas lidas e restantes, tempo total, velocidade média, previsão de término e sessões recentes.

**Cronômetro de leitura**
- Iniciar, pausar, continuar, finalizar e cancelar, com horas, minutos e segundos.
- O tempo é calculado pelos horários reais de cada intervalo de leitura. Aba em segundo plano, celular bloqueado ou navegador fechado não atrasam o relógio, e as pausas não contam.
- A sessão em andamento sobrevive a recarregar a página ou reabrir o navegador, e é sincronizada entre abas.
- Ao finalizar: páginas inicial e final, páginas lidas calculadas, duração ajustável (só para menos) e **observações desta leitura (opcional)**: palavras novas, ideias, trechos, interpretações, dúvidas. O rascunho é salvo.

**Histórico**
- Todas as sessões, da mais recente para a mais antiga, agrupadas por dia: livro e autor, data, horário, duração efetiva, páginas inicial e final, páginas lidas e observação.
- Busca por título ou autor, filtro por livro e por período (7 ou 30 dias, mês, ano ou datas escolhidas). Os filtros ficam na URL. Carrega 25 sessões por vez.
- Detalhes de cada sessão em um diálogo, com edição de páginas, duração (só para menos do que o cronômetro mediu) e observação; exclusão da observação sem apagar a sessão; exclusão da sessão com confirmação.
- Editar ou excluir recalcula o progresso do livro, as páginas novas e as estatísticas (veja "Páginas" em Regras de cálculo).
- Proteção contra sessões duplicadas por cliques repetidos.

**Sessões manuais e importação do histórico (1.4)**
- **Adicionar sessão manual** no Histórico e na página do livro, para leituras feitas fora do cronômetro: livro, data e horário de início, data e horário de término (se souber), primeira e última página **impressas**, duração registrada (se souber), observações e vocabulário ("palavra: significado", uma por linha).
- Sessões manuais aparecem marcadas como **"Registro manual"**, podem ser editadas e excluídas, e entram nas estatísticas só com o que foi informado: sem duração anotada, aparece "duração não informada" e nada é estimado.
- **Leituras que passam da meia-noite:** início e término são gravados completos (data + hora). O formulário **não presume** a meia-noite: se o término for mais cedo que o início no mesmo dia, ele pergunta e oferece "marcar que terminou no dia seguinte". O histórico mostra as duas datas: `23:21 → 06/10 01:47`.
- **Duração registrada × calculada:** a duração anotada é preservada como foi escrita e é a usada nas estatísticas. A diferença entre os horários é calculada à parte e, quando difere em mais de 1 minuto, aparece um aviso discreto (ícone na lista e explicação nos detalhes). Nada é corrigido automaticamente.
- **Importar histórico** (Histórico ou Configurações → "Importar histórico"): escolhe um arquivo de histórico, mostra a pré-visualização (ano, livros, sessões, notas, vocabulário, duplicatas, divergências) e só grava ao confirmar.

**Dashboard, estatísticas, metas e conquistas**
- Dashboard com livro atual, totais (páginas, tempo, sessões, livros concluídos, sequência), metas do dia e da semana, gráfico dos últimos 7 dias, sessões recentes e atalhos.
- Estatísticas por **dia, semana, mês, 3 meses ou histórico total**, com navegação entre períodos e comparação com o período anterior equivalente: valor atual, barras "agora × antes", diferença absoluta e percentual (sem "+100%" quando antes não houve leitura: aparece "Novo registro"). No histórico total aparecem totais acumulados, médias e o melhor mês.
- Gráficos de páginas, tempo e **Evolução** com os mesmos cinco períodos, todos com tabela acessível.
- Metas pessoais configuráveis (minutos por dia, páginas por semana) com estados: concluída, em andamento, não começou e não configurada.
- **Conquistas por níveis** em 7 categorias, com anel de progresso até o próximo nível ("974 / 1.000 páginas"), trilha de níveis e data real de cada desbloqueio. Recalculadas a partir dos registros a cada sessão adicionada, editada ou excluída.

**Conta e dados**
- Livros, sessões (com observação e vocabulário), comentário final, cronômetro em andamento, metas, preferências e conquistas gravados no PostgreSQL, sempre ligados ao usuário logado.
- Gravação automática com indicador ("Salvo na sua conta", "Salvando…", "Erro ao salvar"), novas tentativas e aviso antes de fechar a aba com alterações pendentes.
- **Backup:** exportação em JSON e importação com prévia, validação completa e confirmação. Na conta, a importação é gravada numa **única transação** no banco: ou entra tudo, ou nada muda; o sucesso só aparece depois da confirmação do banco. Veja [Backup e importação](#backup-e-importação).
- Dados de um navegador usado no modo local (versões antigas) podem ser enviados para a conta, só quando você pede, sem duplicar.

**Qualidade**
- Layout próprio para celular (barra de navegação inferior), trilho de ícones no tablet e barra lateral no desktop; sem rolagem horizontal nas larguras testadas (320 a 1440 px).
- Acessível por teclado, com foco visível, link para pular ao conteúdo e diálogos nativos. Contraste dentro do nível AA da WCAG; a preferência por menos movimento é respeitada.

## Metas predefinidas (conquistas) na 1.6.0

As conquistas são as metas **predefinidas** do ReadTrack. Na 1.6.0 só os **valores** mudaram: as categorias, os nomes, a quantidade de níveis (46 no total) e a interface são os mesmos da 1.5.0. Os primeiros níveis continuam fáceis; do meio para o fim, cada nível pede de 2 a 3 vezes o anterior, sem saltos desproporcionais. As metas **pessoais** (minutos por dia e páginas por semana, configuradas por você) não mudaram.

| Categoria (níveis) | 1.5.0 | 1.6.0 |
| --- | --- | --- |
| Páginas (8) | 10 · 50 · 100 · 250 · 500 · 1.000 · 2.500 · 5.000 | 10 · 50 · 150 · 400 · 1.000 · 2.500 · 6.000 · 15.000 |
| Tempo de leitura (7) | 15 min · 1 h · 5 h · 10 h · 25 h · 50 h · 100 h | 15 min · 1 h · 5 h · 15 h · 40 h · 100 h · 250 h |
| Sessões (7) | 1 · 5 · 10 · 25 · 50 · 100 · 250 | 1 · 5 · 15 · 40 · 100 · 250 · 500 |
| Dias com leitura (7) | 1 · 3 · 7 · 14 · 30 · 60 · 100 | 1 · 3 · 10 · 25 · 60 · 150 · 300 |
| Sequência (6) | 2 · 3 · 7 · 14 · 30 · 60 dias | 2 · 4 · 10 · 21 · 45 · 90 dias |
| Meta semanal (6) | 1 · 2 · 4 · 8 · 12 · 26 semanas | 1 · 3 · 6 · 12 · 26 · 52 semanas |
| Livros concluídos (5) | 1 · 3 · 5 · 10 · 25 | 1 · 3 · 8 · 20 · 50 |

O que acontece com as conquistas já salvas: os níveis cujo alvo não mudou (ex.: 1.000 páginas) mantêm o id e a data. Os de alvos que deixaram de existir (ex.: "100 páginas") são retirados da lista salva, **depois** que os níveis novos equivalentes já foram gravados, e os novos são recalculados dos seus registros, com a data real em que foram atingidos. A meta semanal continua permanente: se você já tinha cumprido 4 semanas, o nível novo de 3 semanas fica desbloqueado com a data antiga.

## Tecnologias e arquitetura

| Área | Escolha |
| --- | --- |
| Interface | React 19, JavaScript (sem TypeScript) |
| Build | Vite 7 |
| Rotas | React Router 7 (`BrowserRouter` com o caminho de publicação como `basename`) |
| Estado | Context API + `useReducer` |
| Contas e banco | Supabase Auth + PostgreSQL + Row Level Security, via `@supabase/supabase-js` |
| Demonstração e modo local | `localStorage`, em áreas separadas (`readtrack:demo` e `readtrack:data`) |
| Gráficos e ícones | Recharts, Lucide React |
| Estilos | CSS puro com variáveis (design tokens) |
| Testes | `node:test` (nativo do Node) |
| Qualidade | ESLint 9 com `react-hooks` e `react-refresh` |
| Publicação | GitHub Actions → GitHub Pages (a Vercel continua possível com o `vercel.json`) |

**Por que GitHub Pages:** o ReadTrack é um site estático (HTML, CSS e JavaScript); login e dados ficam no Supabase. O GitHub Pages hospeda isso sem custo e sem backend próprio. Duas adaptações foram necessárias e já estão no projeto:

1. **Caminho do site:** num repositório comum o endereço é `https://usuario.github.io/repositorio/`. O workflow informa esse caminho ao Vite (`BASE_PATH`), e o React Router e os links de e-mail o usam.
2. **Recarregar uma rota (ex.: `/app/metas`):** o GitHub Pages não sabe que essa página existe e devolve o `404.html`. O build gera um `404.html` idêntico ao `index.html`, então o React Router abre a tela certa e o endereço (inclusive o `#access_token` dos links de e-mail) é preservado. Efeito colateral: o servidor responde com o status HTTP 404 nessas rotas profundas (o visitante não percebe; robôs de busca, sim). A página inicial responde 200.

```
src/
├── app/            Rotas (AppRoutes), caminhos públicos e dos espaços (paths, routes), navegação
├── context/        AuthProvider (login no site todo), AccountWorkspace (/app: conta ou modo local),
│                   DemoWorkspace (/demo), DataProvider (estado e ações), dataReducer, ToastProvider
├── demo/           Dados fictícios da demonstração (demoDataset) e as marcas que os identificam
├── features/       public (página inicial), auth (login, cadastro, senha), dashboard, library,
│                   books, history, reading, statistics, goals, settings
├── services/
│   ├── storage/      ÚNICO acesso ao localStorage (áreas separadas), esquema, exportação/importação
│   ├── supabase/     Configuração, cliente, autenticação, mapeadores e o repositório
│   │                 (ÚNICO lugar com consultas ao banco)
│   ├── persistence/  Persistências local, remota e da demonstração, com a mesma interface
│   ├── sync/         Diferença entre estados e fila de gravação
│   └── migration/    Envio dos dados do modo local para a conta
├── components/, hooks/, styles/, utils/ (regras de negócio puras e testadas)
build/htmlSecurity.js   Política de segurança (CSP) inserida no build
supabase/               schema.sql (instalação e atualização), tests/rls_check.sql
scripts/                check-env, check-dist (usados no workflow) e conversores de histórico
.github/workflows/      deploy.yml (lint, testes, build e publicação)
```

Princípios: regras fora da interface (`utils/`, com testes); persistência centralizada; uma única fonte para os números (o livro-razão diário alimenta Dashboard, Estatísticas, Metas e Conquistas); nenhum dado descartado em silêncio. As telas são as mesmas em `/app` e `/demo`; o que muda é a persistência entregue ao `DataProvider`.

---

## Tutorial: do zero ao site publicado

Siga as etapas na ordem. Onde aparecer `SEU-USUARIO`, `SEU-REPOSITORIO` ou `SEU-PROJETO`, use os seus valores (o tutorial diz onde encontrá-los). O painel do Supabase e o GitHub mudam a aparência de vez em quando; se um nome de menu estiver um pouco diferente, procure o equivalente.

### Etapa A — Preparar o ambiente

1. Instale o **Node.js 22** (LTS) em [nodejs.org](https://nodejs.org) — o projeto exige 20.19 ou mais novo (`.nvmrc` indica 22) — e o **Git** em [git-scm.com](https://git-scm.com).
2. Confira no terminal: `node -v` (v22.x) e `git --version`.
3. Baixe o projeto: descompacte o `readtrack.zip` numa pasta **sua**, fora de pastas sincronizadas com outras pessoas, ou clone o seu repositório (`git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git`).
4. Entre na pasta e instale as dependências:

   ```bash
   cd readtrack
   npm install
   ```

   Isso cria o `package-lock.json`. **Faça commit dele** (Etapa C): o GitHub Actions usa esse arquivo para instalar exatamente as mesmas versões (`npm ci`).
5. Configure o `.env` (pode fazer isso depois da Etapa B):

   ```bash
   cp .env.example .env.local
   ```

   e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. O `.env.local` é ignorado pelo Git.
6. Rode localmente:

   ```bash
   npm run dev        # http://localhost:5173
   ```

   Sem o `.env.local`, a demonstração funciona e a área pessoal abre no **modo local** (dados só no navegador, com aviso). Cadastro e login aparecem como indisponíveis — o app não simula login.

Outros comandos:

```bash
npm test             # testes unitários
npm run lint         # ESLint
npm run build        # build de produção em dist/
npm run check        # lint + testes + build + conferência da pasta dist
npm run preview      # serve o build em http://localhost:4173
npm run check:env    # confere as variáveis do Supabase (recusa chave secreta)
```

### Etapa B — Configurar o Supabase

1. **Criar o projeto.** Em [supabase.com](https://supabase.com), crie uma conta e um projeto (o plano gratuito basta). Guarde a senha do banco num gerenciador de senhas; ela **não** vai para o site.
2. **Encontrar a URL e a chave pública.** No painel do projeto, abra **Project Settings → API Keys** (ou o botão **Connect** no topo):
   - **Project URL**: algo como `https://abcdefghijkl.supabase.co`;
   - **Publishable key** (`sb_publishable_…`). Projetos antigos mostram a **anon key** (um JWT): serve também.
   - **Não use** a `service_role` / `secret` (`sb_secret_…`): ela ignora toda a segurança do banco. O app e o workflow se recusam a usá-la.
3. **Variáveis de ambiente.** Coloque os dois valores no `.env.local` (Etapa A, item 5) e, depois, no GitHub (Etapa C).
4. **Aplicar o esquema SQL.** Abra **SQL Editor → New query**, cole **o arquivo inteiro** [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Ele cria tabelas, índices, regras, gatilhos, políticas RLS e a função de importação. Pode ser rodado de novo sem apagar dados — é assim que se atualiza um banco de uma versão anterior. Mensagens `NOTICE … does not exist, skipping` são normais.
5. **Revisar o RLS.** Em uma nova consulta, rode [`supabase/tests/rls_check.sql`](supabase/tests/rls_check.sql). Ele simula **duas contas** (A e B) dentro de uma transação desfeita no final e confere que uma não lê, altera, cria nem apaga dados da outra, que visitantes sem login não acessam nada e que a importação é tudo-ou-nada. A última linha deve ser **`RLS OK: 35 verificações`**. Em **Table Editor**, cada tabela deve aparecer com RLS ativado.
6. **Cadastro e login.** Em **Authentication → Sign In / Providers**, deixe **Email** ligado. A opção **Confirm email** (confirmar e-mail) é recomendada: com ela, a conta só entra depois de clicar no link enviado. O ReadTrack funciona com ou sem.
7. **E-mails.** O serviço de e-mail padrão do Supabase serve para testar, mas tem limite baixo de envios por hora. Para uso real, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**. Os textos dos e-mails ficam em **Authentication → Emails → Templates**.
8. **URLs de redirecionamento** (sem isso, os links de confirmação e de nova senha levam para o lugar errado). Em **Authentication → URL Configuration**:
   - **Site URL:** o endereço público do site, com a barra no final: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/` (você confirma esse endereço na Etapa D; dá para voltar aqui depois).
   - **Redirect URLs**, adicione:
     - `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/**`
     - `http://localhost:5173/**` (desenvolvimento)
     - `http://localhost:4173/**` (`npm run preview`)

   O app pede que a confirmação de cadastro volte para `…/app` e a recuperação de senha para `…/reset-password`; o `**` libera os dois.
9. **Testar o banco e o login localmente.** Com o `.env.local` preenchido, rode `npm run dev`, abra `http://localhost:5173/register`, crie uma conta, confirme pelo e-mail (se ligado) e verifique que a área pessoal abre **vazia**. No Supabase, **Authentication → Users** mostra o usuário e **Table Editor → profiles** o perfil criado automaticamente.

### Etapa C — Configurar o GitHub

1. **Criar o repositório.** Em [github.com/new](https://github.com/new), crie um repositório (ex.: `readtrack`). O nome dele faz parte do endereço do site.
2. **Conferir o que NÃO deve ser enviado.** O `.gitignore` já exclui `node_modules`, `dist`, todos os `.env*` (exceto o `.env.example`), e pastas/arquivos com dados pessoais: `imports/`, `dados-pessoais/`, `private/`, `backups/`, `readtrack-backup-*.json` e `historico-*.json|sql`. Antes do primeiro commit, rode:

   ```bash
   git init
   git add .
   git status        # confira a lista: nenhum .env.local, nenhum backup pessoal
   ```

   **Guarde seus backups fora da pasta do projeto.** Se um arquivo pessoal já foi enviado para um repositório antes, apagá-lo num novo commit **não** o remove do histórico do Git. Nesse caso, a forma segura é criar um repositório novo (sem o histórico antigo) ou reescrever o histórico com [`git filter-repo`](https://github.com/newren/git-filter-repo) e trocar qualquer chave que tenha vazado (Supabase → Project Settings → API Keys).
3. **Commit e push:**

   ```bash
   git commit -m "ReadTrack 1.6.0"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
4. **Ligar o GitHub Pages pelo Actions.** No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
5. **Variáveis do build.** **Settings → Secrets and variables → Actions → aba Variables → New repository variable**:
   - `VITE_SUPABASE_URL` = a Project URL;
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = a publishable key (ou `VITE_SUPABASE_ANON_KEY` = a anon key).

   São valores públicos por natureza (vão para o JavaScript do site); a segurança vem da RLS. Se preferir, cadastre-os como *Secrets* com os mesmos nomes: o workflow aceita os dois. **Nunca** cadastre a chave `service_role`/secret.
6. **Permissões.** O workflow já declara o que precisa (`pages: write`, `id-token: write`). Se a publicação for recusada por permissão, confira **Settings → Actions → General → Workflow permissions** e o ambiente `github-pages` em **Settings → Environments** (ele deve permitir a branch `main`).

### Etapa D — Publicar

1. **Testes e build locais** (recomendado antes de cada envio):

   ```bash
   npm run check
   ```

   Ele roda lint, testes, build e confere a pasta `dist` (precisa ter `index.html` e `404.html`, e nenhum `.env`, backup ou chave secreta).
2. **Publicar.** Cada `git push` na `main` dispara o workflow [**Publicar no GitHub Pages**](.github/workflows/deploy.yml) (aba **Actions**). Ele: baixa o código → instala o Node da `.nvmrc` → confere as variáveis (falha se faltarem ou se a chave for secreta) → `npm ci` → lint → testes → build com o caminho certo → confere a `dist` → publica. **Se qualquer etapa falhar, nada é publicado.** Também dá para rodar manualmente em **Actions → Publicar no GitHub Pages → Run workflow**.
3. **Obter a URL pública.** Ao terminar, o job *deploy* mostra o link; ele também aparece em **Settings → Pages**. Formato: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.
4. **Configurar a URL de produção no Supabase.** Volte à Etapa B, item 8, e confira a **Site URL** e as **Redirect URLs** com o endereço exato.
5. **Testar o acesso direto às rotas.** Abra numa aba nova (e recarregue com F5): `…/demo/estatisticas`, `…/login`, `…/app/metas` (deve pedir login e voltar para Metas depois), `…/qualquer-coisa` (página não encontrada).
6. **Testar a conta em produção:** crie uma conta em `…/register`, confirme o e-mail, confira que a área está vazia, cadastre um livro e uma sessão, recarregue (continua logado), saia (volta para a página inicial), entre de novo (os dados continuam). Teste também **Esqueci minha senha** até definir a nova senha. Para conferir o isolamento, crie uma **segunda conta** em outra janela anônima: ela não pode ver nada da primeira.

### Etapa E — Testar a demonstração

1. Abra o site **sem estar logado** (janela anônima) e clique em **Experimentar demonstração**.
2. Navegue pelo painel, Biblioteca, Histórico, Estatísticas (os cinco períodos), Metas e conquistas.
3. Faça uma alteração temporária (ex.: adicione um livro ou uma sessão manual) e recarregue: ela continua.
4. Clique em **Restaurar dados iniciais** → **Restaurar**: os dados fictícios voltam ao original.
5. Confirme que nada foi gravado em contas: no Supabase, **Table Editor → books** não tem nenhum registro da demonstração (os ids dela começam com `demo_`, e o banco recusa registros de demonstração). A demonstração não faz nenhuma requisição ao Supabase.

### Etapa F — Importar o seu backup

Seu backup pessoal **não** faz parte do projeto: você o escolhe no seu computador, já com o site publicado.

1. Entre (ou crie) a sua conta em `…/login`.
2. Abra **Configurações → Backup dos dados → Importar JSON** e escolha o arquivo (`readtrack-backup-….json`). Nada é gravado nesse momento.
3. Confira o resumo (quantos livros e sessões) e escolha:
   - **Acrescentar ao que já existe (recomendado):** só entra o que é novo; nada é apagado; importar duas vezes não duplica.
   - **Substituir tudo na conta:** apaga da conta o que não estiver no arquivo. Use só se tiver certeza.
4. Clique em **Acrescentar** e espere a mensagem **"Salvo na sua conta"** — ela só aparece depois que o banco confirma a transação. Se algo falhar, a mensagem de erro diz o motivo e **nada** da conta muda.
5. Confira **Biblioteca**, **Histórico** (observações e vocabulário), **Estatísticas** e **Metas e conquistas**.
6. Saia, entre de novo e recarregue a página: os dados continuam lá.

Tem um **histórico anotado à mão** (formato `readtrack-history-import`)? Use **Histórico → Importar histórico**: a tela pede o ano das anotações, mostra a prévia e grava tudo de uma vez. Um modelo fictício do formato está em [`src/services/historyImport/fixtures/historico-exemplo.json`](src/services/historyImport/fixtures/historico-exemplo.json).

**Recuperar um backup:** exporte com frequência em **Configurações → Exportar JSON** e guarde o arquivo fora do projeto. Antes de cada importação ou limpeza, o app também guarda uma cópia dos dados atuais **neste navegador** (as 5 mais recentes). Para voltar a um backup, importe o arquivo com **Substituir tudo**.

### Etapa G — Atualizações futuras

1. Faça as alterações e teste localmente: `npm run dev`.
2. Rode `npm run check` (lint, testes, build e conferência da `dist`).
3. Crie um commit: `git add .`, `git status` (confira que nenhum arquivo pessoal entrou) e `git commit -m "descrição da mudança"`.
4. Envie: `git push`.
5. Acompanhe a publicação na aba **Actions**. Se um passo falhar, abra o log, corrija e envie de novo — o site anterior continua no ar enquanto isso.
6. Se a mudança alterar o banco, rode o `supabase/schema.sql` novo no SQL Editor **antes** de publicar.
7. Faça backups periódicos (**Exportar JSON**), principalmente antes de importar ou de grandes mudanças.

---

## Banco de dados e segurança

O SQL completo está em [`supabase/schema.sql`](supabase/schema.sql): tabelas, chaves estrangeiras, índices, regras de integridade, gatilhos, políticas RLS e a função `import_backup`. É aditivo e idempotente (testado aplicando-o duas vezes sobre um banco da 1.5.0 com dados: nada foi apagado ou alterado).

| Tabela | Conteúdo | Chave |
| --- | --- | --- |
| `profiles` | Um por usuário do Supabase Auth: nome exibido, preferências e metas pessoais. Criado automaticamente no cadastro, com os valores padrão. | `id` → `auth.users` |
| `books` | Título, autor, descrição, capa, total de páginas (opcional), página atual, página inicial da leitura, `added_as_read`, status, datas, comentário final (`rating`, `review`, `learnings`). | `(user_id, id)` |
| `reading_sessions` | Livro, início e término (`timestamptz`; aceita leituras que passam da meia-noite), duração registrada, pausas, intervalos lidos, páginas, páginas novas, observação, `source` (`timer`/`manual`) e vocabulário. | `(user_id, id)`, FK `(user_id, book_id)` → `books` (cascata) |
| `active_sessions` | Cronômetro em andamento (no máximo um por usuário). | `user_id`, FK `(user_id, book_id)` |
| `achievements` | Conquistas desbloqueadas e a data. | `(user_id, achievement_id)` |

Índices: `(user_id, status)` e `(user_id, updated_at)` em livros; `(user_id, book_id)` e `(user_id, started_at desc)` em sessões; `(user_id, book_id)` no cronômetro. Regras no banco: página atual ≤ total, páginas lidas coerentes com a convenção da sessão, término depois do início, duração ≤ 24 h, avaliação 1–5, data de conclusão só em livro concluído, limites de tamanho de texto e, desde a 1.6.0, **nenhum registro de demonstração** (`books_no_demo`, `sessions_no_demo`).

**Segurança**
- **RLS ligada em todas as tabelas**, com políticas de leitura, criação, alteração e exclusão restritas a `user_id = auth.uid()`. Trocar ids na chamada da API não dá acesso a dados de outra conta: a chave estrangeira composta impede até ligar uma sessão ao livro de outra pessoa.
- O papel `anon` (visitante sem login) não tem privilégio em nenhuma tabela nem na função de importação.
- `import_backup` roda com os privilégios de quem chama (`security invoker`): a RLS continua valendo e o `user_id` gravado é sempre o da conta logada — o que vier no arquivo é ignorado.
- O frontend usa **só a chave pública**. O app (`services/supabase/config.js`), o workflow (`scripts/check-env.mjs`) e a conferência do build (`scripts/check-dist.mjs`) recusam chaves secretas.
- **CSP:** o build insere uma Content-Security-Policy no `index.html` (scripts só do próprio site, conexões só com o seu Supabase, fontes do Google). Limitação do GitHub Pages: ele não permite cabeçalhos HTTP próprios, então proteções que só funcionam como cabeçalho (como impedir que o site seja exibido dentro de outro, `frame-ancestors`/`X-Frame-Options`) não estão ativas lá. Na Vercel, o `vercel.json` envia esses cabeçalhos.
- **Isolamento entre duas contas:** coberto pelo `rls_check.sql` (no banco) e pelo teste manual da Etapa D, item 6.

**Se o seu banco veio de uma versão antiga** e tinha dados de exemplo enviados por engano (raro), confira com `select count(*) from public.books where is_demo;`. Esses registros não são apagados automaticamente; se existirem e você quiser removê-los, faça isso manualmente no SQL Editor (`delete from public.books where is_demo;` apaga também as sessões deles).

O dicionário foi removido na v1.3. Bancos antigos ainda podem ter a tabela `dictionary_history`; para apagá-la, rode [`supabase/cleanup_dictionary.sql`](supabase/cleanup_dictionary.sql) (apaga as buscas antigas de todos os usuários, sem volta).

## Backup e importação

**Formato** (`readtrack-backup`, versão 1, sem mudanças na 1.6.0 — arquivos exportados por versões anteriores continuam válidos):

```json
{ "format": "readtrack-backup", "formatVersion": 1, "app": "ReadTrack", "exportedAt": "…", "schemaVersion": 2,
  "data": { "books": [], "sessions": [], "goals": {}, "settings": {}, "achievements": [], "activeSession": null } }
```

**O importador**
- Valida o arquivo inteiro antes de qualquer gravação: JSON, formato, versão (recusa arquivos de versões mais novas), ids repetidos e cada livro, sessão e cronômetro. Um único registro inválido recusa o arquivo todo, com a contagem do que está errado.
- Mostra o resumo (livros, sessões, data da exportação) e exige confirmação. Nada muda antes dela.
- **Acrescentar** (padrão): só entram livros e sessões novos; livros com o mesmo título recebem as sessões em vez de serem duplicados; sessões repetidas são puladas; nos livros que já existiam, só o progresso é atualizado pelas sessões novas.
- **Substituir tudo**: troca livros, sessões, cronômetro, metas e preferências da conta pelos do arquivo; as conquistas são recalculadas.
- Na conta, tudo é gravado numa **única transação** (`import_backup`): ou entra tudo, ou nada muda. O sucesso só aparece depois da confirmação do banco; a tela então é relida do banco.
- Registros de demonstração (de versões antigas ou da demonstração pública) são ignorados e o resumo avisa quantos; um arquivo salvo pela demonstração é recusado.
- Antes de importar, uma cópia dos dados atuais fica guardada neste navegador.

## Regras de cálculo

### Calendário

- Tudo usa o fuso horário do navegador. Um dia vai de 00:00 a 23:59, e os períodos são `[início, fim)`.
- A semana começa na segunda-feira, ou no domingo, nas Configurações.

### Divisão das sessões pelos dias

- Uma sessão é dividida entre os dias em que a leitura aconteceu, pelos intervalos do cronômetro. Exemplo: das 23:40 às 00:20, são 20 min em cada dia.
- As páginas seguem a mesma proporção, em números inteiros que somam o total.
- A sessão conta no dia em que começou.
- **Sessões manuais que passam da meia-noite seguem a mesma regra**, já existente desde a 1.0 e usada pelo gráfico diário, pelas metas do dia e pela sequência: o tempo e as páginas são repartidos pelo relógio real entre início e término, proporcionalmente à **duração registrada** (a soma dos dois dias é exatamente a duração anotada, sem duplicar nada); a sessão aparece e é contada no dia em que começou. Mudar para "tudo no dia de início" faria as sessões manuais e as do cronômetro seguirem regras diferentes no mesmo gráfico. Sessão manual sem horário de término fica inteira no dia de início.
- O fuso é o do navegador; as datas importadas são gravadas no horário de Brasília (−03:00).

### Páginas

- **Cronômetro:** convenção do marcador, páginas lidas = final − inicial. Sessões de 0→30 e 30→50 somam 50.
- **Sessão manual:** primeira e última página lidas, **inclusive** (como se anota à mão): 9 a 14 = 6 páginas.
- **Páginas novas** são a união das páginas cobertas pelas sessões do livro, em ordem cronológica: lacunas não são preenchidas, sessões fora de ordem não viram releitura, e nenhuma página é contada duas vezes. Páginas antes da página inicial da leitura não contam.
- **Progresso** = páginas de leitura alcançadas ÷ (total − página inicial + 1). Sem página inicial, é a página atual ÷ total, como antes.
- O progresso do livro é a maior página alcançada, nunca a soma das sessões.
- Ao editar ou excluir uma sessão: as páginas novas das sessões daquele livro são recalculadas em ordem cronológica (cada sessão conta só o que passou da sua página inicial e do que as anteriores já cobriram); a página atual acompanha as sessões, sem recuar abaixo da página em que a sessão alterada começou e sem desfazer progresso registrado à mão. Livro concluído continua concluído.
- **Páginas registradas** incluem releitura. **Páginas novas** contam só o avanço nos livros.

### Médias, ritmo e comparação

- Médias por sessão usam as sessões iniciadas no período. A média diária divide pelos dias já decorridos, incluindo dias sem leitura.
- O ritmo só aparece com pelo menos 10 minutos e 5 páginas. Sessões de duração zero ou não informada são ignoradas.
- Tempo total, médias e ritmo usam só a **duração registrada**. A duração calculada pelos horários nunca é somada nem usada no lugar dela. Sessões sem duração contam como sessão e como páginas, mas ficam fora das médias de tempo; o Histórico mostra quantas são.
- Um período em andamento é comparado com os mesmos dias do período anterior (1–15 out × 1–15 set).

### Livros concluídos e livros lidos antes do ReadTrack

- "Livros concluídos" inclui os livros cadastrados como já lidos. O Dashboard mostra quantos são.
- Nos períodos (Estatísticas), um livro conta como concluído pela data de conclusão. Livros sem data não entram em nenhum período, e a página avisa quantos são.
- Páginas lidas, tempo, ritmo, médias, gráficos, metas e sequência vêm **só de sessões** (cronometradas ou manuais). As páginas de um livro já lido não viram "páginas lidas", e sem sessões o tempo aparece como "—".
- A conquista "Primeiro livro concluído" usa a data de conclusão informada; sem data, vale a data do cadastro.
- Excluir um livro exclui as sessões dele (no banco, por chave estrangeira em cascata). A confirmação lista quantas sessões, páginas, tempo e observações saem das estatísticas e sugere exportar um backup antes.

### Períodos e conquistas (1.5)

- **3 meses**: os três últimos meses do calendário até o dia escolhido (18/10 → 19/07 a 18/10), comparados com os três meses imediatamente anteriores. **Histórico total**: do primeiro registro até hoje, sem período anterior.
- Os gráficos agrupam sem descartar dados: a soma dos pontos é sempre o total do período. A distribuição por hora usa os horários reais das sessões (uma sessão sem término fica na hora em que começou).
- Dados de exemplo gravados por versões antigas (marcados `isDemo`) não entram nas Estatísticas nem nas Conquistas quando existe pelo menos uma sessão sua. A demonstração pública (1.6.0) é separada e nunca se mistura aos seus dados.
- Conquistas são recalculadas dos registros a cada sessão adicionada, editada ou excluída. Se os registros deixarem de alcançar um nível, ele volta a "em andamento" (sai também da conta). A **meta semanal** é exceção: usa a meta atual e, uma vez cumprida, é permanente, porque o histórico de metas não é guardado.
- Sequência: o nível é desbloqueado pela maior sequência já feita; o anel do próximo nível usa a sequência atual. Tempo conta só sessões com duração registrada.

### Sequência

- Um dia conta quando tem pelo menos 1 minuto de leitura.
- Hoje só entra depois que você ler.

## Dados e privacidade

- **Conta:** os dados ficam no seu projeto Supabase, protegidos por RLS. A sessão de login é guardada pelo `supabase-js` no `localStorage` do navegador.
- **Demonstração:** dados fictícios, só no navegador do visitante (`readtrack:demo`), separados de tudo. Não há dados pessoais no código da demonstração.
- **Modo local** (sem Supabase configurado): os dados ficam só no navegador (`readtrack:data`). Use **Exportar JSON** para guardar uma cópia.
- O repositório não contém dados pessoais: os testes e o modelo de histórico usam dados fictícios.
- Requisições externas: o seu projeto Supabase (só na área pessoal e nas telas de conta) e o Google Fonts.

## Testes

- `npm test` roda os testes unitários (`node:test`): datas e períodos, sessões que atravessam a meia-noite, ritmo, sequências, metas, conquistas (inclusive os alvos novos da 1.6.0 e a limpeza dos ids antigos), cronômetro, validação e migração de dados, importação/exportação, os dados fictícios da demonstração (válidos, nada no futuro, conquistas e metas com progresso) e o isolamento da área da demonstração, caminhos das rotas (inclusive proteção contra redirecionamento para outro site), CSP e o mapeamento da importação atômica. Um dos testes só roda com o computador no horário de Brasília.
- `supabase/tests/rls_check.sql` testa as políticas direto no banco (35 verificações, com duas contas simuladas).
- Testes de interface no navegador (página inicial, rotas diretas, demonstração, cadastro, login, logout, confirmação de e-mail, recuperação de senha, duas contas, importação e exportação, responsividade) foram executados durante o desenvolvimento com Playwright contra um Supabase local (Auth + PostgREST + PostgreSQL), com scripts **fora deste repositório**.

## Limitações conhecidas

- A área pessoal exige internet: não há modo offline. Sem conexão, as alterações ficam na tela e são reenviadas quando a conexão volta; o navegador avisa antes de fechar a aba com algo pendente.
- Conflitos entre dispositivos: vale a última gravação, registro a registro.
- GitHub Pages: rotas profundas respondem com status HTTP 404 (o conteúdo aparece normalmente) e não há cabeçalhos de segurança próprios (veja [Segurança](#banco-de-dados-e-segurança)). Na Vercel, ambos são resolvidos pelo `vercel.json`.
- O serviço de e-mail padrão do Supabase tem limite baixo de envios; para uso real, configure um SMTP próprio.
- Capas enviadas como imagem são gravadas no banco como texto (data URL); backups com muitas capas grandes ficam pesados.
- A demonstração guarda as alterações do visitante só no navegador dele; sem alterações, ela é recriada a cada dia com datas novas.
- Conquistas da meta semanal usam a meta atual para todas as semanas (o histórico das metas não é guardado).
- Em sessões do cronômetro, data e horários não podem ser editados e a duração só pode diminuir. Sessões manuais podem ser editadas por inteiro.
- O site é renderizado no navegador (SPA): os metadados de SEO são os mesmos em todas as páginas.

## Capturas de tela

Veja [`docs/screenshots/README.md`](docs/screenshots/README.md) para a lista de imagens sugeridas.
