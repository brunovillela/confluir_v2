-- Confluir — Oposição: versões da carta, com comparação (15/11/2026)
--
-- POR QUÊ: o texto da carta passou a ser editável (14/11/2026), mas só o
-- último texto ficava guardado no padrão da entidade e na campanha; a trilha
-- dizia quem alterou e quando, não o que mudou. O jurídico precisa ver o
-- texto de cada versão e comparar duas (o que entrou, o que saiu).
--
-- COMO:
--  1. `oposicao_carta_versoes`: cada vez que o texto é salvo, uma linha com o
--     texto inteiro, o nível (campanha_id nulo = padrão da entidade), quem e
--     quando. modelo nulo = voltou ao padrão (do sistema ou da entidade).
--     Só insere, como a trilha: versão registrada não muda nem some, salvo o
--     expurgo legal (a mesma chave confluir.oposicao_expurgo).
--  2. Carga inicial: o texto salvo hoje em cada nível vira a primeira versão
--     conhecida (com o autor e a data gravados no próprio nível).
-- Idempotente.

create table if not exists public.oposicao_carta_versoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  campanha_id uuid references public.oposicao_campanha(id) on delete cascade,
  modelo text,
  por_id uuid,
  por_nome text,
  criado_em timestamptz not null default now()
);

create index if not exists oposicao_carta_versoes_nivel_idx
  on public.oposicao_carta_versoes (emp_proprietaria_id, campanha_id, criado_em desc);

alter table public.oposicao_carta_versoes enable row level security;
drop policy if exists tenant_isolation on public.oposicao_carta_versoes;
create policy tenant_isolation on public.oposicao_carta_versoes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.oposicao_carta_versoes;
create trigger set_emp_from_jwt before insert on public.oposicao_carta_versoes
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.oposicao_carta_versoes from public, anon;
grant select, insert on table public.oposicao_carta_versoes to authenticated;
grant all on table public.oposicao_carta_versoes to service_role;

create or replace function public.oposicao_carta_versoes_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('confluir.oposicao_expurgo', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Versão da carta registrada não pode ser alterada nem apagada.';
end;
$$;

drop trigger if exists oposicao_carta_versoes_imutavel on public.oposicao_carta_versoes;
create trigger oposicao_carta_versoes_imutavel before update or delete on public.oposicao_carta_versoes
  for each row execute function public.oposicao_carta_versoes_imutavel();

comment on table public.oposicao_carta_versoes is 'Cada texto salvo da carta de oposição (padrão da entidade ou de uma campanha), com autor e data, para ver e comparar versões. Só insere (15/11/2026). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.oposicao_carta_versoes.campanha_id is 'Campanha do texto; nulo = padrão da entidade. [lgpd:nenhum]';
comment on column public.oposicao_carta_versoes.modelo is 'O texto salvo, com as referências; nulo = voltou ao padrão (do sistema, na entidade; da entidade, na campanha). [lgpd:nenhum]';
comment on column public.oposicao_carta_versoes.por_id is 'Quem salvou. [lgpd:identificacao]';
comment on column public.oposicao_carta_versoes.por_nome is 'Nome de quem salvou, no momento. [lgpd:identificacao]';
comment on column public.oposicao_carta_versoes.criado_em is 'Quando salvou. [lgpd:nenhum]';

-- Carga inicial: o texto salvo hoje em cada nível, uma vez só.
insert into public.oposicao_carta_versoes (emp_proprietaria_id, campanha_id, modelo, por_nome, criado_em)
select r.emp_proprietaria_id, null, r.carta_modelo, r.carta_modelo_por_nome, coalesce(r.carta_modelo_em, now())
from public.oposicao_regras r
where r.carta_modelo is not null
  and not exists (
    select 1 from public.oposicao_carta_versoes v
    where v.emp_proprietaria_id = r.emp_proprietaria_id and v.campanha_id is null
  );

insert into public.oposicao_carta_versoes (emp_proprietaria_id, campanha_id, modelo, por_nome, criado_em)
select c.emp_proprietaria_id, c.id, c.carta_modelo, c.carta_modelo_por_nome, coalesce(c.carta_modelo_em, now())
from public.oposicao_campanha c
where c.carta_modelo is not null
  and not exists (select 1 from public.oposicao_carta_versoes v where v.campanha_id = c.id);
