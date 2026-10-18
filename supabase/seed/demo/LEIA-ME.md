# Ambiente de demonstração (dados fictícios) — para os prints do manual

Este ambiente cria uma **organização de demonstração** isolada, com dados
100% fictícios, para capturar as telas do manual (`/painel/ajuda`) sem expor
nenhum dado real. Tudo fica preso a um `emp_proprietaria_id` próprio — o tenant
real (Sindipetro-NF) não é tocado.

- **Empresa/tenant demo:** `11111111-1111-4111-8111-111111111111` (slug `demo`)
- **Login da demo:** `demo@confluir.local`
- **Seed:** [`demo-seed-pessoal.sql`](./demo-seed-pessoal.sql) (módulo Pessoal)

## Runbook

### 1. Criar o login da demo (uma vez)
No Supabase → **Authentication → Users → Add user**:
- E-mail: `demo@confluir.local`
- Senha: à sua escolha (você vai usá-la no passo 4)
- Marque como confirmado (auto-confirm), para poder logar direto.

### 2. Rodar o seed
No Supabase → **SQL Editor**, cole e rode
[`demo-seed-pessoal.sql`](./demo-seed-pessoal.sql). Ele é idempotente:
começa apagando os dados da empresa demo e reinsere — pode rodar quantas vezes
quiser, inclusive para limpar resquícios de uma execução que falhou no meio.
Cria a empresa/tenant, a conta operadora (já ligada ao login do passo 1 pelo
e-mail), ~10 funcionários, remessas de contracheque e de ponto e períodos de
férias.

> Se você criar o login **depois** de rodar o seed, rode o seed de novo — o
> vínculo do `auth_user_id` é refeito a cada execução.

### 3. Subir um dev server apontando para o tenant demo
O tenant, em `localhost`, vem da variável `NEXT_PUBLIC_EMP_PROPRIETARIA_ID`.
Variáveis do shell têm precedência sobre o `.env.local`, então **não precisa
editar nenhum arquivo** — rode numa porta separada:

```bash
$env:NEXT_PUBLIC_EMP_PROPRIETARIA_ID='11111111-1111-4111-8111-111111111111'; npm run dev -- -p 3222
```

Esse servidor mostra **só** os dados da demo. Seu servidor normal continua
intocado.

### 4. Logar e me entregar a sessão (para eu capturar os prints)
1. Abra `http://localhost:3222/login` no **painel do navegador** (Browser pane) e
   **deixe o painel visível** (a captura de tela exige o painel renderizando).
2. **Você** digita o e-mail e a senha da demo (eu não faço login nem manipulo
   senhas).
3. Me avise que está logado e em qual porta — eu navego pelas telas do Pessoal
   e capturo os prints, que entram nos artigos em `public/ajuda/pessoal/`.

## O que a demo já cobre (Pessoal)
- **Funcionários:** 10 registros (9 ativos + 1 desligado, para mostrar o filtro).
- **Contracheques:** 1 remessa aberta (itens liberados e bloqueados) + 1 finalizada.
- **Ponto:** 1 remessa aberta com horas 70%/100%.
- **Férias:** 2 períodos; 1 com concessivo vencendo (~60 dias) e 1 gozo aguardando
  autorização — isso faz a tela inicial do Pessoal exibir a seção
  "Precisa de atenção", ótima para print.

## Expandir depois
Para os demais módulos, replicar o padrão do seed (sempre preso ao
`emp_proprietaria_id` da demo) em novos arquivos `demo-seed-<modulo>.sql`.
