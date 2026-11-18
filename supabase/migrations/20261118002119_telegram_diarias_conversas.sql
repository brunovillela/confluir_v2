-- Confluir — Diárias: pedido pelo Telegram (/diaria) (17/11/2026)
--
-- POR QUÊ: funcionários e diretores passam a pedir diária direto no bot, numa
-- conversa guiada (tipo, início, término, quantidade, motivo). Como no
-- /viagem, cada mensagem pode cair numa instância diferente, então o passo em
-- que cada conversa está precisa morar no banco.
--
-- COMO: `pessoal_telegram_diarias`, uma linha por chat do Telegram com o passo
-- atual e as respostas dadas até ali (jsonb). Vale por 30 minutos
-- (`expira_em`); ao confirmar ou cancelar, a linha é apagada. A diária em si
-- vai para `pessoal_diarias_solicitacoes` pela mesma criarSolicitacaoDiaria do
-- painel (src/lib/telegram-diaria.ts). O webhook lê e grava pelo cliente do
-- tenant (createAdminClient), depois de conferir que a entidade da pessoa é a
-- do endereço do bot; RLS por tenant como as demais tabelas.
-- Idempotente.

create table if not exists public.pessoal_telegram_diarias (
  chat_id text primary key,
  emp_proprietaria_id uuid not null references public.empresa(id),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  passo text not null,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists pessoal_telegram_diarias_expira_idx
  on public.pessoal_telegram_diarias (expira_em);

alter table public.pessoal_telegram_diarias enable row level security;
drop policy if exists tenant_isolation on public.pessoal_telegram_diarias;
create policy tenant_isolation on public.pessoal_telegram_diarias to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.pessoal_telegram_diarias;
create trigger set_emp_from_jwt before insert on public.pessoal_telegram_diarias
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.pessoal_telegram_diarias from public, anon;
grant select, insert, update, delete on table public.pessoal_telegram_diarias to authenticated;
grant all on table public.pessoal_telegram_diarias to service_role;

comment on table public.pessoal_telegram_diarias is 'Pedido de diária em andamento no bot do Telegram (/diaria): o passo da conversa e as respostas até ali; apagada ao confirmar ou cancelar e expira em 30 minutos (src/lib/telegram-diaria.ts). [lgpd:identificacao|titulares:funcionários, diretores]';
comment on column public.pessoal_telegram_diarias.chat_id is 'Chat do Telegram da pessoa (o mesmo de usuarios.telegram_chat_id). [lgpd:identificacao]';
comment on column public.pessoal_telegram_diarias.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_telegram_diarias.usuario_id is 'Quem está pedindo — e quem recebe a diária. [lgpd:identificacao]';
comment on column public.pessoal_telegram_diarias.passo is 'Passo atual da conversa (tipo, início, término, quantidade, motivo, confirmar). [lgpd:nenhum]';
comment on column public.pessoal_telegram_diarias.dados is 'Respostas dadas até o passo atual: tipo de diária, datas, quantidade e motivo. [lgpd:identificacao]';
comment on column public.pessoal_telegram_diarias.atualizado_em is 'Última resposta. [lgpd:nenhum]';
comment on column public.pessoal_telegram_diarias.expira_em is 'Depois disso a conversa é descartada e o /diaria recomeça. [lgpd:nenhum]';
