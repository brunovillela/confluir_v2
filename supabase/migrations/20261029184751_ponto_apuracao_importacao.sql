-- Confluir — Controle de ponto: regras de apuração e importação de relatório (29/10/2026)
--
-- POR QUÊ: as horas extras do mês eram digitadas à mão, conferindo o cartão
-- ponto. O relatório do relógio (Secullum) vem com todos os funcionários num
-- PDF só, e os totais dele podem estar errados. A entidade quer apurar pelas
-- BATIDAS registradas, com regras que ela mesma define, e anexar a página de
-- cada um ao registro dele.
--
-- COMO:
-- 1. Regras da entidade em pessoal_folha_config (colunas he_*): que dias vão
--    para a faixa 2, de onde saem as horas negativas, tolerância diária,
--    ocorrências que abonam o dia e o que fazer com mês sem batidas.
-- 2. pessoal_ponto_importacoes: um relatório enviado a uma remessa (global,
--    parcial ou individual). pessoal_ponto_importacao_itens: um funcionário do
--    relatório (as páginas dele), com a leitura da IA, a apuração feita pelo
--    código e a situação até ser aplicado ao registro da remessa.
-- Idempotente.

alter table public.pessoal_folha_config
  add column if not exists he_faixa2_sabado boolean not null default true,
  add column if not exists he_faixa2_domingo boolean not null default true,
  add column if not exists he_faixa2_feriado boolean not null default true,
  add column if not exists he_negativas text not null default 'faixa1',
  add column if not exists he_tolerancia_diaria_min integer not null default 10,
  add column if not exists he_ocorrencias_abonam text[] not null
    default array['Feriado','Férias','Atestado','Folga','Compensado','Recesso','DSR','Abono','Abonado','Licença']::text[],
  add column if not exists he_mes_sem_batidas text not null default 'alertar';

alter table public.pessoal_folha_config drop constraint if exists pessoal_folha_config_he_negativas_check;
alter table public.pessoal_folha_config add constraint pessoal_folha_config_he_negativas_check
  check (he_negativas in ('faixa1', 'faixa1_depois_faixa2'));
alter table public.pessoal_folha_config drop constraint if exists pessoal_folha_config_he_tolerancia_check;
alter table public.pessoal_folha_config add constraint pessoal_folha_config_he_tolerancia_check
  check (he_tolerancia_diaria_min between 0 and 60);
alter table public.pessoal_folha_config drop constraint if exists pessoal_folha_config_he_mes_sem_batidas_check;
alter table public.pessoal_folha_config add constraint pessoal_folha_config_he_mes_sem_batidas_check
  check (he_mes_sem_batidas in ('alertar', 'lancar'));

comment on column public.pessoal_folha_config.he_faixa2_sabado is 'Apuração do ponto: horas a mais no sábado vão para a faixa 2 (senão, faixa 1).';
comment on column public.pessoal_folha_config.he_faixa2_domingo is 'Apuração do ponto: horas a mais no domingo vão para a faixa 2.';
comment on column public.pessoal_folha_config.he_faixa2_feriado is 'Apuração do ponto: horas a mais em feriado vão para a faixa 2.';
comment on column public.pessoal_folha_config.he_negativas is 'Apuração do ponto: horas negativas descontam só da faixa 1 (faixa1, pode ficar negativa) ou da faixa 1 até zerar e o resto da faixa 2 (faixa1_depois_faixa2).';
comment on column public.pessoal_folha_config.he_tolerancia_diaria_min is 'Apuração do ponto: diferença diária até estes minutos não conta, nem a mais nem a menos (CLT art. 58, § 1º: até 10).';
comment on column public.pessoal_folha_config.he_ocorrencias_abonam is 'Apuração do ponto: ocorrências do cartão que abonam o dia (sem jornada prevista nem falta).';
comment on column public.pessoal_folha_config.he_mes_sem_batidas is 'Apuração do ponto: funcionário sem nenhuma batida no mês — só alertar (alertar) ou lançar o negativo mesmo assim (lancar).';

-- ── Importação de relatório ──────────────────────────────────────────────────

create table if not exists public.pessoal_ponto_importacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  remessa_id uuid not null references public.pessoal_registro_ponto_remessas(id) on delete cascade,
  arquivo text not null,
  nome_arquivo text,
  paginas integer not null default 0,
  periodo_inicio date,
  periodo_fim date,
  criado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists pessoal_ponto_importacoes_remessa_idx
  on public.pessoal_ponto_importacoes (emp_proprietaria_id, remessa_id, created_at desc);

