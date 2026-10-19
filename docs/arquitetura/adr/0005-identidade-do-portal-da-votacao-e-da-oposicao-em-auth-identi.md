# 0005. Identidade do portal, da votação e da oposição em `auth_identidades`

- **Status:** aceita
- **Data:** 03/10/2026.

- **Contexto:** a identidade do filiado vinha de `user_metadata.cpf`, que o próprio usuário altera pela API pública do Supabase. Qualquer sessão podia assumir o portal de outro filiado e votar por ele (achado S1). O mesmo problema afetava o fluxo de código (S2).
- **Decisão:** o vínculo conta↔CPF mora na tabela `auth_identidades`, e só o módulo `lib/auth-identidade.ts` grava nela. Há duas provas aceitas: senha com o e-mail do cadastro, ou código enviado ao e-mail do cadastro. Nos fluxos por código, o vínculo fica pendente antes do envio (`auth_vinculos_pendentes`). O formulário nunca decide o CPF.
- **Consequências:**
  - Nunca mais ler `user_metadata.cpf`.
  - E-mail compartilhado entre CPFs é recusado.
  - O link único de votação recusa e-mail corporativo para o código.
  - A autenticação também tem Turnstile, captcha do Supabase, bloqueio por conta após tentativas e 2FA TOTP opcional (`MFA_OBRIGATORIO`).
  - Navegador automatizado não passa no Turnstile. E2E e prints entram por link mágico.
- **Onde está:** `src/lib/auth-identidade.ts`, `src/lib/codigo-acesso.ts`, `src/lib/mfa.ts`, `src/lib/login-bloqueio.ts`, `src/lib/turnstile.ts`.
