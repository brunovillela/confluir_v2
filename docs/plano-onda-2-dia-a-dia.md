# Plano da Onda 2 — o dia a dia

Continuação das ondas 0 e 1 (`docs/plano-onda-0-seguranca.md`, `docs/plano-onda-1-seguranca.md`). Itens U1, U2, U3, U4, U5, U9, U10, U11, U12, A6 e D4 da avaliação de 03/10 (`docs/avaliacao-sistema-2026-10-03.md`). Caminhos relativos a `confluir/`. Estimativa: **5 dias úteis**, deploy ao fim de cada dia; SQL sempre antes do push que depende dele.

## Ordem de execução

| Dia | Itens | O que entrega |
|---|---|---|
| 1 | U1, U9 | **Caixa de entrada de pendências** na home: tudo que espera a pessoa (ordens na sua alçada, férias/faltas/diárias/reembolsos a avaliar, filiações e fichas pendentes, pedidos de espaço, assinaturas, compras a receber, viagens, cupons), com contagem e link; contador no cabeçalho. "Minha área" (autosserviço) visível no menu. |
| 2 | U2, U3 | **Aviso a quem precisa agir**: toda esteira avisa o aprovador quando entra pendência (sino + e-mail + Telegram conforme preferência); lembrete diário do que está parado há mais de N dias; preferência de canal por tipo em Meu perfil (e-mail e Telegram); sino atualizado sem recarregar. |
| 3 | U4, A6, D4 | **Busca global (Ctrl+K)**: filiados, fornecedores, usuários, páginas do menu. **Resumo diário de vencimentos** por e-mail/Telegram para os gestores: contratos, ACT, CNH, seguro, ASO, férias vencendo, ajudas, faturas, custeios, ordens vencidas, mandatos da diretoria e das instâncias, vigência de empregador. |
| 4 | U5, U10 | **Confirmação padrão** (diálogo com contexto no lugar do `confirm()` nativo) e **erro por campo** nos formulários mais usados; nomes unificados entre menu, título, rota e manual. |
| 5 | U11, U12 | **Ajuda ligada à tela** ("?" em cada hub levando ao artigo), **"O que há de novo"** após cada deploy, **canal de feedback** ("Relatar problema / sugerir") que abre uma Demanda com URL, usuário e print. |

## Andamento

- **Dia 1 — FEITO em 04/10/2026.** U1: `lib/db/pendencias.ts` reúne, por permissão e com head-counts tolerantes a tabela ausente, as pendências de quem vê: ordens em autorização dentro da alçada, férias/diárias/reembolsos do ACT a avaliar, faltas a autorizar, solicitações de filiação, reembolsos de filiados, pedidos de espaço, viagens a atender, fornecimentos a receber e documentos aguardando a assinatura da pessoa (pelo e-mail do convite). Cartão "Sua caixa de entrada" na home (`components/layout/caixa-entrada.tsx`) e contador no cabeçalho ao lado do sino (`pendencias-indicador.tsx`), com a conta cacheada por requisição. U9: item "Minha área" no topo do menu lateral. Cupons de hospedagem ficaram de fora: `hospedagem_cupom` não tem tenant. Verificado no demo: cabeçalho "Caixa de entrada: 17 pendências", cartão com ordens, diárias, filiação e reembolsos.
