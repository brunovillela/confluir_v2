# 0006. Toda IA passa por `src/lib/ia.ts` (OpenAI, `store: false`)

- **Status:** aceita
- **Data:** criada em 07/2026. Trocada para Claude em 27/07/2026 e de volta para OpenAI em 29/09/2026.

- **Contexto:** várias features usam IA: redação, leitura de PDF de CAT e de contracheque, notas fiscais, acordos e atas. O provedor já mudou duas vezes por causa de cota e saldo. Os dados enviados incluem dados sensíveis, como saúde e remuneração.
- **Decisão:** uma camada única, server-only, oferece `gerarTextoIA`, `gerarJsonIA`, `gerarJsonIADePdf` e `gerarJsonIADeImagem`. Ela usa a Responses API da OpenAI com `store: false`, e o modelo vem de `MODELO_IA` (padrão `gpt-5.5`). Nenhum outro arquivo importa um SDK de IA.
- **Consequências:**
  - Trocar de provedor ou de modelo não muda nenhuma feature, porque as assinaturas foram preservadas nas duas trocas.
  - O modo JSON exige a palavra "JSON" na mensagem do usuário. `instructions` não contam.
  - `max_output_tokens` = teto + folga de 8000, porque o raciocínio consome o mesmo teto.
  - Relações grandes são processadas em blocos, porque o modelo truncava em silêncio (15/10).
  - É transferência internacional: a OpenAI consta em `docs/lgpd/suboperadores.md`, e o DPA e o Zero Data Retention estão pendentes com o usuário.
- **Onde está:** `src/lib/ia.ts` (`store: false` nas duas chamadas a `client.responses.create`; as outras funções delegam a elas). `openai` ^7.23 é a única dependência de IA no `package.json`. A regra também está no `AGENTS.md`.
