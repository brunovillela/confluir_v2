# 0002. Dados da composição da organização nunca ficam fixos no código

- **Status:** aceita
- **Data:** 24/07/2026.

- **Contexto:** num módulo, o seletor de centro de custo foi filtrado por `tipo_da_conta === "Despesa"`, que é uma particularidade do plano de contas do Sindipetro-NF. Uma auditoria achou também sedes, site, e-mail e feed de notícias fixos no código. Em outro tenant, isso quebraria ou mostraria dados alheios.
- **Decisão:** o vocabulário de domínio pode ser constante no app: termos legais, enums de workflow, CNH, tipos de CAT, formas de pagamento. Tudo o que cada organização compõe é lido do banco por tenant: plano de contas, centros de custo, sedes, departamentos, fontes, site e e-mail. Opções de filtro vêm dos dados (`new Set(...)`) e não de strings fixas.
- **Consequências:**
  - Sedes vêm de `nomesDasSedes()` (`empresa_sede`). Contato e site vêm de colunas em `empresa`. O que não estiver configurado some da tela em vez de mostrar um valor do NF.
  - Centros de custo são filtrados por `usavel !== false` e rotulados como `classificador - nome_da_conta` (hoje `rotuloCentroCusto`).
  - Armadilha: os campos de `centros_de_custo` estão trocados entre o tenant real e o demo. Testar nos dois.
  - Recursos opcionais por entidade (Carreira, anuênios) aparecem só para quem usa.
  - Caches em memória são `Map` por tenant (12/10).
- **Onde está:** `src/lib/db/organizacao.ts` (`nomesDasSedes`, `obterOrganizacao`, `emailContatoEntidade`), `src/lib/centros-custo-rotulo.ts`.
