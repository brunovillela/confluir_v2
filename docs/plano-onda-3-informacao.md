# Plano da Onda 3 — informação para decidir

Continuação das ondas 0 a 2 (`docs/plano-onda-0-seguranca.md`, `docs/plano-onda-1-seguranca.md`, `docs/plano-onda-2-dia-a-dia.md`). Itens I1, I2, I3, I5, I8, I10 e U8 da avaliação de 03/10 (`docs/avaliacao-sistema-2026-10-03.md`), mais as duas sobras pequenas de segurança (S15, S18) e, se couber, D5. Caminhos relativos a `confluir/`. Estimativa: **5 dias úteis**, deploy ao fim de cada dia; SQL sempre antes do push que depende dele.

## O que fica para depois (e por quê)

- **Onda 4 — filiado e diretor** (F1, F2, F4, F5, F6, D1, D2, D3, A5, I4, I6, I7): trabalho de produto no portal e no celular; vem depois da camada analítica desta onda, que a home do diretor (D1) e os custos consolidados (I7) reutilizam.
- **Onda 5 — integrações financeiras** (A1, A2, A3, A4, A9): dependem de decisões e credenciais externas (layout CNAB do banco, convênio de boleto/Pix, API do gov.br, Meta Cloud API). Antes de codificar, é preciso saber o banco e o que ele oferece.
- Já entregues fora da ordem original: U6 (telas de erro em português, onda 0), U7 (fuso, onda 1), A6 e D4 (resumo de vencimentos, onda 2).

## Ordem de execução

| Dia | Itens | O que entrega |
|---|---|---|
| 1 | U8, S15, S18, I8 | **Fim do teto silencioso de 1.000 linhas**: os `.limit(2000)` passam a ler em lotes; listas grandes (ordens de pagamento, contratos, processos de compra) ganham paginação no servidor. **Exportação XLSX universal**: um componente "Exportar" nas listas principais, respeitando os filtros da tela (filiados, ordens, fornecedores, contratos, compras). S15: `ilike` com `%`/`_` escapados. S18: o tenant do cabeçalho só vale assinado pelo proxy. |
| 2 | I1 | **Camada analítica no banco**: views materializadas `fato_filiacao_mensal`, `fato_arrecadacao_mensal`, `fato_despesa_mensal`, `fato_frota_mensal`, atualizadas por cron noturno (`/api/analitica/tick`), com índices; `lib/db/analitica.ts` lendo com tolerância (sem a view, a tela diz o que falta). |
| 3 | I2 | **Painel executivo** (`/painel/indicadores`, gestão e diretoria): filiados ativos e variação, filiações × desfiliações em 12 meses, arrecadação em 12 meses por tipo, saldo de caixa e a pagar em 30 dias, inadimplência, pendências críticas. Gráficos em SVG próprio (sem biblioteca), atalho na home. |
| 4 | I3, I5 | **Financeiro gerencial** (`/painel/financeiro/gerencial`): fluxo de caixa projetado (a pagar por vencimento × receita prevista), despesa por centro de custo, departamento e mês, orçado × realizado por centro de custo, ordens vencidas. **Arrecadação por empregador/fonte**: série mensal, pagantes × ativos, fontes em atraso, comparação com o mês anterior, como aba na página do empregador. |
| 5 | I10, D5 | **Resumo semanal de gestão** (segunda, 8h; e-mail e Telegram, com assinatura por tipo em Meu perfil → Avisos): KPIs da semana, pendências, vencimentos, anomalias. **Relatório da diretoria em um clique**: PDF mensal com filiação, arrecadação, caixa, pendências e ações do mês, texto redigido pela IA a partir dos números. |

## Andamento

- **Dia 1 — FEITO em 04/10/2026.** U8: os seis `.limit(2000)` (resumo financeiro, contratos, entidades apoiadas, aniversariantes, fontes das campanhas) passaram a ler em lotes (`lerEmLotes`, ordem estável por `id`); ordens e processos de compra já eram paginados no servidor, e `listarProcessos` ganhou `porPagina` para a exportação. I8: `lib/xlsx.ts` (SheetJS, datas como datas, autofiltro, larguras) + `components/exportar-xlsx.tsx` (leva os filtros da URL, tira a página) + rotas `…/exportar` em filiados (`formato=xlsx`, CSV mantido como secundário), ordens de pagamento (todas as páginas em lotes de 1.000), fornecedores (filtros/ordenação movidos para `lista/filtros.ts` e reusados), contratos e aquisições — cada uma com a permissão da tela. S15: `escaparLike` em `lib/texto.ts` aplicado nos três `ilike` por e-mail. S18: `lib/tenant-assinatura.ts` — o proxy assina `x-tenant-id` (HMAC com a chave do JWT em `x-tenant-assinatura`) e `tenantAtual()` só aceita o par que confere; sem a chave configurada, mantém o comportamento antigo. Sem SQL. Verificado: assinatura confere/recusa (id trocado, vazia, lixo); as 5 exportações respondem XLSX com nome datado; planilha de ordens lida de volta com cabeçalho e linhas.

