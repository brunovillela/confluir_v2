# Plano de documentação — em ondas

Data: 18/10/2026. Caminhos relativos a `confluir/`. O ponto de partida é a comparação com as cinco camadas de documentação de um SaaS de classe mundial: produto, usuário, engenharia, operação e conformidade. A camada do usuário já está coberta pelo manual completo. Este plano cobre o resto, começando pelo que é **risco real** e não só lacuna de papel.

Princípios:
- **Documento gerado vence documento escrito.** O que pode ser extraído do banco ou do código (dicionário, RLS, inventário de dados pessoais) é gerado por script e regenerado a cada mudança. Texto à mão só onde há decisão humana.
- **Cada item tem "como verificar".** Nada é dado como pronto sem a verificação executada.
- **Conformidade é rascunho técnico, não parecer.** Os documentos da Onda B saem prontos para o jurídico/encarregado validar. Base legal e prazos de retenção são **propostas**.
- **Tudo em `docs/`**, versionado com o código. Estrutura final:

```
docs/
  dados/          dicionário, diagramas ER, RLS, classificação LGPD (gerados)
  lgpd/           ROPA, RIPDs, suboperadores, retenção, incidentes, direitos do titular
  votacao/        dossiê de auditoria da votação
  arquitetura/    C4 + adr/NNNN-titulo.md
  operacao/       runbooks, DR, monitoramento, integrações
  produto/        glossário, regras de negócio, notas de versão
```

---

## Diagnóstico (levantado em 18/10)

**Schema**
- `supabase/` tem **~240 arquivos `.sql` soltos** (107 deles criam tabelas, 20 são seeds do demo), executados à mão no SQL Editor, sem registro de quais rodaram em qual banco nem em que ordem.
- O código usa **318 tabelas/views**. Delas, **114 não são criadas por nenhum arquivo do repositório**: o núcleo (`filiacao`, `compras`, `contratos`, `documentos`, `dados_bancarios`, `enderecos`, `diretoria`…) nasceu no dashboard durante a migração do Bubble. **Hoje não é possível reconstruir o banco a partir do repositório.** Isso afeta o DR, o ambiente de testes e a entrada de um segundo desenvolvedor.
- Ponto positivo: os arquivos recentes são idempotentes (`if not exists` / `or replace`) e comentados com POR QUÊ/COMO. A convenção é boa, só falta ordem e registro.

**Dados pessoais**
- A base inteira é **dado sensível** pela LGPD: filiação a sindicato está no art. 5º, II. Além dela, há saúde (CAT, ASO, prontuário), voto, dados bancários, contracheque, ponto, CNH, foto, CPF e dependentes.
- Papéis: cada **entidade (tenant) é controladora**, o **Confluir é operador**, e há suboperadores.
- Já existe: trilha `auditoria` (escritas em tabelas sensíveis, `supabase/auditoria.sql`), `login_tentativas`, colunas cifradas, `store: false` nas chamadas de IA (`src/lib/ia.ts`), página de autosserviço `/meus-dados/[token]`, Sentry com CPF mascarado.
- Não existe: política de privacidade pública, ROPA, RIPD, lista de suboperadores, política de retenção, plano de incidente, nem registro de **leitura** de dado sensível (a trilha só grava escritas).

**Suboperadores identificados no código:** Supabase (banco/auth/storage, sa-east-1), Vercel (hospedagem), OpenAI (IA: lê PDFs de CAT, contracheques, notas e atas), Resend e Brevo (e-mail), Sentry (erros, ingestão na UE), Cloudflare Turnstile, Telegram (bot), Bubble (legado, ainda grava hotel/portal/anuênio), web-push (navegador do usuário). Consultas a dados públicos: BrasilAPI, minhareceita.org, ViaCEP, Open-Meteo, ITI/ICP-Brasil.

---

## Onda A — Schema reproduzível e dicionário de dados (≈ 6 dias)

### A1. Linha de base do schema (1 dia)
- Extrair o schema de produção **sem dados**: `supabase db dump --schema public` (CLI) ou `pg_dump --schema-only --no-owner`. Inclui tabelas, views, funções, triggers, RLS, grants e extensões.
- Gravar em `supabase/migrations/20261018000000_linha_de_base.sql`.
- Extrair à parte o que o dump de `public` não pega: buckets e policies de `storage`, configurações de auth e templates (já em `supabase/email-templates/`). Registrar em `docs/operacao/supabase-configuracao.md`.
- **Precisa do usuário:** a connection string do banco (senha) só na máquina dele, ou rodar o comando ele mesmo.
- **Verificar:** subir um Postgres vazio (Supabase local ou projeto descartável), aplicar a linha de base e conferir que a contagem de tabelas, funções e policies bate com produção.

