# 0018. Contas de função: a conta é do posto, não da pessoa

- **Status:** aceita
- **Data:** 17/09/2026.

- **Contexto:** e-mails como `recepcao@` são usados por quem ocupa o posto (titular, férias, substituição). O login é uma conta do Auth por e-mail único, e transferir o e-mail entre pessoas apagaria o histórico de quem fez o quê.
- **Decisão:** `usuarios.conta_funcao` marca a conta do posto. `usuarios_ocupacoes` registra quem ocupou o posto e quando: titular, férias, afastamento ou substituição. A cobertura vale sobre o titular, e um novo titular encerra o anterior na véspera. A autoria aparece como "Recepção (Fulano)".
- **Consequências:**
  - Não se cria conta de função com e-mail de pessoa, nem pessoa com e-mail de conta.
  - A troca de ocupante inclui trocar a senha (passo a passo na tela).
  - As sugestões de usuários excluem as contas de função.
- **Onde está:** `src/lib/db/contas-funcao.ts` (`ocupanteNoDia`, `rotuladorDeAutores`, `criarContaFuncao`), `src/lib/contas-funcao-constantes.ts`, `scripts/migrar-contas-funcao.mjs`.
