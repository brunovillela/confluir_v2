-- Presença lançada depois, pela página do evento.
--
-- POR QUÊ: pedido de 27/11/2026. Hoje a presença só entra pela tela Recepção,
-- uma pessoa por vez, só com o evento publicado, sem desfazer e sem distinguir
-- o que foi lançado depois (a partir da lista em papel, por exemplo) do que
-- foi lido na porta.
--
-- COMO:
--  • eventos_presencas.metodo passa a aceitar 'manual' (lançada depois pela
--    gestão). Quem lançou e quando já ficam em confirmada_por/confirmada_em.
--  • eventos_presencas_ajustes: trilha (só inserção) de cada presença lançada
--    ou retirada à mão — retirar apaga a linha de eventos_presencas, e a
--    trilha guarda que ela existiu, quem retirou e quando.
--  Idempotente.

alter table public.eventos_presencas drop constraint if exists ck_eventos_presencas_metodo;
alter table public.eventos_presencas
  add constraint ck_eventos_presencas_metodo check (metodo = any (array['qr'::text, 'busca'::text, 'manual'::text])) not valid;
comment on column public.eventos_presencas.metodo is 'Como a presença foi confirmada: qr ou busca (na porta) ou manual (lançada depois pela gestão, na página do evento). [lgpd:nenhum]';

create table if not exists public.eventos_presencas_ajustes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  evento_id uuid not null references public.eventos(id) on delete cascade,
  inscricao_id uuid references public.eventos_inscricoes(id) on delete cascade,
  dia_id uuid references public.eventos_dias(id) on delete cascade,
  acao text not null check (acao in ('lancou', 'retirou')),
  usuario_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists eventos_presencas_ajustes_evento
  on public.eventos_presencas_ajustes (evento_id, created_at);

alter table public.eventos_presencas_ajustes enable row level security;
drop policy if exists tenant_isolation on public.eventos_presencas_ajustes;
create policy tenant_isolation on public.eventos_presencas_ajustes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.eventos_presencas_ajustes;
create trigger set_emp_from_jwt before insert on public.eventos_presencas_ajustes
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.eventos_presencas_ajustes from public, anon;
grant all on table public.eventos_presencas_ajustes to service_role;
-- Trilha: só inserção e leitura.
grant select, insert on table public.eventos_presencas_ajustes to authenticated;

comment on table public.eventos_presencas_ajustes is 'Presenças lançadas ou retiradas à mão na página do evento, depois da porta (só inserção). [lgpd:identificacao|titulares:filiados e convidados]';
comment on column public.eventos_presencas_ajustes.inscricao_id is 'De quem é a presença (eventos_inscricoes). [lgpd:identificacao]';
comment on column public.eventos_presencas_ajustes.acao is 'lancou ou retirou. [lgpd:nenhum]';
comment on column public.eventos_presencas_ajustes.usuario_id is 'Quem lançou ou retirou. [lgpd:identificacao]';
