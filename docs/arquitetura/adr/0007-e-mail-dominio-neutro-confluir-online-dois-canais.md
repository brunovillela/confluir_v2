# 0007. E-mail: domínio neutro `confluir.online`, dois canais

- **Status:** aceita
- **Data:** 26/08/2026. Troca do canal Auth para Resend em 22–23/09/2026.

- **Contexto:** o e-mail nativo do Supabase não entregava, porque um convite não chegou em 2 h. Verificar um domínio por tenant não escala. Em 22/09, um apagão do SMTP do Auth deixou eleitores sem código.
- **Decisão:** todo envio sai de `@confluir.online`, com SPF, DKIM e DMARC verificados uma vez e DNS na Vercel. A identidade do tenant vai no nome de exibição, no assunto, no conteúdo, nos links e no `replyTo` (`email_contato` da entidade). Há dois canais em provedores diferentes:
  - **APP:** `src/lib/email.ts`, pela API do Brevo, ou do Resend com `EMAIL_PROVEDOR=resend`.
  - **AUTH:** SMTP do Supabase, hoje no Resend, que serve só de reserva. Convites e códigos saem pelo canal do app (`generateLink` + `enviarEmail`).
- **Consequências:**
  - Nada crítico depende do SMTP do Supabase.
  - `EMAIL_SANDBOX=1` descarta o envio. No Brevo isso usa o cabeçalho `X-Sib-Sandbox`.
  - O usuário do SMTP do Resend é a palavra `resend`. Trocar o host sem trocar o usuário causou o apagão.
  - Links de e-mail valem 2 h.
  - A Site URL e as Redirect URLs do Supabase precisam incluir `https://*.confluir.online/**`.
- **Onde está:** `src/lib/email.ts` (`enviarEmail`, anexos), `src/lib/email-layout.ts`, `src/lib/db/acessos.ts` / `src/lib/codigo-acesso.ts` (`generateLink`), `docs/email-resend.md`, `scripts/testar-email.mjs`.
- **Observações:** o canal APP ainda usa o Brevo por padrão. O Resend no app é opcional, por variável.
