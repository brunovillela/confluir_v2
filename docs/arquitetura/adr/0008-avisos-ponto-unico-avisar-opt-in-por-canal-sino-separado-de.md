# 0008. Avisos: ponto único `avisar()`, opt-in por canal, sino separado de pendência

- **Status:** aceita
- **Data:** 04/10/2026 (ponto único). Segregação em 06/10/2026 e opt-in em 07/10/2026.

- **Contexto:** cada módulo mandava aviso do seu jeito, e as pessoas recebiam e-mail e Telegram de áreas que nem acessavam. Avisos sensíveis, de saúde ou de voto, não podem trafegar por canais sem DPA.
- **Decisão:** todo aviso de "entrou pendência ou novidade" passa por `avisar()` / `avisarQuemPode()` / `avisarQuemPodeOuCoordena()` em `lib/db/avisos.ts`. O envio roda depois da resposta (`after()`). Os canais e-mail, Telegram e celular (Web Push) são opt-in: só `true` liga. Cada evento declara quem pode recebê-lo (`acesso`). O sino recebe só eventos do grupo `notificacao`. Pendências e resumos vão por e-mail, Telegram ou push, com dedupe em `avisos_entregas`.
- **Consequências:**
  - Evento novo em `EVENTOS_TELEGRAM` precisa de `acesso` coerente com quem dispara.
  - A tela Meu perfil → Avisos só oferece o que a permissão alcança.
  - Telegram nunca leva CPF completo nem dado sensível. O detalhe fica atrás de um link (`TEXTO_SENSIVEL`; regra no `AGENTS.md`).
  - Os contadores do painel (cabeçalho, caixa de entrada, abas) leem de um provedor único (`ContadoresProvider`) e não calculam a lista por conta própria.
- **Onde está:** `src/lib/db/avisos.ts` (`avisar`, `depoisDaResposta`, `querEmail`, `TEXTO_SENSIVEL`), `src/lib/telegram-eventos.ts` (`normalizarPreferencias`, `EVENTOS_TELEGRAM`), `src/lib/db/pendencias.ts`, `src/components/layout/contadores-header.tsx`.
