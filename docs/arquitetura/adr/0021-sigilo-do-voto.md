# 0021. Sigilo do voto

- **Status:** aceita
- **Data:** 03/10/2026 (S4). Votos legados e hora truncada para o mês em 18/10/2026.

- **Contexto:** o voto online gravava o mesmo horário no voto e na participação, e votos legados do Bubble tinham `eleitor_id`. Ambos permitiam ligar a pessoa ao voto. Em 18/10, com a hora cheia, 25 eleitores ainda eram os únicos da sua faixa horária.
- **Decisão:** a participação (quem votou, em `voto_assembleias_aptos.hora_voto`) é separada do voto (`voto_online`). O voto nunca tem eleitor: `CHECK voto_online_sem_eleitor (eleitor_id is null)`. O trigger `voto_online_hora_secreta` trunca `created_at` e `updated_at` para o primeiro instante do mês. A participação legada foi para `voto_participacao_legado`. "Já votou" é reservado de forma atômica antes de inserir o voto.
- **Consequências:**
  - Nada pode ler a hora do voto, e nenhuma feature deve gravar dado que permita religar voto e pessoa (inclusive logs e auditoria).
  - O voto em separado é a exceção: aponta `em_separado_id` até a apuração.
  - O canal de acesso (`acesso_canal`) fica no apto, não no voto.
  - A auditoria independente fica em `npm run votacao:auditar`. Há achados abertos C-1 a C-5, entre eles a falta de trava de UPDATE/DELETE em `voto_online` antes do encerramento.
- **Onde está:** `supabase/migrations/20261018171028_voto_sigilo_legado.sql`, `supabase/migrations/20261018175736_voto_hora_secreta.sql`, `scripts/auditar-votacao.mjs`, `docs/votacao/dossie-auditoria.md`, `docs/lgpd/ripd-votacao.md`.
