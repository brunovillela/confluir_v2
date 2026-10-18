-- Confluir — Hospedagem: convênio de DEMANDA GARANTIDA (2026-09-13)
--
-- Dois tipos de convênio:
--   • PAGAMENTO POR USO (modalidade 'uso') — como sempre foi: o cupom é uma
--     autorização e o hotel monta a reserva juntando cupons.
--   • DEMANDA GARANTIDA (modalidade 'garantida') — o hotel dedica quartos ao
--     sindicato. O pedido do filiado JÁ É a reserva: o Confluir escolhe o
--     quarto na hora e o hotel é obrigado a hospedar quem tem reserva.
--
-- Regras da garantida (configuradas por hotel):
--   • quartos dedicados por dia da semana e vagas por quarto;
--   • quartos homogêneos por sexo, mesmo quarto a estadia toda;
--   • regra de distribuição: 'lotacao' (completa um quarto antes de abrir
--     outro) ou 'distribuicao' (uma pessoa por quarto enquanto houver quarto
--     vazio);
--   • trava do último quarto: se todos os outros quartos da noite estão com
--     pessoas do MESMO sexo, o último quarto vazio fica guardado para o outro
--     sexo até X dias antes da noite, na hora H;
--   • limite de noites, prazo de cancelamento e prazo para confirmar uma vaga
--     oferecida pela lista de espera.
--
-- Entrada no hotel por QR Code (token da reserva) com documento com foto, e
-- regra de punição por não comparecimento (em hospedagem_condicoes).
--
-- Código: src/lib/hospedagem-garantida-constantes.ts (regras puras) e
-- src/lib/db/hospedagem-garantida.ts.
--
-- Executar UMA VEZ no SQL Editor do Supabase, DEPOIS de
-- supabase/hospedagem-condicoes.sql.

-- ── 1. Modalidade e parâmetros por hotel ────────────────────────────────────

alter table hospedagem_hotel add column if not exists modalidade text not null default 'uso';
-- 7 posições, domingo = 1ª. Nulo (ou posição nula) = quant_quartos_dedicados.
alter table hospedagem_hotel add column if not exists quartos_por_dia_semana integer[];
alter table hospedagem_hotel add column if not exists regra_distribuicao text not null default 'lotacao';
alter table hospedagem_hotel add column if not exists trava_ultimo_quarto boolean not null default true;
alter table hospedagem_hotel add column if not exists trava_dias_antes integer not null default 3;
alter table hospedagem_hotel add column if not exists trava_hora time not null default '12:00';
alter table hospedagem_hotel add column if not exists max_noites integer not null default 7;
alter table hospedagem_hotel add column if not exists horario_checkin time not null default '14:00';
alter table hospedagem_hotel add column if not exists cancelamento_horas integer not null default 24;
alter table hospedagem_hotel add column if not exists espera_prazo_horas integer not null default 12;
-- Controle de concorrência da alocação: toda gravação confere e incrementa.
alter table hospedagem_hotel add column if not exists alocacao_versao bigint not null default 0;
-- Última vez que a lista de espera foi processada (evita repetir a cada tela).
alter table hospedagem_hotel add column if not exists fila_processada_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_hospedagem_hotel_garantida') then
    alter table hospedagem_hotel add constraint ck_hospedagem_hotel_garantida check (
      modalidade in ('uso', 'garantida')
      and regra_distribuicao in ('lotacao', 'distribuicao')
      and trava_dias_antes between 0 and 60
      and max_noites between 1 and 60
      and cancelamento_horas between 0 and 720
      and espera_prazo_horas between 1 and 168
    ) not valid;
  end if;
end $$;

-- ── 2. Reserva (cupom de demanda garantida) ─────────────────────────────────

alter table hospedagem_cupom add column if not exists reserva_garantida boolean not null default false;
alter table hospedagem_cupom add column if not exists check_out date;
alter table hospedagem_cupom add column if not exists quarto integer;
-- Token do QR Code e dos links por e-mail.
alter table hospedagem_cupom add column if not exists token uuid default gen_random_uuid();
update hospedagem_cupom set token = gen_random_uuid() where token is null;
create unique index if not exists ux_hospedagem_cupom_token on hospedagem_cupom (token);
-- Vaga oferecida pela lista de espera: fica guardada até esta hora; sem
-- confirmação, a reserva cai e a vaga vai para o próximo.
alter table hospedagem_cupom add column if not exists confirmar_ate timestamptz;
alter table hospedagem_cupom add column if not exists cancelado_em timestamptz;
-- Entrada no hotel (QR Code ou busca na recepção, com documento com foto).
alter table hospedagem_cupom add column if not exists presenca_em timestamptz;
alter table hospedagem_cupom add column if not exists presenca_por uuid;
alter table hospedagem_cupom add column if not exists presenca_metodo text;
-- Abono de não comparecimento (a equipe justifica e a falta deixa de contar).
alter table hospedagem_cupom add column if not exists nao_comparecimento_abonado_em timestamptz;
alter table hospedagem_cupom add column if not exists nao_comparecimento_abono_motivo text;
alter table hospedagem_cupom add column if not exists nao_comparecimento_abonado_por uuid;