### A2. Nova convenção de migrações (1 dia)
- Daqui em diante: `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`, idempotente, com o cabeçalho POR QUÊ/COMO de hoje.
- Os ~240 arquivos atuais vão para `supabase/historico/` (já estão aplicados e contidos na linha de base). Os seeds do demo vão para `supabase/seed/`.
- Registro de aplicação: tabela `public.migracoes_aplicadas (arquivo, sha256, aplicado_em, aplicado_por)`, mais um script `scripts/migracoes.mjs` com `status` (lista pendentes e divergentes) e `aplicar` (roda as pendentes numa transação e registra). Alternativa: adotar o `supabase migration` da CLI. **Decisão a tomar**: a CLI é o padrão de mercado, o script próprio encaixa no fluxo atual do SQL Editor.
- Atualizar `CLAUDE.md`/`AGENTS.md`: "SQL novo = arquivo em `migrations/`, nunca solto". A regra "SQL roda antes do commit" continua valendo.
- **Verificar:** `migracoes.mjs status` em produção mostra 0 pendentes. Uma migração de teste no demo aparece como aplicada.

### A3. Detecção de deriva (0,5 dia)
- Script que compara o schema vivo com linha de base + migrações e acusa o que foi mudado direto no dashboard.
- Rodar antes de cada deploy com SQL e semanalmente (cron já existe na Vercel, `CRON_SECRET`), avisando no Telegram se houver deriva.
- **Verificar:** criar uma coluna de teste no demo pelo dashboard e ver o alerta.

### A4. Comentários no banco (1,5 dia)
- Uma migração com `comment on table/column` para as tabelas do núcleo (as 114 sem arquivo primeiro), escritos a partir do código e das memórias de módulo. Os arquivos recentes já comentam.
- Junto, a **classificação LGPD por coluna**, num formato curto dentro do comentário ou numa tabela `dados_classificacao (tabela, coluna, categoria, finalidade)`:
  - `identificacao`: nome, CPF, e-mail, telefone, endereço
  - `sensivel_sindical`: filiação, voto, oposição
  - `sensivel_saude`: CAT, ASO, prontuário, afastamentos
  - `financeiro`: dados bancários, contracheque, contribuições
  - `trabalhista`: ponto, férias, folha
  - `credencial`: hashes, tokens (nunca exportar)
  - `nenhum`
- **Verificar:** consulta que lista colunas sem comentário em tabelas com dado pessoal → 0.

### A5. Dicionário gerado (1 dia)
- `scripts/gerar-dicionario.mjs` lê `information_schema` + `pg_description` + `pg_policies` e escreve:
  - `docs/dados/dicionario/<modulo>.md`: tabela, finalidade, colunas (tipo, nulo, padrão, FK, classificação, comentário), índices, triggers de auditoria
  - `docs/dados/er/<modulo>.md`: diagrama Mermaid `erDiagram` por módulo (o banco inteiro num diagrama só é ilegível)
  - `docs/dados/rls.md`: policies por tabela, apontando tabelas com RLS sem policy (a armadilha do "deny-all" já conhecida) e tabelas sem `emp_proprietaria_id`
  - `docs/dados/dados-pessoais.csv`: insumo direto da Onda B
- O agrupamento por módulo segue os prefixos (`filiacao_*`, `compras_*`, `eventos_*`…) e um mapa manual para as exceções.
- **Verificar:** o dicionário cobre as 318 tabelas usadas pelo código, e regenerar não produz diff sem mudança no banco.

### A6. Restauração de verdade (1 dia, fecha a onda)
- Montar um banco do zero = linha de base + migrações + seed do demo, e subir o app contra ele.
- **Verificar:** login no demo, abrir filiados, financeiro e votação sem erro. Isso vira o ambiente de E2E e o primeiro teste de DR (Onda E).

---

## Onda B — LGPD (≈ 7 dias de trabalho técnico + validação jurídica)

Ordem pensada para que cada documento alimente o próximo.

### B1. Inventário e ROPA (1,5 dia)
- `docs/lgpd/ropa.md`, um registro por **processo** (não por tabela): filiação e desfiliação, contribuições/receitas, votação e assembleias, oposição, saúde (CAT/ASO), pessoal/RH (ponto, folha, férias), diretoria e diárias, comunicação (mensagens, aniversariantes, TV), eventos e hospedagem, veículos/condutores, compras/fornecedores (PF), recursos de IA.
- Cada registro informa: finalidade, categorias de titulares, categorias de dados (vindas de `dados-pessoais.csv`), base legal proposta, compartilhamentos, suboperadores, transferência internacional, retenção e medidas de segurança.
- **Verificar:** toda coluna classificada ≠ `nenhum` aparece em ao menos um processo.

