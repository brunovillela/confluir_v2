-- Confluir — Oposição, onda 2: trabalho da entidade em escala (27/10/2026)
--
-- POR QUÊ: o processo grande traz milhares de oposições. Avaliar uma página
-- por vez não fecha a tempo do desconto; e a decisão precisa chegar ao
-- trabalhador sem disparar milhares de e-mails no mesmo segundo. Depois, a
-- entidade manda a cada empregador a relação de quem deixa de ter desconto —
-- e precisa provar o que mandou, quando e para quem (achados C6, C7 e A12 de
-- docs/avaliacao-oposicao-2026-10.md).
--
-- COMO:
--  1. `oposicao_opositor.aviso_avaliacao_pendente_em`: a avaliação em lote (e
--     o encerramento das que não mandaram a carta) grava a decisão na hora e
--     põe o aviso na fila; a rota /api/oposicao/tick manda aos poucos e limpa
--     a marca. A avaliação individual continua avisando na hora.
--  2. `oposicao_envios_empregador`: cada envio da relação a um empregador —
--     quem, quando, por qual meio e QUAIS oposições foram (snapshot dos ids),
--     para saber o que entrou depois do último envio. Só insere: um envio
--     registrado não muda nem some (trigger), como a trilha da onda 0.
-- Idempotente.

-- ── 1. Fila do aviso da avaliação ───────────────────────────────────────────
alter table public.oposicao_opositor
  add column if not exists aviso_avaliacao_pendente_em timestamptz;

comment on column public.oposicao_opositor.aviso_avaliacao_pendente_em is 'Decisão tomada em lote cujo aviso ao trabalhador ainda não saiu; a rota /api/oposicao/tick envia aos poucos e volta a null. [lgpd:nenhum]';

create index if not exists oposicao_opositor_aviso_pendente_idx
  on public.oposicao_opositor (emp_proprietaria_id, aviso_avaliacao_pendente_em)
  where aviso_avaliacao_pendente_em is not null;

-- ── 2. Envios da relação ao empregador ──────────────────────────────────────
create table if not exists public.oposicao_envios_empregador (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  campanha_id uuid not null references public.oposicao_campanha(id) on delete restrict,
  empresa_id uuid references public.empresa(id) on delete restrict,
  enviado_em timestamptz not null default now(),
  usuario_id uuid,
  usuario_nome text,
  meio text not null check (meio in ('email', 'oficio', 'em_maos', 'sistema_rh', 'outro')),
  referencia text,
  observacao text,
  opositor_ids uuid[] not null default '{}',
  quantidade integer not null check (quantidade >= 0)
);

create index if not exists oposicao_envios_empregador_campanha_idx
  on public.oposicao_envios_empregador (emp_proprietaria_id, campanha_id, empresa_id, enviado_em desc);

alter table public.oposicao_envios_empregador enable row level security;
drop policy if exists tenant_isolation on public.oposicao_envios_empregador;
create policy tenant_isolation on public.oposicao_envios_empregador to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.oposicao_envios_empregador;
create trigger set_emp_from_jwt before insert on public.oposicao_envios_empregador
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.oposicao_envios_empregador from public, anon;
grant select, insert on table public.oposicao_envios_empregador to authenticated;
grant all on table public.oposicao_envios_empregador to service_role;

-- Registro de envio é prova: não se altera nem se apaga (salvo o expurgo
-- legal, pela mesma chave da trilha da onda 0).
create or replace function public.oposicao_envios_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('confluir.oposicao_expurgo', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Envio ao empregador registrado não pode ser alterado nem apagado.';
end;
$$;

drop trigger if exists oposicao_envios_imutavel on public.oposicao_envios_empregador;
create trigger oposicao_envios_imutavel before update or delete on public.oposicao_envios_empregador
  for each row execute function public.oposicao_envios_imutavel();

comment on table public.oposicao_envios_empregador is 'Cada envio, a um empregador, da relação de oposições aprovadas de uma campanha: quem enviou, quando, por qual meio e quais oposições foram (snapshot). Só insere (27/10/2026). [lgpd:identificacao|titulares:opositores, usuários do sistema]';
comment on column public.oposicao_envios_empregador.empresa_id is 'Fonte pagadora que recebeu a relação; null = oposições sem fonte informada.';
comment on column public.oposicao_envios_empregador.meio is 'email, oficio, em_maos, sistema_rh ou outro.';
comment on column public.oposicao_envios_empregador.referencia is 'Número do ofício, protocolo do RH ou assunto do e-mail.';
comment on column public.oposicao_envios_empregador.usuario_id is 'Quem registrou o envio. [lgpd:identificacao]';
comment on column public.oposicao_envios_empregador.usuario_nome is 'Nome de quem registrou, no momento do envio. [lgpd:identificacao]';
comment on column public.oposicao_envios_empregador.opositor_ids is 'Oposições que constavam da relação enviada (ids de oposicao_opositor). [lgpd:identificacao]';
comment on column public.oposicao_envios_empregador.quantidade is 'Quantas oposições a relação levava.';