create index if not exists idx_hospedagem_cupom_garantida
  on hospedagem_cupom (hotel_id, check_in)
  where reserva_garantida = true;

-- ── 3. Alocação noite a noite ───────────────────────────────────────────────
-- Uma linha por hóspede por noite. Capacidade, sexo e trava são decididos pela
-- aplicação e gravados por hospedagem_gravar_alocacao, que serializa as
-- gravações do hotel pela versão.

create table if not exists hospedagem_alocacoes (id uuid primary key default gen_random_uuid());
alter table hospedagem_alocacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table hospedagem_alocacoes add column if not exists hotel_id uuid references hospedagem_hotel(id) on delete cascade;
alter table hospedagem_alocacoes add column if not exists cupom_id uuid;
alter table hospedagem_alocacoes add column if not exists noite date;
alter table hospedagem_alocacoes add column if not exists quarto integer;
alter table hospedagem_alocacoes add column if not exists sexo text;
alter table hospedagem_alocacoes add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_hospedagem_alocacoes_cupom_noite
  on hospedagem_alocacoes (cupom_id, noite);
create index if not exists idx_hospedagem_alocacoes_hotel_noite
  on hospedagem_alocacoes (hotel_id, noite);

-- ── 4. Número do quarto no hotel (anotado pela recepção) ────────────────────

create table if not exists hospedagem_quartos_noite (id uuid primary key default gen_random_uuid());
alter table hospedagem_quartos_noite add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table hospedagem_quartos_noite add column if not exists hotel_id uuid references hospedagem_hotel(id) on delete cascade;
alter table hospedagem_quartos_noite add column if not exists noite date;
alter table hospedagem_quartos_noite add column if not exists quarto integer;
alter table hospedagem_quartos_noite add column if not exists quarto_hotel text;
alter table hospedagem_quartos_noite add column if not exists anotado_por uuid;
alter table hospedagem_quartos_noite add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ux_hospedagem_quartos_noite
  on hospedagem_quartos_noite (hotel_id, noite, quarto);

-- ── 5. Lista de espera ──────────────────────────────────────────────────────
-- aguardando → oferecida (vaga guardada, e-mail com botão) → confirmada
--                                       ↘ expirada (sem confirmação no prazo)
-- cancelada: pela pessoa, ou por não atender mais às condições.

create table if not exists hospedagem_espera (id uuid primary key default gen_random_uuid());
alter table hospedagem_espera add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table hospedagem_espera add column if not exists hotel_id uuid references hospedagem_hotel(id) on delete cascade;
alter table hospedagem_espera add column if not exists filiado_id uuid references filiacoes(id);
alter table hospedagem_espera add column if not exists cpf text;
alter table hospedagem_espera add column if not exists sexo text;
alter table hospedagem_espera add column if not exists check_in date;
alter table hospedagem_espera add column if not exists check_out date;
alter table hospedagem_espera add column if not exists situacao text not null default 'aguardando';
alter table hospedagem_espera add column if not exists motivo text;
alter table hospedagem_espera add column if not exists cupom_id uuid;
alter table hospedagem_espera add column if not exists token uuid default gen_random_uuid();
alter table hospedagem_espera add column if not exists oferecida_em timestamptz;
alter table hospedagem_espera add column if not exists oferta_expira_em timestamptz;
alter table hospedagem_espera add column if not exists created_at timestamptz not null default now();
alter table hospedagem_espera add column if not exists updated_at timestamptz;