### B2. Suboperadores e transferência internacional (1 dia)
- `docs/lgpd/suboperadores.md`: fornecedor, o que recebe, região, DPA assinado (link), certificações, data de revisão.
- Atenção à **OpenAI**: recebe PDFs de CAT (saúde) e contracheques, com transferência internacional (art. 33). Confirmar e documentar: `store: false` em todas as chamadas (hoje aparece em duas, varrer as demais), política de não treinamento da API, região. Avaliar se o envio de CAT exige consentimento ou outra base, ou se a CAT deve ser pseudonimizada antes do envio.
- **Bubble**: ainda grava dados (hotel/portal/anuênio). Documentar até quando, e o plano de apagar os dados lá após o desligamento.
- **Verificar:** cada host externo do código (`grep https://` em `src/`) aparece na lista ou está marcado como "consulta pública, sem dado pessoal".

### B3. RIPD dos tratamentos de alto risco (2 dias)
Três relatórios em `docs/lgpd/ripd-*.md`, no modelo da ANPD (descrição, necessidade/proporcionalidade, riscos, medidas, risco residual):
1. **Saúde ocupacional + IA**: CAT, ASO, painel analítico, leitura de PDF por IA.
2. **Votação online**: sigilo, identificação do eleitor, link pessoal, e-mail corporativo.
3. **Base de filiados multi-tenant**: isolamento por RLS, acesso de admin da plataforma, "Ver como filiado".
- **Verificar:** cada risco listado aponta para uma medida que existe no código (arquivo/linha) ou para um item pendente com dono.

### B4. Retenção e descarte (1 dia)
- `docs/lgpd/retencao.md`: prazo por categoria com o fundamento. Exemplos a validar: documentos trabalhistas e financeiros pelos prazos fiscais/trabalhistas; CAT e ASO pelas NRs; atas e votação pelo estatuto; logs de acesso por 6 meses (Marco Civil, art. 15); desfiliados: o que fica (histórico de contribuição) e o que é anonimizado.
- Lista do que hoje **não tem descarte**: backups JSON locais em `supabase/*backup*.json` (fora do git, mas em disco), storage de documentos, dados no Bubble, eventos do Sentry.
- A rotina automática de anonimização fica como item de implementação, fora deste plano.

### B5. Direitos do titular (0,5 dia)
- `docs/lgpd/direitos-titular.md`: como a entidade atende confirmação, acesso, correção, portabilidade, eliminação e revogação (art. 18), dentro do prazo, usando o que já existe (`/meus-dados`, ficha, exportação de relatórios). Apontar as lacunas: não há exportação "tudo sobre mim", e a eliminação esbarra em dados de guarda obrigatória.
- Inclui o roteiro para o Confluir, como operador, apoiar a entidade num pedido.

### B6. Política de privacidade e avisos (1 dia + jurídico)
- Modelo de **política de privacidade por tenant** (encarregado, contato e nome da entidade vêm da configuração do tenant) publicado numa rota pública `/privacidade`, mais a **política do próprio Confluir** para o site.
- Avisos curtos com link nos formulários públicos: `/filiar`, `/inscricao`, `/votar`, `/oposicao`, `/hospedagem`, `/evento`.
- Modelo de **contrato de operação de dados (DPA)** entre Confluir e a entidade.
- **Precisa do usuário:** quem é o encarregado do Confluir e o contato de cada entidade.

### B7. Incidentes de segurança (0,5 dia)
- `docs/lgpd/incidentes.md`: classificação, quem decide, modelo de comunicação à entidade (controladora) e o apoio dela à comunicação à ANPD e aos titulares, no prazo do regulamento da ANPD (3 dias úteis). Registro de incidentes mesmo quando não comunicados. Ligações com o Sentry e com os alertas da Onda E.

### B8. Lacuna técnica a abrir como item de implementação
- **Registro de leitura de dado sensível.** A `auditoria` grava só escritas. Para saúde e voto, a pergunta "quem viu a CAT de fulano?" não tem resposta hoje. Propor uma tabela de acessos alimentada pelas páginas/actions que exibem esses dados. Fica registrada aqui e é implementada fora do plano de documentação.

---

## Ondas seguintes (em resumo; detalhar quando a A e a B fecharem)

**C — Dossiê de auditoria da votação (≈ 2 dias).** `docs/votacao/`: modelo de ameaça, como se garantem sigilo (separação voto × participação), unicidade (reserva antes do voto, testada com 10 reservas simultâneas na Onda 0), integridade e apuração. Inclui os relatórios emitidos e o roteiro para responder a uma impugnação. Reaproveita `plano-votacao-online-adequacao.md` e a análise de 16/10.

