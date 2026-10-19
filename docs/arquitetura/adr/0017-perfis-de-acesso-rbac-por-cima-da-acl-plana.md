# 0017. Perfis de acesso (RBAC) por cima da ACL plana

- **Status:** aceita
- **Data:** 24/08/2026, com SQL verificado em 25/08/2026.

- **Contexto:** as permissões eram uma coluna booleana por funcionalidade em `permissoes`, marcada usuário a usuário. Isso não escalava para o onboarding de cerca de 80 pessoas. Trocar todos os consumidores seria caro.
- **Decisão:** `Permissoes` continua sendo um mapa chave→bool. Os perfis (`perfis`, `perfil_permissoes`, `usuario_perfis`) compõem esse mesmo mapa: união das chaves dos perfis com as flags individuais, que viram exceções só de concessão. A alçada em R$ fica no perfil. `concede_tudo` dá todas as chaves. Nenhum consumidor mudou: proxy, sidebar e `requirePermissao` continuam lendo o mapa.
- **Consequências:**
  - O proxy é a primeira barreira e cada página ou action repete a checagem (`requirePermissao`). A defesa em profundidade é obrigatória.
  - `permissoes-resolver.ts` recebe o client por parâmetro e não importa nada server-only, porque roda no proxy.
  - Há segregação: as alçadas de aprovação ficam só nos perfis de Diretoria e Coordenação.
  - Ver e editar: o padrão `_leitura` (aditivo) ou `_edicao`, com `podeEditar` escondendo os botões. Só Financeiro e Patrimônio foram feitos. A fase 2 nas outras áreas está mapeada.
  - A tabela `permissoes` ainda tem 102 colunas booleanas.
- **Onde está:** `src/lib/permissoes-resolver.ts` (`resolverPermissoes`, `resolverPermissoesComPerfis`), `src/lib/permissoes.ts`, `src/lib/permissoes-catalogo.ts`, `src/lib/db/perfis.ts`, `src/lib/auth.ts`, `src/proxy.ts`.
