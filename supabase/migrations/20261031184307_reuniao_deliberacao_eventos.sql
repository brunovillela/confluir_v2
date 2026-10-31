-- Deliberações: trilha de alterações.
--
-- POR QUÊ: não ficava registrado quem mudou a situação, o prazo, o sigilo ou
-- o responsável de uma deliberação, nem quando — e a diretoria presta contas
-- do que foi decidido e cumprido (31/10/2026).
--
-- COMO: `reuniao_deliberacao_eventos`, uma linha por criação, alteração ou
-- exclusão: quem (id + nome no momento), quando, e nas alterações cada campo
-- com o valor de antes e o de depois, já como se lê na tela. A linha guarda o
-- sigilo e o assunto da deliberação naquele momento: a trilha só é mostrada
-- a quem alcança o sigilo, e sobrevive à exclusão da deliberação
-- (`deliberacao_id` vira nulo; `ata_id` continua). Só se acrescenta; não se
-- edita nem apaga pela aplicação. Idempotente.

create table if not exists public.reuniao_deliberacao_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  deliberacao_id uuid references public.reuniao_deliberacao(id) on delete set null,
  ata_id uuid references public.reuniao_ata(id) on delete cascade,
  evento text not null check (evento in ('criada', 'alterada', 'excluida')),
  origem text not null default 'manual' check (origem in ('manual', 'ia')),
  mudancas jsonb not null default '[]'::jsonb,
  assunto text,
  sigilo text not null check (sigilo in ('livre', 'reservado', 'restrito')),
  autor_id uuid,
  autor_nome text,
  created_at timestamptz not null default now()
);

create index if not exists reuniao_deliberacao_eventos_deliberacao_idx
  on public.reuniao_deliberacao_eventos (deliberacao_id, created_at);
create index if not exists reuniao_deliberacao_eventos_ata_idx
  on public.reuniao_deliberacao_eventos (ata_id, created_at);

alter table public.reuniao_deliberacao_eventos enable row level security;
drop policy if exists tenant_isolation on public.reuniao_deliberacao_eventos;
create policy tenant_isolation on public.reuniao_deliberacao_eventos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

comment on table public.reuniao_deliberacao_eventos is 'Trilha das deliberações das atas: criação, alteração (campo, antes e depois) e exclusão, com autor e data. Mostrada só a quem alcança o sigilo gravado na linha. [lgpd:identificacao,sensivel_sindical|titulares:diretores e participantes]';
comment on column public.reuniao_deliberacao_eventos.deliberacao_id is 'Deliberação a que o evento se refere; nulo depois que ela é excluída (a trilha fica). [lgpd:nenhum]';
comment on column public.reuniao_deliberacao_eventos.ata_id is 'Ata da deliberação — mantém a trilha ligada à ata mesmo após a exclusão da deliberação. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao_eventos.evento is 'criada, alterada ou excluida. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao_eventos.origem is 'manual (formulário) ou ia (lida do PDF da ata ao salvar). [lgpd:nenhum]';
comment on column public.reuniao_deliberacao_eventos.mudancas is 'Na alteração: lista de {campo, antes, depois} já formatados para leitura (responsável pelo nome, datas dd/mm/aaaa). [lgpd:identificacao]';
comment on column public.reuniao_deliberacao_eventos.assunto is 'Assunto da deliberação no momento do evento (identifica a excluída). [lgpd:identificacao]';
comment on column public.reuniao_deliberacao_eventos.sigilo is 'Sigilo da deliberação no momento do evento — decide quem vê a linha. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao_eventos.autor_id is 'Usuário que fez a mudança. [lgpd:identificacao]';
comment on column public.reuniao_deliberacao_eventos.autor_nome is 'Nome do autor no momento (a trilha não muda se o cadastro mudar). [lgpd:identificacao]';