**D — Arquitetura e decisões (≈ 3 dias).** `docs/arquitetura/`: C4 níveis 1–3 em Mermaid (contexto, containers, módulos) e **ADRs** migrando para o repositório as decisões que hoje vivem só nas memórias do Claude: multi-tenant por subdomínio, RLS + `createAdminClient`, região sa-east-1, IA via `lib/ia.ts`, padrão de 3 níveis do Pessoal, "duas portas, mesma tabela" das diárias, teto de 1.000 linhas do PostgREST, fuso/`deCampoDataHora`, migração do Bubble. Uma ADR curta por decisão (contexto, decisão, consequências).

**E — Operação e continuidade (≈ 3 dias).** `docs/operacao/`: runbooks (deploy, rollback na Vercel, aplicar migração, criar tenant, suspender tenant, rotacionar chaves, incluindo a `ANTHROPIC_API_KEY` pendente), inventário de integrações (dono, credencial, o que fazer quando cai), monitoramento (Sentry, crons, deriva de schema), e **DR com RPO/RTO declarados e restauração testada**, usando o banco do zero da A6 mais um restore de backup do Supabase.

**F — Produto (≈ 2 dias, contínuo).** `docs/produto/`: glossário do domínio (fonte pagadora, apto, rodada, custeio, RPA, remessa, competência…), catálogo de regras de negócio com ID (carência, estorno em 15 dias, corte no dia 15, prazos de aprovação…) apontando para o código, e notas de versão para os usuários a partir do `git log`.

---

## Ordem e dependências

| Ordem | Onda | Depende de | Precisa do usuário |
|---|---|---|---|
| 1 | A1–A3 | — | connection string do banco / rodar o dump; escolher CLI × script próprio |
| 2 | A4–A6 | A1 | — |
| 3 | B1–B2 | A5 (`dados-pessoais.csv`) | revisar o DPA dos fornecedores (contas dele) |
| 4 | B3–B7 | B1 | encarregado do Confluir; validação jurídica de bases legais e prazos |
| 5 | C, D | — (podem correr em paralelo a B) | — |
| 6 | E | A6 | acesso aos backups do Supabase |
| 7 | F | — | — |

Estimativa: **A ≈ 6 dias, B ≈ 7 dias** de trabalho técnico; C–F ≈ 10 dias.

## Andamento

- 18/10/2026 — plano escrito.
- 18/10/2026 — **A1 em andamento.** Decidido: CLI do Supabase (`supabase@2.121.0` em devDependencies, `supabase/config.toml` criado com `supabase init`). Sem Docker na máquina, então o `supabase db dump` não serve. A linha de base sai do pg_dump 17 local via `scripts/linha-de-base-schema.mjs`, e a CLI cuida de `migration new/list/repair/up` com `--db-url`. Aguardando `SUPABASE_DB_URL` no `.env.local` para extrair.
- 18/10/2026 — **A1: linha de base extraída** em `supabase/migrations/20261018000000_linha_de_base.sql` (37 mil linhas, 1,2 MB). Contagens de produção em `docs/operacao/linha-de-base-contagens.md`: Postgres 17.6, 346 tabelas (todas com RLS), 318 policies, 28 funções, 322 triggers, 21 buckets, 0 policies de storage, 0 triggers em `auth.users`. As contagens do arquivo batem com o banco. Varredura de segredos no arquivo: nada (sem chaves, URLs, e-mails). Ajustes para rodar num Supabase novo: `CREATE SCHEMA IF NOT EXISTS public` e sem os `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`. `npx supabase migration list --db-url` lê a migração local, e o remoto está sem registro.
  - **Achado (isolamento entre tenants):** 65 colunas têm `DEFAULT 'c763cb99-…'` (o tenant principal, `NEXT_PUBLIC_EMP_PROPRIETARIA_ID`), e a função `analitica_filiacao` também cita esse UUID. Um insert que esqueça `emp_proprietaria_id` cai em silêncio no tenant principal. Correção sugerida: migração que remove esses defaults (o insert sem tenant passa a falhar por `NOT NULL`), depois de conferir que todo insert do código informa o tenant. Fica para depois da A2.
  - Linha de base marcada como aplicada em produção (`migration repair`, que criou `supabase_migrations.schema_migrations`). **A1 CONCLUÍDA** (commit 2289358). A restauração num banco vazio é a A6.
