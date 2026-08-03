# Confluir — Sindipetro-NF

SaaS de gestão organizacional para sindicatos. Migração do Bubble.io para Next.js 16 (App Router) + Supabase + Tailwind v4 + shadcn/ui.

## Estado atual — Fase 3A concluída

- **Autenticação (3 portas)**
  - Porta 1 — Funcionários: email + senha em `/login`, com primeiro acesso (convite por email) e recuperação de senha.
  - Porta 2 — Filiados: CPF + senha ou magic link em `/portal`.
  - Porta 3 — Eleitores: CPF + código de 6 dígitos em `/votar/[id]` (validação de aptos e cédula ficam para a Fase 3D).
- **Proxy de permissões** (`src/proxy.ts`) — renova a sessão, exige autenticação no `/painel` e aplica o mapa rota → permissão da tabela `permissoes`. As páginas repetem a checagem via `requirePermissao()` (defesa em profundidade).
- **Layout base** — sidebar colapsável (ícones), header com breadcrumbs, tema claro/escuro/sistema, dashboard com cards dos módulos permitidos.

## Para rodar

1. As chaves já estão em `.env.local` (não versionado).
2. `npm install && npm run dev`

## Configuração necessária no Supabase (uma vez)

0. **Rodar [supabase/setup-fase-3a.sql](supabase/setup-fase-3a.sql) no SQL Editor** — índice único de vínculo Auth em `usuarios`, índices das consultas de autenticação (CPF, aptos, permissões) e garantia de RLS em todas as tabelas.

1. **Auth → URL Configuration**: Site URL = URL do app; adicionar `http://localhost:3000/**` e o domínio de produção em Redirect URLs.
2. **Auth → Email Templates**:
   - Nos templates *Invite user*, *Magic Link* e *Reset Password*, troque o link para o padrão server-side:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (ajuste o `type` por template: `invite`, `magiclink`, `recovery`) e acrescente `&next=/definir-senha` nos de convite/recuperação e `&next=/portal/inicio` no magic link.
   - No template *Magic Link*, inclua também `{{ .Token }}` (código de 6 dígitos) — é o que o eleitor digita na votação (Porta 3).
3. **SMTP**: configure um provedor de email próprio (o SMTP embutido do Supabase tem limite baixo e não serve para produção).

## Segurança — modelo de acesso a dados

Verificado no banco em 2026-07-12: **RLS está habilitado** e a anon key não lê nenhuma tabela (deny-all). O modelo do app segue isso à risca:

- A **anon key** (pública, vai ao navegador) serve apenas para a sessão de autenticação (cookies/token).
- **Toda leitura e escrita de dados** acontece server-side com o **service role** (`SUPABASE_SERVICE_ROLE_KEY`, nunca exposto): Server Components, Server Actions e o proxy.
- Nunca consulte tabelas com o client anon/browser — com RLS deny-all retorna vazio; criar políticas permissivas para contornar reabre a exposição da API REST.

## Modelo de identidade (conferido no banco real)

No Bubble havia **uma única tabela `user`** — ela virou `usuarios` (11,5k linhas: todas as contas, não só funcionários). `filiacoes` é entidade de **registro de filiação**, não de conta: ~3 registros históricos por CPF, `usuario_id` 100% nulo e só ~15% dos CPFs existem em `usuarios`. Consequências aplicadas no código:

- **Funcionário do sistema** = registro em `usuarios` (ativo) **+ registro em `permissoes`** (81 pessoas). O vínculo com o Auth é `usuarios.auth_user_id`. Login, primeiro acesso, proxy e sessão exigem os dois.
- **Filiado** = pessoa identificada pelo **CPF**. A conta Auth guarda o CPF em `user_metadata.cpf` (gravado na criação da conta ou no primeiro login por senha); a sessão do portal agrega os registros de `filiacoes` por CPF ([src/lib/contas.ts](src/lib/contas.ts)). Não existe coluna de vínculo em `filiacoes`.
- Chaves de permissão reais: Hospedagem = `filiacao_hospedagens`, Agenda = `ferramentas_agendas`, Documentos = `ferramentas_documentos` etc. — fonte única em [src/lib/permissoes.ts](src/lib/permissoes.ts).

Pendências conhecidas:

| Pendência | Onde |
|---|---|
| Regras finas de situação da filiação (`filiacao_vinculos`) | Fase 3B — [src/lib/contas.ts](src/lib/contas.ts) |
| Janela de votação (início/término da rodada) | Fase 3D — [src/app/votar/[id]/actions.ts](src/app/votar/[id]/actions.ts) |
| Email compartilhado entre CPFs diferentes (dado legado): login por senha bloqueia; magic link resolve para o CPF gravado na criação da conta | comentários em [src/app/portal/actions.ts](src/app/portal/actions.ts) |

## Estrutura

```
src/
├── proxy.ts                  # sessão + gate de permissões (Next 16: proxy substitui middleware)
├── lib/
│   ├── permissoes.ts         # fonte única: módulos, rotas, chaves de permissão
│   ├── auth.ts               # getSessaoPainel/Portal, requirePermissao (React cache)
│   ├── contas.ts             # lookup por CPF, criação/vínculo de contas, máscara de email
│   ├── cpf.ts                # validação e máscaras de CPF
│   └── supabase/             # clients: browser, server (SSR) e admin (service role)
├── app/
│   ├── login/                # Porta 1 + primeiro acesso + recuperar senha
│   ├── portal/               # Porta 2 (login CPF) + /portal/inicio
│   ├── votar/[id]/           # Porta 3 (CPF + token)
│   ├── auth/confirm/         # destino dos links de email (verifyOtp / PKCE)
│   ├── definir-senha/        # pós-convite e pós-recuperação
│   └── painel/               # layout base + dashboard + stub dos módulos
└── components/
    ├── layout/               # app-sidebar, app-header (breadcrumbs), ícones dos módulos
    └── auth/                 # auth-shell, campo CPF com máscara, form de email
```
