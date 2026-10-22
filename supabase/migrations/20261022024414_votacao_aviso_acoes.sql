-- Confluir — Votação: registro de quem mexe nos avisos da rodada (22/10/2026)
--
-- POR QUÊ: na Halliburton (21/10), com a votação aberta, alguém clicou em
-- "Reenviar a quem não votou": 1.209 aptos voltaram para a fila do aviso e o
-- alerta "sem link" acendeu — e o sistema não sabia dizer quem nem quando. O
-- reenvio, o envio manual em lotes e as chaves de envio automático mudam o que
-- milhares de pessoas recebem; precisam de rastro.
--
-- COMO: uma linha por ação na rodada — quem (usuário e nome no momento),
-- quando, qual ação e quantos aptos ela atingiu. Gravada pelas actions da
-- página da rodada; mostrada no card do aviso. Idempotente.

create table if not exists public.voto_aviso_acoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  rodada_id uuid not null references public.voto_rod_assembleias(id) on delete cascade,
  acao text not null,
  quantidade integer,
  detalhe text,
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamptz not null default now()
);

create index if not exists voto_aviso_acoes_rodada_idx
  on public.voto_aviso_acoes (emp_proprietaria_id, rodada_id, criado_em desc);

alter table public.voto_aviso_acoes enable row level security;
drop policy if exists tenant_isolation on public.voto_aviso_acoes;
create policy tenant_isolation on public.voto_aviso_acoes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.voto_aviso_acoes;
create trigger set_emp_from_jwt before insert on public.voto_aviso_acoes
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.voto_aviso_acoes from public, anon;
grant select, insert, update, delete on table public.voto_aviso_acoes to authenticated;
grant all on table public.voto_aviso_acoes to service_role;

comment on table public.voto_aviso_acoes is 'Rastro das ações sobre os avisos de uma rodada de votação (reenvio, envio manual em lotes, aviso prévio, envio automático): quem, quando, qual ação e quantos aptos atingiu. Mostrado no card do aviso da rodada (22/10/2026). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.voto_aviso_acoes.acao is 'reabrir_nao_votaram, reabrir_todos, reabrir_falhas, reabrir_contato, enviar_aviso, enviar_aviso_previo, aviso_auto, aviso_previo_auto.';
comment on column public.voto_aviso_acoes.quantidade is 'Aptos atingidos (voltaram para a fila, ou avisos enviados no lote).';
comment on column public.voto_aviso_acoes.usuario_id is 'Quem fez. [lgpd:identificacao]';
comment on column public.voto_aviso_acoes.usuario_nome is 'Nome de quem fez, no momento da ação. [lgpd:identificacao]';