- 18/10/2026 — **A2 CONCLUÍDA.** 221 SQLs soltos movidos com `git mv` para `supabase/historico/`; as 21 seeds do demo e o README para `supabase/seed/demo/`. As ~640 referências `supabase/<nome>.sql` nos comentários de `src/` **não foram reescritas** (muitos desses arquivos tinham trabalho em curso de outra sessão). O `supabase/LEIA-ME.md` e o `AGENTS.md` explicam o mapeamento. Atalhos `npm run db:nova | db:status | db:aplicar` (`scripts/db.mjs`: chama a CLI do projeto sem shell, nunca imprime a URI, `aplicar` mostra as pendentes e exige "sim"). Testados: status lê o remoto, nova cria o arquivo, aplicar recusado não aplica nada. Regra "banco só por migração" no `AGENTS.md`. O `[db.seed]` do `config.toml` fica como está: as seeds do demo dependem de ordem e do login do demo, e isso será resolvido na A6.
- 18/10/2026 — **A3 CONCLUÍDA.** Primeira migração pelo fluxo novo: `20261018151458_schema_impressao.sql` cria `public.schema_impressao()`, que devolve o md5 de cada objeto nosso (tabelas/colunas/RLS, privilégios, views, restrições, índices, policies de public e storage, triggers, funções, enums, extensões e buckets): 4.049 objetos. É só leitura de catálogo, `security definer`, executável só por service_role (anon e authenticated conferidos sem acesso). A impressão registrada fica em `supabase/schema-impressao.json`. O `db:aplicar` a regrava, o `npm run db:deriva` compara (e avisa também sobre migração local não aplicada ou aplicada sem arquivo), e o cron `/api/schema/deriva/tick` (segundas, 10:00 UTC) compara e avisa no **Sentry**, não no Telegram, porque o bot é por usuário e não tem destinatário da plataforma. Verificado: aplicada com `echo sim | npm run db:aplicar`; `db:deriva` sem deriva; impressão adulterada (1 policy alterada, 1 tabela tirada, 1 índice fantasma) → acusou as 3; DDL real em transação desfeita (`create table`) → +2 objetos (tabela e privilégios); tick no servidor local: 401 sem segredo e `ok: true` com 4.049 objetos.
- 18/10/2026 — **A4 CONCLUÍDA.** Migração `20261018153132_comentarios_lgpd.sql` (só `COMMENT ON`), aplicada. As 346 tabelas têm descrição e etiqueta `[lgpd:<categorias>|titulares:<quem>]` ou `[lgpd:nenhum]`, e 929 colunas têm `[lgpd:<categoria>]`. Descrições e classificação foram redigidas por domínio a partir do código, com 7 revisores em paralelo. Comentários que já existiam foram mantidos e ganharam a etiqueta. Resultado: **189 tabelas com dado pessoal** (identificação 144, sensível sindical 52, trabalhista 48, financeiro 44, credencial 19, saúde 17), 157 sem. Verificado no banco: 0 tabelas sem etiqueta. Há 8 tabelas com dado pessoal só "pela existência" (ligação a filiado) e sem coluna etiquetada, o que é esperado.

- 18/10/2026 — **A5 CONCLUÍDA.** `scripts/gerar-dicionario.mjs` (`npm run db:dicionario`) gera `docs/dados/` direto do banco:
  - `LEIA-ME.md`;
  - `dicionario/<modulo>.md` (17 módulos, 347 tabelas: colunas, tipos, padrões, FKs, LGPD, índices, triggers, RLS);
  - `er/<modulo>.md` (Mermaid, só chaves);
  - `rls.md` (policies e alertas);
  - `views-e-storage.md` (6 views, 21 buckets);
  - `dados-pessoais.csv` (insumo do ROPA).

  O `db:aplicar` passou a regerar o dicionário junto com a impressão.

  Verificado:
  - Regerar sem mudança no banco não dá diff.
  - Todas as tabelas, views e buckets usados pelo código estão documentados.
  - Nenhuma tabela está sem RLS.
  - Nenhuma policy vale para anon sem exigir `tenant_id`. As 11 tabelas de votação com policy para `public` exigem a claim; um GET com a anon key devolveu 0 linhas.

  Registrado no `rls.md`, para a limpeza do legado:
  - 30 tabelas têm RLS sem policy (só o service_role lê). São quase todas legado vazio do Bubble, além de `tenants` e `plataforma_admins`, que são assim de propósito.
  - 47 tabelas não têm `emp_proprietaria_id` e isolam pelo pai ou são de plataforma.
  - 3 buckets são públicos: `comunicacao`, `noticias`, `organizacao`.

- 18/10/2026 — **A6 CONCLUÍDA. ONDA A CONCLUÍDA.** `scripts/restaurar.mjs` (`npm run db:restaurar`) reconstruiu o banco num projeto Supabase descartável (`SUPABASE_DB_URL_RESTAURO`), só a partir de `supabase/migrations/`. O script recusa produção e banco não vazio.
  - **1ª rodada: 25 diferenças.** O banco restaurado saía **mais permissivo** que produção. As revogações feitas à mão na revisão de segurança (EXECUTE de funções `analitica_*`, `mesclar_*`, `unificar_*`, `registrar_auditoria`…, escrita em `auditoria`, `fato_*`…) não vêm no `pg_dump`, e um projeto novo concede tudo por padrão. Dois CHECKs diferiam só nos parênteses.
  - **Correção:** a migração `20261018173409_privilegios_exatos` (aplicada) revoga e concede de novo exatamente o que produção tem nesses 23 objetos e recria os 2 CHECKs. `schema_impressao()` passou a ordenar as listas de privilégios.
  - **2ª rodada: IDÊNTICO** nos 4.063 objetos.
  - **Seeds:** com `--seed`, as 21 seeds do demo rodam na ordem das dependências, inclusive repetidas. A `demo-seed-filiados.sql` estava quebrada: ainda gravava `filiacao_vinculos.filiacao_condicao`, coluna removida em setembro. Corrigida.
  - **Não feito:** subir o app contra o banco restaurado, o que exigiria as chaves de API e um usuário de auth no projeto descartável. O teste de app fica para o ensaio de DR (Onda E).

