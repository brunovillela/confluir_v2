-- Confluir — Pessoal: motivo do uso do painel fora do expediente
--
-- POR QUÊ: o relatório Uso fora do expediente (20261119203000) mostra quanto
-- cada funcionário usou o sistema fora do horário, mas nem todo uso fora é
-- problema: há urgência, plantão, compensação combinada com a chefia. Sem o
-- motivo, a gestão de pessoal não separa o combinado do que precisa de
-- conversa (pedido de 19/11/2026).
--
-- COMO: na faixa amarela que aparece fora do horário, o próprio funcionário
-- informa o motivo do dia (urgência, combinado com a chefia, plantão ou
-- sobreaviso, compensação de horas, outro) e, se quiser, um detalhe curto.
-- Uma linha por pessoa e dia (o funcionário pode trocar o motivo no mesmo
-- dia). O relatório e a fila "Dias para conferir" do ponto mostram o motivo
-- ao lado do dia. RLS por entidade (tenant_isolation) e set_emp_from_jwt.
-- Idempotente.

create table if not exists public.pessoal_uso_justificativas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  data date not null,
  motivo text not null,
  detalhe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pessoal_uso_justificativas_motivo check (motivo in ('urgencia', 'combinado', 'plantao', 'compensacao', 'outro')),
  constraint pessoal_uso_justificativas_detalhe_curto check (detalhe is null or length(detalhe) <= 300),
  constraint pessoal_uso_justificativas_um_por_dia unique (usuario_id, data)
);

create index if not exists pessoal_uso_justificativas_emp_data_idx on public.pessoal_uso_justificativas (emp_proprietaria_id, data);

alter table public.pessoal_uso_justificativas enable row level security;
drop policy if exists tenant_isolation on public.pessoal_uso_justificativas;
create policy tenant_isolation on public.pessoal_uso_justificativas to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.pessoal_uso_justificativas from public, anon;
grant select, insert, update, delete on table public.pessoal_uso_justificativas to authenticated;
grant all on table public.pessoal_uso_justificativas to service_role;

drop trigger if exists set_emp_from_jwt on public.pessoal_uso_justificativas;
create trigger set_emp_from_jwt before insert on public.pessoal_uso_justificativas
  for each row execute function public.set_emp_from_jwt();

comment on table public.pessoal_uso_justificativas is 'Motivo que o funcionário informa para o uso do painel fora do expediente num dia (urgência, combinado com a chefia, plantão, compensação, outro). Aparece no relatório de uso fora do expediente e na fila de conferência do ponto (19/11/2026). [lgpd:trabalhista|titulares:funcionarios]';
comment on column public.pessoal_uso_justificativas.usuario_id is 'Quem informou o motivo (o próprio funcionário). [lgpd:identificacao]';
comment on column public.pessoal_uso_justificativas.data is 'Dia (horário de São Paulo) a que o motivo se refere.';
comment on column public.pessoal_uso_justificativas.motivo is 'urgencia, combinado (com a chefia), plantao (ou sobreaviso), compensacao (de horas) ou outro. [lgpd:trabalhista]';
comment on column public.pessoal_uso_justificativas.detalhe is 'Detalhe livre e curto escrito pelo funcionário (até 300 caracteres). [lgpd:trabalhista]';