create unique index if not exists ux_hospedagem_espera_token on hospedagem_espera (token);
create index if not exists idx_hospedagem_espera_fila
  on hospedagem_espera (hotel_id, situacao, created_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_hospedagem_espera_situacao') then
    alter table hospedagem_espera add constraint ck_hospedagem_espera_situacao
      check (situacao in ('aguardando', 'oferecida', 'confirmada', 'expirada', 'cancelada')) not valid;
  end if;
end $$;

-- ── 6. Não comparecimento: regra e liberações ───────────────────────────────
-- Regra por entidade, junto das demais condições da hospedagem. Ao atingir
-- `quantidade` faltas em `janela_meses`, aplica a penalidade:
--   consumir_periodo — não pode reservar com check-in no mesmo mês/ano da falta;
--   suspender        — fica sem reservar por `suspensao_dias` desde a falta;
--   desabilitar      — perde o direito até a equipe liberar.

alter table hospedagem_condicoes add column if not exists punir_nao_comparecimento boolean not null default false;
alter table hospedagem_condicoes add column if not exists nao_comparecimento_quantidade integer not null default 1;
alter table hospedagem_condicoes add column if not exists nao_comparecimento_janela_meses integer not null default 12;
alter table hospedagem_condicoes add column if not exists nao_comparecimento_penalidade text not null default 'suspender';
alter table hospedagem_condicoes add column if not exists nao_comparecimento_periodo text not null default 'mes';
alter table hospedagem_condicoes add column if not exists nao_comparecimento_suspensao_dias integer not null default 30;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_hospedagem_condicoes_nc') then
    alter table hospedagem_condicoes add constraint ck_hospedagem_condicoes_nc check (
      nao_comparecimento_quantidade between 1 and 50
      and nao_comparecimento_janela_meses between 1 and 60
      and nao_comparecimento_penalidade in ('consumir_periodo', 'suspender', 'desabilitar')
      and nao_comparecimento_periodo in ('mes', 'ano')
      and nao_comparecimento_suspensao_dias between 1 and 730
    ) not valid;
  end if;
end $$;

-- Liberação pela equipe: faltas ANTERIORES a ela deixam de contar (vale para
-- suspensão e desabilitação). Por CPF: o direito é da pessoa.
create table if not exists hospedagem_penalidade_liberacoes (id uuid primary key default gen_random_uuid());
alter table hospedagem_penalidade_liberacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table hospedagem_penalidade_liberacoes add column if not exists cpf text;
alter table hospedagem_penalidade_liberacoes add column if not exists motivo text;
alter table hospedagem_penalidade_liberacoes add column if not exists liberado_por uuid references usuarios(id);
alter table hospedagem_penalidade_liberacoes add column if not exists created_at timestamptz not null default now();

create index if not exists idx_hospedagem_liberacoes_cpf
  on hospedagem_penalidade_liberacoes (emp_proprietaria_id, cpf);

-- ── 7. Gravação da alocação com controle de versão ──────────────────────────
-- A aplicação lê a ocupação e a versão do hotel, decide o quarto e chama esta
-- função. Se outra reserva gravou no meio do caminho, a versão mudou e a
-- função devolve 'conflito': a aplicação relê e decide de novo. Assim duas
-- pessoas nunca pegam a mesma vaga, nem furam a trava do último quarto.

create or replace function public.hospedagem_gravar_alocacao(
  p_emp uuid,
  p_hotel uuid,
  p_versao bigint,
  p_cupom uuid,
  p_quarto integer,
  p_sexo text,
  p_noites date[]
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_versao bigint;
begin
  select alocacao_versao into v_versao
  from hospedagem_hotel
  where id = p_hotel and emp_proprietaria_id = p_emp
  for update;
  if not found then
    return 'hotel_inexistente';
  end if;
  if v_versao <> p_versao then
    return 'conflito';
  end if;

  -- Remanejamento reaproveita a função: a estadia sai do quarto antigo.
  delete from hospedagem_alocacoes where cupom_id = p_cupom;
  insert into hospedagem_alocacoes (emp_proprietaria_id, hotel_id, cupom_id, noite, quarto, sexo)
  select p_emp, p_hotel, p_cupom, n, p_quarto, p_sexo
  from unnest(p_noites) as n;

  update hospedagem_cupom set quarto = p_quarto where id = p_cupom;
  update hospedagem_hotel set alocacao_versao = alocacao_versao + 1 where id = p_hotel;
  return 'ok';
end;
$$;

revoke all on function public.hospedagem_gravar_alocacao(uuid, uuid, bigint, uuid, integer, text, date[])
  from public, anon, authenticated;
grant execute on function public.hospedagem_gravar_alocacao(uuid, uuid, bigint, uuid, integer, text, date[])
  to service_role;

-- ── RLS e triggers, no padrão do projeto ────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'hospedagem_alocacoes',
    'hospedagem_quartos_noite',
    'hospedagem_espera',
    'hospedagem_penalidade_liberacoes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all to authenticated '
      'using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid) '
      'with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format(
      'create trigger set_emp_from_jwt before insert on %I '
      'for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;