- 18/10/2026 — **B1 CONCLUÍDA (rascunho técnico).** ROPA em `docs/lgpd/ropa.md`, gerado por `npm run lgpd:ropa` (`scripts/gerar-ropa.mjs`) a partir de `docs/lgpd/processos.mjs` (texto revisável) e de `docs/dados/dados-pessoais.csv` (banco).
  - **Conteúdo:** 16 processos, com finalidade, titulares, categorias, base legal proposta, compartilhamento, suboperadores, transferência internacional, retenção proposta, medidas e observações. Duas seções transversais (IA e Bubble) e a tabela de suboperadores.
  - **Cobertura:** 190/190 tabelas com dado pessoal. O gerador falha se uma tabela nova ficar sem processo, e o `db:aplicar` o roda junto.
  - **Correções do diagnóstico:**
    - Webhooks: o único destino ativo é `127.0.0.1` (teste), então hoje nada sai.
    - A LGPD já tem anonimização, acervo de saúde retido com cifragem, histórico de aceites e a view `lgpd_retencoes_vencidas`. A B4 parte disso.
  - **Pendente:** validação jurídica das bases legais e dos prazos.

- 18/10/2026 — **B2 CONCLUÍDA (técnico).** `docs/lgpd/suboperadores.md` descreve, para cada um dos 10 suboperadores, o que recebe, onde fica, o contrato e a configuração conferida no código, além das consultas públicas (que não são suboperadores) e do mecanismo do art. 33.
  - **Conferido no código:**
    - Toda IA passa por `src/lib/ia.ts`: duas chamadas, `store: false`, sem upload de arquivo.
    - Funções da Vercel em `gru1`.
    - Sentry filtrado e sem replay.
    - Push cifrado de ponta a ponta.
    - CNPJ validado antes das APIs públicas, então CPF nunca é enviado.
    - Telegram com CPF só mascarado.
  - **Novas regras no AGENTS.md:** integração nova entra na lista; IA só por `lib/ia.ts`; Telegram sem dado sensível.
  - **Pendente (titular das contas):**
    - OpenAI: DPA e **retenção zero**.
    - Bubble: desligar e eliminar os dados, a começar pelos votos com eleitor.
    - Confirmar e arquivar os DPAs dos demais.

- 18/10/2026 — **B3 CONCLUÍDA (rascunho técnico).** Três RIPDs no modelo da ANPD, cada risco com evidência `arquivo:linha`, medidas existentes, medidas recomendadas, risco residual e dono. Base: 3 levantamentos paralelos do código e conferências no banco.
  - **`docs/lgpd/ripd-saude.md`:** 11 riscos, 4 altos.
    - R1: CAT inteira à OpenAI.
    - R2: pedido de "Saúde" do portal vira demanda com CPF e aviso por Telegram à equipe não clínica.
    - R4: painel analítico sem k-anonimato.
    - R10: caches e CDN pública do Bubble.
  - **`docs/lgpd/ripd-votacao.md`:** 9 riscos, 3 altos.
    - V1: o voto em separado nunca é desligado da pessoa.
    - V3: personificação do eleitor.
    - V4: contatos dos aptos sem prazo.
  - **`docs/lgpd/ripd-base-multitenant.md`:** 12 riscos, 3 altos.
    - M3: acesso do operador sem rastro.
    - M5: exportações sem registro.
    - M6: API pública com CPF em massa.
  - **Corrigido durante a B3:** `voto_online.updated_at` guardava a hora exata (DEFAULT now()). Comparando com `hora_voto`, 1.050 dos 1.121 votos do sistema novo eram religáveis ao eleitor, e com a hora cheia ainda sobravam 25 eleitores expostos. A migração `20261018175736_voto_hora_secreta` (aplicada) trunca a data do voto para o mês em todos os votos e cria o trigger `voto_online_hora_secreta`. Resultados idênticos (commit 4831868).
  - **Pendente:** aprovação das RIPDs pela entidade; implementar os planos de ação.

