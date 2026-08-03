-- Confluir — Desconto de infração de trânsito em diárias (2026-08-01)
--
-- A infração não sindical de um infrator (tipicamente diretor, sem contracheque)
-- pode ser cobrada como "desconto em diárias" (veiculos_infracoes.cobranca_forma
-- = 'diaria', cobranca_situacao = 'pendente'). Faltava o mecanismo: ao APROVAR
-- uma diária do infrator, as infrações pendentes dele nessa forma são abatidas
-- do valor, a ordem de pagamento sai LÍQUIDA e as infrações ficam 'baixada'.
--
-- Esta tabela é a trilha de auditoria de quais infrações foram descontadas em
-- qual diária (o Conselho Fiscal precisa rastrear). O total abatido = soma dos
-- `valor` aqui; a ordem já reflete o líquido; a infração guarda a baixa.
--
-- Depois de rodar, RE-RODAR supabase/rls-emp-todas.sql (tabela nova tenant-owned
-- precisa da policy/grant/trigger set_emp_from_jwt — nada de RLS deny-all).

create table if not exists public.pessoal_diarias_descontos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  diaria_solicitacao_id uuid not null
    references public.pessoal_diarias_solicitacoes (id) on delete cascade,
  infracao_id uuid not null references public.veiculos_infracoes (id),
  valor numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists pessoal_diarias_descontos_solic_idx
  on public.pessoal_diarias_descontos (diaria_solicitacao_id);
create index if not exists pessoal_diarias_descontos_infracao_idx
  on public.pessoal_diarias_descontos (infracao_id);

alter table public.pessoal_diarias_descontos enable row level security;
