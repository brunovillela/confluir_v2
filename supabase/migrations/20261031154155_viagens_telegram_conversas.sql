-- Confluir — Viagens: pedido pelo Telegram (/viagem) (31/10/2026)
--
-- POR QUÊ: funcionários e diretores pedem passagem (aérea ou rodoviária) e
-- hospedagem direto no bot, numa conversa guiada de vários passos. O bot roda
-- em funções sem estado (cada mensagem pode cair numa instância diferente), então
-- o passo em que cada conversa está precisa morar no banco — a memória do
-- processo, que o /aprovar usa para o motivo da devolução, não dá conta de
-- oito perguntas.
--
-- COMO: `viagens_telegram_conversas`, uma linha por chat do Telegram com o
-- passo atual e as respostas dadas até ali (jsonb). Vale por 30 minutos
-- (`expira_em`); ao confirmar ou cancelar, a linha é apagada. O pedido em si
-- vai para `viagens_solicitacoes`/`viagens_itens` pela mesma criarViagem do
-- painel (src/lib/telegram-viagem.ts). O webhook lê e grava pelo cliente do
-- tenant (createAdminClient), depois de conferir que a entidade da pessoa é a
-- do endereço do bot; RLS por tenant como as demais tabelas.
-- Idempotente.

create table if not exists public.viagens_telegram_conversas (
  chat_id text primary key,
  emp_proprietaria_id uuid not null references public.empresa(id),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  passo text not null,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists viagens_telegram_conversas_expira_idx
  on public.viagens_telegram_conversas (expira_em);

alter table public.viagens_telegram_conversas enable row level security;
drop policy if exists tenant_isolation on public.viagens_telegram_conversas;
create policy tenant_isolation on public.viagens_telegram_conversas to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.viagens_telegram_conversas;
create trigger set_emp_from_jwt before insert on public.viagens_telegram_conversas
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.viagens_telegram_conversas from public, anon;
grant select, insert, update, delete on table public.viagens_telegram_conversas to authenticated;
grant all on table public.viagens_telegram_conversas to service_role;

comment on table public.viagens_telegram_conversas is 'Pedido de viagem em andamento no bot do Telegram (/viagem): o passo da conversa e as respostas até ali; apagada ao confirmar ou cancelar e expira em 30 minutos (src/lib/telegram-viagem.ts). [lgpd:identificacao|titulares:funcionários, diretores]';
comment on column public.viagens_telegram_conversas.chat_id is 'Chat do Telegram da pessoa (o mesmo de usuarios.telegram_chat_id). [lgpd:identificacao]';
comment on column public.viagens_telegram_conversas.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.viagens_telegram_conversas.usuario_id is 'Quem está pedindo — e quem vai viajar. [lgpd:identificacao]';
comment on column public.viagens_telegram_conversas.passo is 'Passo atual da conversa (tipo, origem, destino, ida, volta, horário, hotel, motivo, departamento, confirmar). [lgpd:nenhum]';
comment on column public.viagens_telegram_conversas.dados is 'Respostas dadas até o passo atual: modal, origem, destino, datas, horário, hotel, motivo e departamento. [lgpd:identificacao]';
comment on column public.viagens_telegram_conversas.atualizado_em is 'Última resposta. [lgpd:nenhum]';
comment on column public.viagens_telegram_conversas.expira_em is 'Depois disso a conversa é descartada e o /viagem recomeça. [lgpd:nenhum]';
