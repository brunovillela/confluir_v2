# 0019. Duas portas, mesma tabela

- **Status:** aceita
- **Data:** 20/09/2026.

- **Contexto:** diretores também recebem diárias, mas o RH não deve ver nem avaliar a diretoria. Duplicar o motor criaria dois fluxos divergentes. O plano de contas tem contas diferentes por quadro e por departamento.
- **Decisão:** um só motor e as mesmas tabelas (solicitações, tipos com coluna `quadro` = funcionario | diretor | ambos), com duas portas e permissões distintas. Pessoal lista as diárias dos funcionários. Institucional → Diretoria → Diárias (`diretoria_diarias`) lista as dos diretores. A conta contábil sai de `quadro × departamento × tipo`, em cascata. O pagamento é uma ordem só, com rateio.
- **Consequências:**
  - Um recurso que sirva a públicos com governança diferente segue este padrão (mesma tabela, filtro por quadro ou papel, porta e permissão próprias), e não ganha uma cópia.
  - A secretaria lança em nome do diretor (`solicitante_id`), porque poucos diretores têm login.
  - O de-para de centros de custo é configurável por tenant.
- **Onde está:** `src/lib/db/diarias.ts`, `src/lib/db/diarias-diretoria.ts`, `src/lib/db/diarias-config.ts` (cascata por quadro), `src/app/painel/institucional/diretoria/diarias/`, `src/app/painel/pessoal/diarias/`.
