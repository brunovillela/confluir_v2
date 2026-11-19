-- Confluir — Pessoal: uso do painel fora do expediente
--
-- POR QUÊ: o painel já avisa o funcionário que usa o sistema fora da jornada
-- contratada (faixa amarela, AlertaForaJornada), mas nada ficava registrado.
-- O departamento de pessoal precisa saber QUANTO tempo cada um usou o sistema
-- fora do horário (antes da entrada, depois da saída, no intervalo, em fim de
-- semana, feriado, férias ou afastamento) — é aí que nasce passivo de horas
-- extras e de intervalo suprimido (Pessoal › Controle de ponto › Uso fora do
-- expediente, 19/11/2026).
--
-- COMO: o painel do funcionário COM jornada vinculada manda um sinal por
-- minuto enquanto a aba está visível e em uso (teclado, mouse, toque ou
-- rolagem no último minuto). Cada sinal estende o bloco aberto da pessoa
-- (fim = agora) ou abre um novo quando o último terminou há mais de 3
-- minutos. Uma linha por bloco contínuo de uso — poucas por dia. NÃO guarda
-- página, conteúdo nem endereço: só quem, início e fim. A conta do que caiu
-- fora do expediente é feita na leitura (lib/uso-fora-expediente.ts), contra
-- a jornada, os feriados, as férias e as ausências.
-- RLS por entidade (tenant_isolation) e set_emp_from_jwt. Idempotente.

create table if not exists public.pessoal_uso_painel (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  created_at timestamptz not null default now(),
  constraint pessoal_uso_painel_ordem check (fim >= inicio)
);

create index if not exists pessoal_uso_painel_emp_inicio_idx on public.pessoal_uso_painel (emp_proprietaria_id, inicio);
create index if not exists pessoal_uso_painel_usuario_fim_idx on public.pessoal_uso_painel (usuario_id, fim desc);

alter table public.pessoal_uso_painel enable row level security;
drop policy if exists tenant_isolation on public.pessoal_uso_painel;
create policy tenant_isolation on public.pessoal_uso_painel to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.pessoal_uso_painel from public, anon;
grant select, insert, update, delete on table public.pessoal_uso_painel to authenticated;
grant all on table public.pessoal_uso_painel to service_role;

drop trigger if exists set_emp_from_jwt on public.pessoal_uso_painel;
create trigger set_emp_from_jwt before insert on public.pessoal_uso_painel
  for each row execute function public.set_emp_from_jwt();

comment on table public.pessoal_uso_painel is 'Blocos contínuos de uso do painel por funcionário com jornada vinculada (sinal por minuto com a aba visível e em uso). Base do relatório de uso fora do expediente (Pessoal › Controle de ponto, 19/11/2026). Não guarda página nem conteúdo. [lgpd:identificacao|titulares:funcionarios]';
comment on column public.pessoal_uso_painel.usuario_id is 'Quem estava usando o painel. [lgpd:identificacao]';
comment on column public.pessoal_uso_painel.inicio is 'Início do bloco de uso (um minuto antes do primeiro sinal).';
comment on column public.pessoal_uso_painel.fim is 'Último sinal de uso do bloco.';
