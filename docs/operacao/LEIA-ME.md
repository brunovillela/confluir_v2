# Operação do Confluir

> **Onda E** (`docs/plano-documentacao.md`), 19/10/2026.

| Documento | Para quê |
|---|---|
| [runbooks.md](runbooks.md) | Deploy, rollback, migração, criar e suspender entidade, cron manual, troca de credencial, recriar o projeto, ambiente de demo |
| [integracoes.md](integracoes.md) | Variáveis de ambiente, o que cada serviço faz, quem administra e o que fazer quando cai |
| [monitoramento.md](monitoramento.md) | Sinais automáticos, conferências periódicas e alertas que faltam ligar |
| [continuidade.md](continuidade.md) | RPO/RTO, o que tem e o que não tem backup, restauração com dados e ensaio trimestral |
| [linha-de-base-contagens.md](linha-de-base-contagens.md) | Contagens do schema de produção na linha de base (Onda A1) |

Ligados a estes: incidentes de segurança em [`docs/lgpd/incidentes.md`](../lgpd/incidentes.md); arquitetura e decisões em [`docs/arquitetura/`](../arquitetura/LEIA-ME.md); banco em [`supabase/LEIA-ME.md`](../../supabase/LEIA-ME.md) e [`docs/dados/`](../dados/LEIA-ME.md).

## Pendências que dependem de quem administra as contas

1. Preencher o "Dono" de cada serviço em `integracoes.md`.
2. Conferir no Supabase o plano, a retenção de backups e o PITR, e registrar em `continuidade.md` (E-2).
3. Guardar a `SAUDE_RELATORIO_CHAVE` num cofre com segundo custodiante (E-4).
4. Configurar no Sentry o alerta imediato para "Deriva do schema" e o destinatário (M-3).
5. Agendar o primeiro ensaio de restauração com dados (E-3).
