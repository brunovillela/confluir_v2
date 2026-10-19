# Registro de decisões de arquitetura (ADR)

Cada arquivo registra uma decisão duradoura: o contexto, a decisão, as consequências e onde ela está no código. Levantadas em 18–19/10/2026 a partir do histórico do projeto e **conferidas no código** (HEAD 7ab17c3). Visão geral da arquitetura: [`../LEIA-ME.md`](../LEIA-ME.md).

**Para mudar uma decisão:** não desfaça em silêncio. Escreva uma ADR nova (próximo número) com o motivo, marque a antiga como `substituída por NNNN` e atualize o índice abaixo.

## Plataforma

| # | Decisão | Data |
|---|---|---|
| 0001 | [Multi-tenant por subdomínio, resolvido no proxy](0001-multi-tenant-por-subdominio-resolvido-no-proxy.md) | 03/08/2026 |
| 0002 | [Dados da composição da organização nunca ficam fixos no código](0002-dados-da-composicao-da-organizacao-nunca-ficam-fixos-no-codi.md) | 24/07/2026 |
| 0003 | [Isolamento de tenant no banco (RLS) e dois clientes Supabase](0003-isolamento-de-tenant-no-banco-rls-e-dois-clientes-supabase.md) | 25/08/2026 |
| 0004 | [Hospedagem em São Paulo: banco em sa-east-1, funções em gru1](0004-hospedagem-em-sao-paulo-banco-em-sa-east-1-funcoes-em-gru1.md) | 02/09/2026 |
| 0005 | [Identidade do portal, da votação e da oposição em `auth_identidades`](0005-identidade-do-portal-da-votacao-e-da-oposicao-em-auth-identi.md) | 03/10/2026 |
| 0006 | [Toda IA passa por `src/lib/ia.ts` (OpenAI, `store: false`)](0006-toda-ia-passa-por-src-lib-ia-ts-openai-store-false.md) | criada em 07/2026 |
| 0007 | [E-mail: domínio neutro `confluir.online`, dois canais](0007-e-mail-dominio-neutro-confluir-online-dois-canais.md) | 26/08/2026 |
| 0008 | [Avisos: ponto único `avisar()`, opt-in por canal, sino separado de pendência](0008-avisos-ponto-unico-avisar-opt-in-por-canal-sino-separado-de.md) | 04/10/2026 |
| 0009 | [Tarefas agendadas como Vercel Cron em `/api/**/tick`](0009-tarefas-agendadas-como-vercel-cron-em-api-tick.md) | padrão consolidado em 03–04/10/2026, com crons anteriores |

## Dados

| # | Decisão | Data |
|---|---|---|
| 0010 | [Schema só por migração, com a CLI do Supabase, impressão digital e deriva](0010-schema-so-por-migracao-com-a-cli-do-supabase-impressao-digit.md) | 18/10/2026 |
| 0011 | [Dicionário de dados gerado e etiquetas `[lgpd:]` no próprio banco](0011-dicionario-de-dados-gerado-e-etiquetas-lgpd-no-proprio-banco.md) | 18/10/2026 |
| 0012 | [Leituras grandes paginadas: teto de 1.000 linhas do PostgREST](0012-leituras-grandes-paginadas-teto-de-1-000-linhas-do-postgrest.md) | 09/09/2026, com a segunda ocorrência em 01/10/2026 e a varredura completa em 16/10/2026 |
| 0013 | [Auditoria de escrita por trigger, com o autor carimbado pelo cliente](0013-auditoria-de-escrita-por-trigger-com-o-autor-carimbado-pelo.md) | 03/10/2026 |
| 0014 | [Data e hora sempre em America/Sao_Paulo nas duas pontas](0014-data-e-hora-sempre-em-america-sao-paulo-nas-duas-pontas.md) | 06/09/2026, com os pontos restantes corrigidos em 03/10/2026 |
| 0015 | [Migração do Bubble por `bubble_id`, com convivência depois da virada](0015-migracao-do-bubble-por-bubble-id-com-convivencia-depois-da-v.md) | carga inicial em 06/2026, backfill em 05/08/2026, virada da Filiação em 14/09/2026 e do Financeiro em 30/09/2026, convivência registrada em 08/10/2026 |
| 0016 | [O código tolera schema ausente (`esquemaAusente`)](0016-o-codigo-tolera-schema-ausente-esquemaausente.md) | padrão desde 07/2026 |

## Domínio

| # | Decisão | Data |
|---|---|---|
| 0017 | [Perfis de acesso (RBAC) por cima da ACL plana](0017-perfis-de-acesso-rbac-por-cima-da-acl-plana.md) | 24/08/2026, com SQL verificado em 25/08/2026 |
| 0018 | [Contas de função: a conta é do posto, não da pessoa](0018-contas-de-funcao-a-conta-e-do-posto-nao-da-pessoa.md) | 17/09/2026 |
| 0019 | [Duas portas, mesma tabela](0019-duas-portas-mesma-tabela.md) | 20/09/2026 |
| 0020 | [Padrão de 3 níveis nas áreas do Pessoal](0020-padrao-de-3-niveis-nas-areas-do-pessoal.md) | 16/10/2026 |
| 0021 | [Sigilo do voto](0021-sigilo-do-voto.md) | 03/10/2026 |
| 0022 | [Painel único com abas: dashboard novo entra como cartão](0022-painel-unico-com-abas-dashboard-novo-entra-como-cartao.md) | 06/10/2026, com a fonte única de contadores em 09/10/2026 |
| 0023 | [Design system: tokens num só lugar e componentes padronizados](0023-design-system-tokens-num-so-lugar-e-componentes-padronizados.md) | 17/07/2026, com ajustes em 28/07, 10/09 e 04/10/2026 |

## Processo de trabalho

| # | Decisão | Data |
|---|---|---|
| 0024 | [Commit autorizado segue com push direto na main](0024-commit-autorizado-segue-com-push-direto-na-main.md) | 10/10/2026, como prática consolidada desde o primeiro deploy |

## Modelo

```markdown
# NNNN. Título curto

- **Status:** proposta | aceita | substituída por NNNN
- **Data:** DD/MM/AAAA

- **Contexto:** o problema e as forças que levaram à decisão.
- **Decisão:** o que foi decidido, em afirmativa.
- **Consequências:** ganhos, custos, regras que decorrem, armadilhas.
- **Onde está:** arquivos, funções, migrações.
```
