-- ============================================================================
-- Caixa de entrada × notificações (06/10/2026). Idempotente — rodar no SQL
-- Editor do Supabase.
--
-- Regra nova: a CAIXA DE ENTRADA é o que espera a pessoa agir (some quando é
-- resolvido); o SINO é o que aconteceu e é do interesse dela (histórico).
-- Chegada de pendência, lembrete diário, resumos e preventiva da frota deixam
-- de entrar no sino — seguem por e-mail, Telegram e celular, conforme as
-- preferências.
--
-- 1. avisos_entregas: o registro do que já foi enviado fora do sino, para não
--    repetir (lembrete uma vez por dia, preventiva uma vez por vencimento).
--    Antes isso era conferido na própria tabela do sino. Sem esta tabela o
--    sistema segue como antes (tudo no sino).
--
-- 2. Notificações antigas de "chegou pendência", lembretes e resumos ainda não
--    lidas viram lidas: o sino começa limpo. Nada é apagado.
-- ============================================================================

create table if not exists public.avisos_entregas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  usuario_id uuid not null,
  evento text not null,
  -- O que identifica o envio: o dia (lembretes e resumos) ou o texto estável
  -- do aviso (preventiva: muda quando o vencimento muda).
  chave text not null,
  created_at timestamptz not null default now(),
  unique (usuario_id, evento, chave)
);

create index if not exists avisos_entregas_criado_idx on public.avisos_entregas (created_at);

alter table public.avisos_entregas enable row level security;
drop policy if exists tenant_isolation on public.avisos_entregas;
create policy tenant_isolation on public.avisos_entregas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.avisos_entregas to authenticated;
drop trigger if exists set_emp_from_jwt on public.avisos_entregas;
create trigger set_emp_from_jwt before insert on public.avisos_entregas
  for each row execute function public.set_emp_from_jwt();

-- ── 2. Sino limpo: marca como lidas as antigas de pendência ────────────────
update public.notificacoes
set notificado = true
where notificado is not true
  and (
    -- Chegada de pendência (o link é sempre a fila de quem trata).
    link in (
      '/painel/aprovar',
      '/painel/pessoal/ferias',
      '/painel/pessoal/diarias',
      '/painel/pessoal/faltas',
      '/painel/pessoal/reembolsos',
      '/painel/filiados/solicitacoes',
      '/painel/filiados/reembolsos',
      '/painel/institucional/viagens',
      '/painel/compras/recebimentos',
      '/painel#caixa-entrada',
      '/painel/indicadores',
      '/painel'
    )
    or link like '/painel/espacos/pedidos/%'
    or link like '/painel/ferramentas/demandas/%'
    or link like '/painel/filiados/atendimentos/%'
    -- Lembretes, resumos e preventiva da frota (alguns sem link).
    or notificacao like 'Lembrete diário:%'
    or notificacao like 'Resumo semanal:%'
    or notificacao like 'Resumo de vencimentos:%'
    or notificacao like 'Revisão preventiva %'
    or notificacao like '%aguarda sua autorização%'
    or notificacao like '%aguardam sua autorização%'
  );