create table if not exists public.pessoal_ponto_importacao_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  importacao_id uuid not null references public.pessoal_ponto_importacoes(id) on delete cascade,
  paginas integer[] not null,
  nome_lido text,
  cpf_lido text,
  funcionario_id uuid references public.usuarios(id),
  arquivo text not null,
  situacao text not null default 'pendente',
  leitura jsonb,
  apuracao jsonb,
  erro text,
  lido_em timestamptz,
  registro_id uuid references public.pessoal_registro_ponto(id) on delete set null,
  aplicado_em timestamptz,
  aplicado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  constraint pessoal_ponto_importacao_itens_situacao_check
    check (situacao in ('pendente', 'lido', 'erro', 'aplicado', 'descartado'))
);

create index if not exists pessoal_ponto_importacao_itens_imp_idx
  on public.pessoal_ponto_importacao_itens (importacao_id, situacao);

do $$
declare t text;
begin
  foreach t in array array['pessoal_ponto_importacoes', 'pessoal_ponto_importacao_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$create policy tenant_isolation on public.%I to authenticated
      using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
      with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)$p$, t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

comment on table public.pessoal_ponto_importacoes is 'Relatório de ponto (PDF do relógio, um ou vários funcionários) enviado a uma remessa para apurar as horas pelas batidas (src/lib/db/ponto-importacao.ts). [lgpd:identificacao,trabalhista|titulares:funcionários]';
comment on column public.pessoal_ponto_importacoes.id is 'Identificador da importação.';
comment on column public.pessoal_ponto_importacoes.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_ponto_importacoes.remessa_id is 'Remessa de ponto que recebe a importação.';
comment on column public.pessoal_ponto_importacoes.arquivo is 'Caminho do PDF original no Storage (bucket pessoal). [lgpd:trabalhista]';
comment on column public.pessoal_ponto_importacoes.nome_arquivo is 'Nome do arquivo enviado.';
comment on column public.pessoal_ponto_importacoes.paginas is 'Número de páginas do relatório.';
comment on column public.pessoal_ponto_importacoes.periodo_inicio is 'Início do período impresso no relatório.';
comment on column public.pessoal_ponto_importacoes.periodo_fim is 'Fim do período impresso no relatório.';
comment on column public.pessoal_ponto_importacoes.criado_por is 'Quem enviou o relatório. [lgpd:identificacao]';
comment on column public.pessoal_ponto_importacoes.created_at is 'Envio do relatório.';

comment on table public.pessoal_ponto_importacao_itens is 'Um funcionário de um relatório de ponto importado: as páginas dele, a leitura da IA, a apuração pelas batidas e a situação até virar o registro da remessa. [lgpd:identificacao,trabalhista|titulares:funcionários]';
comment on column public.pessoal_ponto_importacao_itens.id is 'Identificador do item.';
comment on column public.pessoal_ponto_importacao_itens.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_ponto_importacao_itens.importacao_id is 'Importação a que pertence.';
comment on column public.pessoal_ponto_importacao_itens.paginas is 'Páginas do relatório deste funcionário.';
comment on column public.pessoal_ponto_importacao_itens.nome_lido is 'Nome lido no relatório. [lgpd:identificacao]';
comment on column public.pessoal_ponto_importacao_itens.cpf_lido is 'CPF lido no relatório. [lgpd:identificacao]';
comment on column public.pessoal_ponto_importacao_itens.funcionario_id is 'Funcionário do cadastro (achado pelo CPF ou pelo nome, ou escolhido). [lgpd:identificacao]';
comment on column public.pessoal_ponto_importacao_itens.arquivo is 'PDF só com as páginas deste funcionário (bucket pessoal). [lgpd:trabalhista]';
comment on column public.pessoal_ponto_importacao_itens.situacao is 'pendente (a ler), lido, erro, aplicado (virou registro) ou descartado.';
comment on column public.pessoal_ponto_importacao_itens.leitura is 'Leitura da IA: batidas e ocorrências de cada dia, jornada prevista por dia da semana e o total do relatório. [lgpd:trabalhista]';
comment on column public.pessoal_ponto_importacao_itens.apuracao is 'Apuração pelas batidas com as regras da entidade: saldo de cada dia, positivos por faixa, negativos e alertas. [lgpd:trabalhista]';
comment on column public.pessoal_ponto_importacao_itens.erro is 'Motivo da falha na leitura.';
comment on column public.pessoal_ponto_importacao_itens.lido_em is 'Quando a IA leu.';
comment on column public.pessoal_ponto_importacao_itens.registro_id is 'Registro de ponto criado ou atualizado ao aplicar.';
comment on column public.pessoal_ponto_importacao_itens.aplicado_em is 'Quando foi aplicado à remessa.';
comment on column public.pessoal_ponto_importacao_itens.aplicado_por is 'Quem aplicou. [lgpd:identificacao]';
comment on column public.pessoal_ponto_importacao_itens.created_at is 'Criação do item.';
