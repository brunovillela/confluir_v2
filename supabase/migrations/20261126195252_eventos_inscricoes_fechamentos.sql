-- Histórico de fechamentos e reaberturas das inscrições de um evento.
--
-- POR QUÊ: pedido de 26/11/2026. O evento guarda só o último fechamento
-- (eventos.inscricoes_encerradas_em/_por/_mensagem, 20261126165654 e
-- 20261126171832); reabrir apaga as três colunas. Quem fecha, reabre e fecha
-- de novo perde o vaivém — e é justamente o que se pergunta depois ("quem
-- reabriu? quando?").
--
-- COMO:
--  • eventos_inscricoes_fechamentos: uma linha por ação (fechou/reabriu), com
--    o recado do fechamento, quem fez e quando. Trilha: só inserção e leitura.
--  • RLS por tenant (tenant_isolation + set_emp_from_jwt), como as demais.
--  • Semeia o fechamento que já está em vigor, para o histórico não nascer
--    vazio nos eventos fechados antes desta migração.
--  Idempotente.

create table if not exists public.eventos_inscricoes_fechamentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  evento_id uuid not null references public.eventos(id) on delete cascade,
  acao text not null check (acao in ('fechou', 'reabriu')),
  mensagem text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists eventos_inscricoes_fechamentos_evento
  on public.eventos_inscricoes_fechamentos (evento_id, created_at);

alter table public.eventos_inscricoes_fechamentos enable row level security;
drop policy if exists tenant_isolation on public.eventos_inscricoes_fechamentos;
create policy tenant_isolation on public.eventos_inscricoes_fechamentos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.eventos_inscricoes_fechamentos;
create trigger set_emp_from_jwt before insert on public.eventos_inscricoes_fechamentos
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.eventos_inscricoes_fechamentos from public, anon;
grant all on table public.eventos_inscricoes_fechamentos to service_role;
-- Trilha: só inserção e leitura.
grant select, insert on table public.eventos_inscricoes_fechamentos to authenticated;

comment on table public.eventos_inscricoes_fechamentos is 'Histórico de fechamentos e reaberturas à mão das inscrições de um evento (só inserção). [lgpd:nenhum]';
comment on column public.eventos_inscricoes_fechamentos.acao is 'fechou ou reabriu. [lgpd:nenhum]';
comment on column public.eventos_inscricoes_fechamentos.mensagem is 'Recado mostrado a quem tentou se inscrever (só no fechamento). [lgpd:nenhum]';
comment on column public.eventos_inscricoes_fechamentos.usuario_id is 'Quem fechou ou reabriu. [lgpd:identificacao]';

-- O fechamento em vigor vira a primeira linha do histórico.
insert into public.eventos_inscricoes_fechamentos (emp_proprietaria_id, evento_id, acao, mensagem, usuario_id, created_at)
select e.emp_proprietaria_id, e.id, 'fechou', e.inscricoes_encerradas_mensagem, e.inscricoes_encerradas_por, e.inscricoes_encerradas_em
from public.eventos e
where e.inscricoes_encerradas_em is not null
  and not exists (
    select 1 from public.eventos_inscricoes_fechamentos f
    where f.evento_id = e.id and f.acao = 'fechou' and f.created_at = e.inscricoes_encerradas_em
  );