- 18/10/2026 — **B4 CONCLUÍDA (proposta técnica).** `docs/lgpd/retencao.md`: 6 regras gerais; 35 prazos (RT01–RT35) por dado, com processo, fundamento, ação ao fim (eliminar/anonimizar) e situação atual; dados fora do banco (storage, backups, Sentry, Vercel, e-mail, Telegram, Bubble, cópias locais); plano de implementação (motor de retenção com regras por entidade, modo simulação e livro de execuções; ordem de ativação); decisões da entidade. O ROPA aponta para os códigos RT.
  - **Inventário:** só 2 prazos são automáticos (RT10 contatos da votação, RT11 voto em separado, ambos de 18/10); 2 são manuais (anonimização do cadastro e do inscrito em evento, a pedido); a saúde só tem alerta.
  - **Achado:** `retencao_foto_dias` dos eventos (padrão 30) é configurável na tela, mas **nenhuma rotina apaga as fotos** (RT30).
  - **Arquivos do Storage** não são apagados junto com o registro.

- 18/10/2026 — **B5 CONCLUÍDA.** `docs/lgpd/direitos-titular.md`: prazos do art. 19, prova de identidade, livro de solicitações; cada direito do art. 18 (I a IX, oposição) e do art. 20 ligado a tela, função e registro; canais dos titulares que não são filiados; roteiro de atendimento para a entidade; 7 lacunas (D1–D7) com proposta; papel do Confluir como operador.
  - **Já atende:** confirmação, acesso, portabilidade (exportação JSON no portal), correção, anonimização pela gestão e o fluxo completo de eventos em `/meus-dados`.
  - **Principais lacunas:**
    - D1: nenhum pedido de eliminação, oposição ou revogação pelo portal.
    - D2: saúde fica fora da exportação.
    - D3: prazo de 15 dias sem controle.
    - D7: titulares não filiados sem canal.

- 18/10/2026 — **B6 CONCLUÍDA.**
  - **Política de privacidade pública por entidade em `/privacidade`** (`src/app/privacidade/page.tsx`). Leva nome, CNPJ e endereço da sede da entidade do subdomínio, e o encarregado com o contato. Resume, em linguagem do titular, o ROPA, os suboperadores, a retenção, os direitos, a segurança, os cookies (só os necessários) e os menores.
  - **Encarregado por entidade:** a migração `20261018215130_lgpd_encarregado` (aplicada) acrescentou `empresa.lgpd_encarregado_nome`, `lgpd_encarregado_email` e `lgpd_politica_atualizada_em`. Os campos ficam em Institucional › Organização, na caixa "Privacidade (LGPD)". Sem encarregado, a política mostra o e-mail de contato ou manda procurar a secretaria.
  - **Aviso `AvisoPrivacidade`:** no `AuthShell` (todas as telas de acesso) e em /filiar, /votar, /inscricao, /evento, /meus-dados, /portal/oposicao, /ficha e /espaco.
  - **Contrato de operação:** modelo em `docs/lgpd/contrato-operacao.md` (13 cláusulas e anexos que apontam para os documentos vivos).
  - **Verificado no demo:** política com e sem encarregado, formulário salvando e link na ficha; tsc e lint limpos.
  - **Pendente:** cada entidade preencher o encarregado; dados societários do Confluir e revisão jurídica do contrato.

- 18/10/2026 — **Motor de retenção integrado** (merge 78835fc, docs 598c853, push). A migração `20261018191616_motor_retencao` (aplicada) criou `lgpd_regras_retencao`, `lgpd_retencao_execucoes` e `lgpd_bloqueios_litigio`.
  - **Regras:** RT30, RT31 e RT02 entraram desligadas para as 2 entidades.
  - **Funcionamento:** a tela Institucional › LGPD simula; o cron `/api/lgpd/retencao/tick` (dia 2, 08:00 UTC) só executa de verdade as regras ligadas.
  - **Verificado:** tsc, lint e build; simulação no demo (0 registros; o livro registrou 3 simulações; nenhuma regra ativa); cron 401 sem segredo.
- 18/10/2026 — **B7 CONCLUÍDA. ONDA B CONCLUÍDA (rascunho técnico).** `docs/lgpd/incidentes.md` traz:
  - definição e exemplos de incidente no Confluir;
  - prazos: operador → entidade em 24 h; entidade → ANPD e titulares em 3 dias úteis (Res. CD/ANPD 15/2024); registro guardado por 5 anos;
  - papéis, fontes de detecção existentes e um procedimento em 7 passos;
  - roteiros de contenção por segredo e cenário. Destaque: girar o `SUPABASE_JWT_SECRET` invalida os links pessoais de votação, as carteirinhas e o "ver como";
  - modelos de comunicação à entidade e ao titular, campos do registro de incidentes e preparação contínua.
  - **Pendente:** nomear coordenador e técnico; levar o registro de incidentes para o sistema.

### Achados da A4 (insumo da Onda B e da C)

