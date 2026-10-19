# Continuidade: backups, RPO/RTO e restauração

> **Onda E**, 19/10/2026. Quanto dado se aceita perder (**RPO**), em quanto tempo o serviço volta (**RTO**) e como restaurar. O schema já tem restauração **comprovada** (Onda A6); a restauração **com dados** depende do plano e dos backups do Supabase e ainda precisa de ensaio (seção 5).

## 1. Metas propostas (a aprovar)

| Situação | RPO (perda máxima) | RTO (volta em) |
|---|---|---|
| Operação normal | **24 h** com o backup diário; **minutos** se o PITR estiver ativo | **4 h** |
| Período de votação aberta | **minutos**: exige PITR | **1 h** |

Por que o PITR importa: uma votação perdida não se refaz. Restaurar o backup da noite anterior apagaria os votos e as participações do dia.

## 2. O que é copiado hoje e o que não é

| O quê | Cópia | Situação |
|---|---|---|
| Banco (dados) | Backups automáticos do Supabase, conforme o plano (Pro: diário com retenção de 7 dias; PITR é complemento pago) | **Conferir no painel** do Supabase (Database › Backups) o plano, a retenção e se o PITR está ativo |
| Schema | `supabase/migrations/` no GitHub | **Comprovado**: `npm run db:restaurar` reconstrói igual a produção (18/10/2026) |
| **Arquivos (Storage, 21 buckets)** | **Nenhuma**: os backups do banco do Supabase **não** incluem os arquivos do Storage | **Lacuna**: documentos, comprovantes, atestados, fotos e PDFs de CAT sem cópia |
| Código | GitHub (mais os clones locais) | OK |
| Configuração da Vercel (variáveis, domínios, região, crons) | `vercel.json` (crons) + documentação; variáveis só no painel | Manter a lista de [`integracoes.md`](integracoes.md) atualizada; guardar os segredos num cofre |
| `SAUDE_RELATORIO_CHAVE` | **Só** na Vercel e no `.env.local` | Guardar cópia num cofre de senhas: sem ela, os relatórios clínicos ficam ilegíveis mesmo com backup |
| Dados ainda no Bubble | No Bubble | Até o desligamento |

## 3. Restauração do banco com dados

**Cenário A: erro de dados (exclusão em massa, migração errada), Supabase no ar**
1. Parar a causa: rollback do deploy (R2) ou desligar o cron envolvido.
2. Avaliar o escopo pela trilha `auditoria` (tem o `antes` de cada linha alterada nas tabelas auditadas) e pelo livro de retenção. Muitas vezes dá para **reverter só as linhas afetadas** a partir da auditoria, sem restaurar o banco.
3. Se não der: restaurar o backup (ou o ponto no tempo, com PITR) num **projeto novo** do Supabase, extrair as linhas perdidas e reinserir em produção por script revisado. Evitar restaurar por cima de produção, porque se perde o que entrou depois.

**Cenário B: perda do projeto ou da região**
1. Criar um projeto novo (de preferência `sa-east-1`).
2. Restaurar o último backup ou ponto no tempo nele (painel do Supabase: restaurar para outro projeto, ou `pg_restore` de um backup baixado).
3. Conferir o schema: gravar a URI do projeto novo como `SUPABASE_DB_URL_RESTAURO` no `.env.local` e rodar `npm run db:restaurar -- --conferir`, que deve dar "IDÊNTICO".
4. Restaurar os arquivos do Storage (exige a cópia da seção 4).
5. Reconfigurar o Auth: Site URL, Redirect URLs (`https://*.confluir.online/**`), SMTP (Resend) e captcha.
6. Trocar na Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_JWT_SECRET`; redeploy. Se o segredo JWT mudar, os links pessoais de votação mudam (reenviar se houver votação aberta).
7. Verificar: `npm run db:deriva`, `npm run votacao:auditar`, login em cada entidade, uma exportação e um envio de e-mail.
8. Comunicar as entidades. Se houve perda de dados pessoais, seguir `docs/lgpd/incidentes.md`.

## 4. Lacunas e propostas

| # | Lacuna | Proposta | Prioridade |
|---|---|---|---|
| E-1 | Storage sem cópia | Script `npm run storage:backup` que copia os 21 buckets para um destino fora do Supabase (outro provedor de objetos, cifrado), semanal; e restauração correspondente | **Alta** |
| E-2 | Plano, retenção e PITR do Supabase não confirmados | Conferir no painel e registrar aqui; ativar o PITR pelo menos nos períodos de votação | **Alta** |
| E-3 | Restauração com dados nunca ensaiada | Ensaio trimestral (seção 5) | **Alta** |
| E-4 | `SAUDE_RELATORIO_CHAVE` sem cópia de segurança | Cofre de senhas do responsável, com segundo custodiante | **Alta** |
| E-5 | Região `gru1` só no painel da Vercel | Registrar no runbook R8 (feito); avaliar `regions` no `vercel.json` | Média |
| E-6 | Backups lógicos fora do Supabase | `pg_dump` cifrado semanal, guardado fora do Supabase, com retenção coerente com `docs/lgpd/retencao.md` (backup também é dado pessoal) | Média |

## 5. Ensaio de restauração (trimestral)

1. Criar um projeto Supabase descartável e gravar `SUPABASE_DB_URL_RESTAURO` no `.env.local`.
2. Restaurar nele o **backup mais recente de produção** (painel do Supabase).
3. `npm run db:restaurar -- --conferir`: o schema deve dar "IDÊNTICO".
4. Conferir dados por amostra: contagens das tabelas principais (`filiacoes`, `ordens_pagamento`, `voto_online`, `voto_assembleias_aptos`) no restaurado contra produção na data do backup.
5. Medir o tempo total e comparar com o RTO.
6. Registrar o resultado neste documento (data, backup usado, tempo, problemas).
7. **Apagar** o projeto descartável e a variável: ele contém dados pessoais reais.

| Data | Backup | Tempo | Resultado |
|---|---|---|---|
| 18/10/2026 | (só schema, sem dados) | ~10 min | Schema IDÊNTICO; 21/21 seeds do demo (Onda A6) |
| _próximo_ | | | |
