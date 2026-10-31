-- Confluir — Bot do Telegram: comprovante por foto ou PDF (31/10/2026)
--
-- POR QUÊ: o que mais pesa no dia a dia é mandar comprovantes — recibo de
-- reembolso do ACT, cupom de abastecimento, atestado. Agora a pessoa manda a
-- foto ou o PDF ao bot, a IA lê e monta o lançamento, e ela só confirma. A
-- conversa tem vários passos (tipo, veículo, km, correções) e o bot roda em
-- funções sem estado, então o que foi lido e respondido até ali mora no banco.
-- E o abastecimento não tinha onde guardar o cupom.
--
-- COMO:
-- 1. `pessoal_telegram_arquivos`: uma linha por chat do Telegram com o passo
--    atual e os dados lidos/respondidos (jsonb). O arquivo NÃO é guardado
--    aqui nem no storage antes do "Confirmar": fica só o file_id do
--    Telegram, e o arquivo sobe ao bucket do painel na hora de gravar. Vale
--    30 minutos (`expira_em`); confirmar ou cancelar apaga a linha. Os dados
--    podem trazer leitura de atestado (dias, CID) — por isso sensivel_saude.
-- 2. `veiculos_abastecimentos.comprovante_url`: caminho do cupom no bucket
--    'veiculos' (opcional; o lançamento pelo painel segue sem).
-- O lançamento em si vai pelas MESMAS funções do painel (criarReembolso,
-- criarAbastecimento, criarAtestado) — src/lib/telegram-arquivo.ts. RLS por
-- tenant como as demais tabelas. Idempotente.

create table if not exists public.pessoal_telegram_arquivos (
  chat_id text primary key,
  emp_proprietaria_id uuid not null references public.empresa(id),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  passo text not null,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists pessoal_telegram_arquivos_expira_idx
  on public.pessoal_telegram_arquivos (expira_em);

alter table public.pessoal_telegram_arquivos enable row level security;
drop policy if exists tenant_isolation on public.pessoal_telegram_arquivos;
create policy tenant_isolation on public.pessoal_telegram_arquivos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.pessoal_telegram_arquivos;
create trigger set_emp_from_jwt before insert on public.pessoal_telegram_arquivos
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.pessoal_telegram_arquivos from public, anon;
grant select, insert, update, delete on table public.pessoal_telegram_arquivos to authenticated;
grant all on table public.pessoal_telegram_arquivos to service_role;

comment on table public.pessoal_telegram_arquivos is 'Comprovante mandado ao bot do Telegram (foto ou PDF) aguardando confirmação: o que a IA leu e o passo da conversa; apagada ao confirmar ou cancelar e expira em 30 minutos (src/lib/telegram-arquivo.ts). [lgpd:identificacao,financeiro,sensivel_saude|titulares:funcionários, diretores]';
comment on column public.pessoal_telegram_arquivos.chat_id is 'Chat do Telegram da pessoa (o mesmo de usuarios.telegram_chat_id). [lgpd:identificacao]';
comment on column public.pessoal_telegram_arquivos.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_telegram_arquivos.usuario_id is 'Quem mandou o arquivo. [lgpd:identificacao]';
comment on column public.pessoal_telegram_arquivos.passo is 'Passo atual da conversa (tipo, tipo do reembolso, veículo, hodômetro, funcionário, confirmar, corrigir). [lgpd:nenhum]';
comment on column public.pessoal_telegram_arquivos.dados is 'file_id do Telegram e o que a IA leu/a pessoa respondeu: valor e descrição do reembolso; posto, litros, valor, veículo e km do abastecimento; início, dias, acompanhamento e CID do atestado. [lgpd:identificacao,financeiro,sensivel_saude]';
comment on column public.pessoal_telegram_arquivos.atualizado_em is 'Última resposta. [lgpd:nenhum]';
comment on column public.pessoal_telegram_arquivos.expira_em is 'Depois disso a conversa é descartada e o arquivo precisa ser mandado de novo. [lgpd:nenhum]';

alter table public.veiculos_abastecimentos add column if not exists comprovante_url text;
comment on column public.veiculos_abastecimentos.comprovante_url is 'Caminho do cupom/nota do abastecimento no bucket ''veiculos'' (mandado pelo bot do Telegram). [lgpd:nenhum]';
