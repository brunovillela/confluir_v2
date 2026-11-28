-- Confluir — Veículos: checklist e km do carro dedicado pelo Telegram (27/11/2026)
--
-- POR QUÊ: o carro de locação de uso DEDICADO fica com um condutor e não passa
-- pela recepção — não tem checklist de saída nem leitura de km. Sem isso, os
-- apontamentos, a preventiva por km e a franquia ficam cegos para ele. O
-- sistema passa a pedir ao condutor dedicado, pelo bot, o checklist (com o km)
-- quando o prazo do checklist do carro chega, e ele responde ali mesmo.
--
-- COMO:
-- - `veiculos_telegram_checklists`: a conversa em andamento no bot (/checklist),
--   uma linha por chat, com o passo e as respostas até ali (jsonb), como
--   `pessoal_telegram_diarias`. Vale 2 horas; ao salvar ou cancelar, é apagada.
--   O checklist em si vai para `veiculos_checklists` pela mesma gravação da tela
--   (src/lib/telegram-checklist.ts).
-- - `veiculos.checklist_pedido_em`: quando o tick diário pediu o checklist ao
--   condutor dedicado pela última vez — para lembrar a cada poucos dias, sem
--   repetir todo dia, e para o resumo da gestão dizer desde quando espera.
-- RLS por tenant como as demais tabelas. Idempotente.

create table if not exists public.veiculos_telegram_checklists (
  chat_id text primary key,
  emp_proprietaria_id uuid not null references public.empresa(id),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  passo text not null,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists veiculos_telegram_checklists_expira_idx
  on public.veiculos_telegram_checklists (expira_em);

alter table public.veiculos_telegram_checklists enable row level security;
drop policy if exists tenant_isolation on public.veiculos_telegram_checklists;
create policy tenant_isolation on public.veiculos_telegram_checklists to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.veiculos_telegram_checklists;
create trigger set_emp_from_jwt before insert on public.veiculos_telegram_checklists
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.veiculos_telegram_checklists from public, anon;
grant select, insert, update, delete on table public.veiculos_telegram_checklists to authenticated;
grant all on table public.veiculos_telegram_checklists to service_role;

comment on table public.veiculos_telegram_checklists is 'Checklist do carro dedicado em andamento no bot do Telegram (/checklist): o passo da conversa e as respostas até ali; apagada ao salvar ou cancelar e expira em 2 horas (src/lib/telegram-checklist.ts). [lgpd:identificacao|titulares:condutores]';
comment on column public.veiculos_telegram_checklists.chat_id is 'Chat do Telegram do condutor (o mesmo de usuarios.telegram_chat_id). [lgpd:identificacao]';
comment on column public.veiculos_telegram_checklists.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.veiculos_telegram_checklists.usuario_id is 'Condutor que está fazendo o checklist — vira o inspetor do checklist. [lgpd:identificacao]';
comment on column public.veiculos_telegram_checklists.veiculo_id is 'Carro verificado. [lgpd:nenhum]';
comment on column public.veiculos_telegram_checklists.passo is 'Passo atual da conversa (km, apontamentos, itens, descrições, confirmar). [lgpd:nenhum]';
comment on column public.veiculos_telegram_checklists.dados is 'Respostas até o passo atual: km, apontamentos que permanecem, itens com problema e as descrições. [lgpd:nenhum]';
comment on column public.veiculos_telegram_checklists.atualizado_em is 'Última resposta. [lgpd:nenhum]';
comment on column public.veiculos_telegram_checklists.expira_em is 'Depois disso a conversa é descartada e o /checklist recomeça. [lgpd:nenhum]';

alter table public.veiculos add column if not exists checklist_pedido_em timestamptz;
comment on column public.veiculos.checklist_pedido_em is 'Carro de uso dedicado: quando o checklist foi pedido ao condutor pelo Telegram pela última vez (tick diário de veículos); o lembrete se repete a cada 3 dias enquanto o checklist estiver no prazo ou vencido. [lgpd:nenhum]';