**Graves (decisão do usuário):**
1. **Sigilo do voto, legado.** 6.895 dos 8.018 registros de `voto_online` (a votação de 22–23/06/2026, migrada do Bubble) têm `eleitor_id` → `usuarios`, ou seja, o conteúdo do voto está ligado ao eleitor. Nenhum tem IP. Todos os votos do sistema novo (ago–out, 1.123) estão sem eleitor. **RESOLVIDO em 18/10/2026** (migração `20261018171028_voto_sigilo_legado`, aplicada). Conferido antes:
- **Não é uma votação só.** São 51 assembleias encerradas entre 05/06/2025 e 04/06/2026, mais 106 votos sem assembleia, de 3.626 eleitores. A data 22–23/06 era a da carga.
- **Homologação.** No banco não há homologação, resultado gravado nem ata (o Bubble não trazia). A entidade confirmou que as votações estão homologadas e sem impugnação.
- **Dependências.** Nenhum código nem objeto do banco lê `eleitor_id`.
- **O vínculo era o único registro de participação.** Essas assembleias não têm linhas em `voto_assembleias_aptos`.

O que a migração fez:
- Copiou a participação (5.972 linhas: rodada, assembleia e eleitor, sem voto) para `voto_participacao_legado`, com RLS por tenant.
- Zerou `eleitor_id`.
- Criou a trava `CHECK voto_online_sem_eleitor`.
- Removeu o índice (rodada, eleitor).

Verificado: 0 votos ligados; resultado por pergunta e resposta idêntico ao de antes; a trava recusa um eleitor (`check_violation`); RLS (tenant vê, outro tenant e anon não); os 5 caminhos de gravação de voto já mandam `eleitor_id: null`.

**Resta (usuário):** apagar no Bubble os votos com eleitor. Enquanto existirem lá, o `bubble_id` em `voto_online` permite religar voto e pessoa. `voto_votacao_respostas` (vazia) tem a mesma estrutura e pode ser removida.
2. **Webhook leva filiação para fora.** No evento `filiacao.aprovada`, o payload leva nome e CPF do novo filiado para uma URL externa (`webhooks_entregas.payload`, origem em `filiacao-publica.ts`). É dado sensível transferido a terceiro: identificar quem recebe e registrar como compartilhamento (B1/B2). `webhooks.segredo` fica em claro.
3. **A trilha `auditoria` copia segredos.** `antes`/`depois` só ocultam `senha`, `*_cifrado`, `codigo_hash` e `comprovante_hash`. Códigos e tokens com outros nomes (ex.: `usuarios.telegram_vinculo_codigo`) vão em claro. Ampliar a lista de colunas ocultas.

**Para os documentos da Onda B:**
- **Saúde fora das tabelas de saúde:**
  - Ausências/faltas, com motivo e atestado.
  - Reembolsos do ACT, com despesas médicas.
  - `viagens_itens.necessidades_especiais`.
  - `diretoria_ficha`: tipo sanguíneo e restrições.
  - `filiacao_prontuario.descricao`: 15 mil textos livres vindos do Bubble.
  - `saude_atendimentos.observacao_aberta`: em claro, ao lado do relatório cifrado.
- **Terceiros e menores:**
  - `pes_atestados_medicos`: acompanhado e filho menor de 6 anos.
  - `pessoal_dependentes` e `pessoal_plano_saude`: hoje vazias.
  - `filiacao_contatos_emergencia`.
- **Cópias em jsonb que escapam de anonimização coluna a coluna:**
  - `usuarios_unificacoes` e `veiculos_condutores_unificacoes`.
  - `pessoal_folha_competencias.snapshot`.
  - `auditoria`.
  - Arquivos CNAB inteiros em `financeiro_remessas.conteudo`.
- **IA com dado nominal:** os indicadores do ponto vão à IA com até 30 funcionários por nome (`pessoal_ponto_resenhas`). Isso soma à CAT e aos contracheques já listados.
- **Documentos pessoais ainda no CDN do Bubble:** informes de rendimentos, aviso de férias e certificados.
- **Contradição em `lgpd_solicitacoes`:** o comentário manda não guardar CPF e e-mail do titular, mas as colunas `cpf_titular` e `email_titular` existem.
- **Legado vazio e sem uso, com dado pessoal (candidato a remoção = minimização):**
  - `cnh`, `prestadores_servico`, `prestcont_remessa`, `filiacao_registro`.
  - `despesas`, `fil_reemb_hospedagem`, `hospedagem_reembolso`, `voto_votacao_respostas`.
  - `dir_liberacao_historico`, `agenda_representantes`, `assinaturas`.
  - Tabelas `compras_*`/`danfes_*`/`financeiro_*` vazias do Bubble.
- **Schema:** `fa_documentos_versao.documento_id` tem FK errada (para `pessoal_treinamentos`) e está sempre nula.
