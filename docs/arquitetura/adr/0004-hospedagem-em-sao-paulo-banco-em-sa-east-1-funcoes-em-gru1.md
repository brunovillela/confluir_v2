# 0004. Hospedagem em São Paulo: banco em sa-east-1, funções em gru1

- **Status:** aceita
- **Data:** 02/09/2026 (virada concluída; migração executada em 01/09).

- **Contexto:** as funções da Vercel já rodavam em `gru1`, mas o banco estava nos EUA. Cada consulta pagava cerca de 246 ms de ida e volta. Pela LGPD, ter o dado no Brasil também ajuda.
- **Decisão:** o projeto Supabase de produção fica em `sa-east-1` (São Paulo) e as funções da Vercel em `gru1`. O banco antigo, nos EUA, ficou fora de uso.
- **Consequências:**
  - O tempo por consulta caiu de cerca de 246 ms para 50 ms.
  - Trocar de deployment não troca de banco: `vercel redeploy` usa as variáveis atuais. Só se prova em qual banco produção está por um efeito colateral, como o contador de `/links/ir/<id>`.
  - A janela de rollback fechou em 04/09. Voltar aos EUA perderia dados.
  - `vercel env rm` apaga a variável em production e em preview ao mesmo tempo.
- **Onde está:** configuração das plataformas (Supabase e projeto `confluir_v2` na Vercel), `docs/lgpd/suboperadores.md`. **Não há `regions` no `vercel.json`**: a região `gru1` mora só no painel da Vercel, e um projeto novo não a herdaria. Ao recriar o projeto, configurar a região das funções antes do primeiro deploy (ver Onda E).
