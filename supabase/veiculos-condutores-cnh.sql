-- Confluir — Veículos › Histórico de CNH e unificação de condutores (2026-09-29)
--
-- 1. veiculos_condutores_cnh: as CNHs ANTERIORES de cada condutor. A atual
--    continua em veiculos_condutores; ao renovar (número, categoria ou validade
--    mudam), a anterior vem para cá — o app grava isso ao salvar.
-- 2. unificar_condutores(): a mesma pessoa com DOIS usuários (e-mail
--    institucional e pessoal, herança do Bubble), cada um com cadastro de
--    condutor e lançamentos. Fica um cadastro só, com a CNH de validade mais
--    recente; a outra vai para o histórico; movimentações, reservas,
--    abastecimentos, infrações e checklists do usuário secundário passam para o
--    principal. Numa transação só, e tudo o que mudou fica em
--    veiculos_condutores_unificacoes (para conferir ou desfazer).
--    O usuário secundário NÃO é apagado (pode ter login ou outros vínculos).
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

create table if not exists veiculos_condutores_cnh (id uuid primary key default gen_random_uuid());
alter table veiculos_condutores_cnh add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_condutores_cnh add column if not exists condutor_id uuid references veiculos_condutores(id) on delete cascade;
alter table veiculos_condutores_cnh add column if not exists cnh_numero text;
alter table veiculos_condutores_cnh add column if not exists cnh_categoria text;
alter table veiculos_condutores_cnh add column if not exists cnh_validade date;
alter table veiculos_condutores_cnh add column if not exists cnh_arquivo_url text;
alter table veiculos_condutores_cnh add column if not exists origem text not null default 'renovacao';
  -- renovacao (substituída ao salvar) | unificacao (veio do cadastro repetido)
alter table veiculos_condutores_cnh add column if not exists usuario_origem_id uuid references usuarios(id);
alter table veiculos_condutores_cnh add column if not exists registrado_por_id uuid references usuarios(id);
alter table veiculos_condutores_cnh add column if not exists created_at timestamptz not null default now();
create index if not exists idx_veiculos_condutores_cnh on veiculos_condutores_cnh (condutor_id, created_at desc);

create table if not exists veiculos_condutores_unificacoes (id uuid primary key default gen_random_uuid());
alter table veiculos_condutores_unificacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_condutores_unificacoes add column if not exists principal_usuario_id uuid references usuarios(id);
alter table veiculos_condutores_unificacoes add column if not exists secundario_usuario_id uuid references usuarios(id);
alter table veiculos_condutores_unificacoes add column if not exists cadastro_removido jsonb;   -- linha do condutor secundário
alter table veiculos_condutores_unificacoes add column if not exists cadastro_principal_antes jsonb;
alter table veiculos_condutores_unificacoes add column if not exists movidos jsonb;            -- { tabela: [ids] }
alter table veiculos_condutores_unificacoes add column if not exists feito_por_id uuid references usuarios(id);
alter table veiculos_condutores_unificacoes add column if not exists created_at timestamptz not null default now();

do $$
declare t text;
begin
  foreach t in array array['veiculos_condutores_cnh', 'veiculos_condutores_unificacoes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I for all to authenticated
      using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
      with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format('create trigger set_emp_from_jwt before insert on %I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

-- ── Unificação ───────────────────────────────────────────────────────────────
-- Chamada pelo app com o service role (o tenant vem explícito e é conferido).
create or replace function public.unificar_condutores(
  p_emp uuid,
  p_principal uuid,
  p_secundario uuid,
  p_autor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cp veiculos_condutores%rowtype;
  cs veiculos_condutores%rowtype;
  v_movidos jsonb := '{}'::jsonb;
  v_ids uuid[];
  v_sec_mais_nova boolean;
  v_log uuid;
begin
  if p_principal = p_secundario then
    raise exception 'Escolha dois usuários diferentes.';
  end if;
  if (select count(*) from usuarios where id in (p_principal, p_secundario) and emp_proprietaria_id = p_emp) <> 2 then
    raise exception 'Usuários não encontrados neste tenant.';
  end if;

  select * into cp from veiculos_condutores where usuario_id = p_principal and emp_proprietaria_id = p_emp;
  select * into cs from veiculos_condutores where usuario_id = p_secundario and emp_proprietaria_id = p_emp;

  -- 1. Cadastro de condutor + histórico de CNH
  if cs.id is not null and cp.id is null then
    -- Só o secundário tinha cadastro: ele passa a ser do principal.
    update veiculos_condutores set usuario_id = p_principal, updated_at = now() where id = cs.id;
  elsif cs.id is not null then
    v_sec_mais_nova := coalesce(cs.cnh_validade, '-infinity'::date) > coalesce(cp.cnh_validade, '-infinity'::date);
    if v_sec_mais_nova then
      -- A CNH atual passa a ser a do secundário; a do principal vai para o histórico.
      if cp.cnh_numero is not null or cp.cnh_validade is not null then
        insert into veiculos_condutores_cnh (emp_proprietaria_id, condutor_id, cnh_numero, cnh_categoria, cnh_validade, cnh_arquivo_url, origem, usuario_origem_id, registrado_por_id)
        values (p_emp, cp.id, cp.cnh_numero, cp.cnh_categoria, cp.cnh_validade, cp.cnh_arquivo_url, 'unificacao', p_principal, p_autor);
      end if;
      update veiculos_condutores set
        cnh_numero = cs.cnh_numero,
        cnh_categoria = cs.cnh_categoria,
        cnh_validade = cs.cnh_validade,
        cnh_arquivo_url = coalesce(cs.cnh_arquivo_url, cp.cnh_arquivo_url)
      where id = cp.id;
    elsif cs.cnh_numero is not null or cs.cnh_validade is not null then
      insert into veiculos_condutores_cnh (emp_proprietaria_id, condutor_id, cnh_numero, cnh_categoria, cnh_validade, cnh_arquivo_url, origem, usuario_origem_id, registrado_por_id)
      values (p_emp, cp.id, cs.cnh_numero, cs.cnh_categoria, cs.cnh_validade, cs.cnh_arquivo_url, 'unificacao', p_secundario, p_autor);
    end if;
    -- Histórico que já existia no secundário acompanha o cadastro que fica.
    update veiculos_condutores_cnh set condutor_id = cp.id where condutor_id = cs.id;
    -- Autorização: vale a de quem estava autorizado.
    update veiculos_condutores set
      autorizado = cp.autorizado or cs.autorizado,
      autorizado_por_id = case when cp.autorizado then cp.autorizado_por_id else cs.autorizado_por_id end,
      autorizado_em = case when cp.autorizado then cp.autorizado_em else cs.autorizado_em end,
      observacao = nullif(concat_ws(E'\n', cp.observacao, cs.observacao), ''),
      updated_at = now()
    where id = cp.id;
    delete from veiculos_condutores where id = cs.id;
  end if;

  -- 2. Lançamentos do secundário passam para o principal
  with m as (update veiculos_disponibilidade set condutor_id = p_principal
             where condutor_id = p_secundario and emp_proprietaria_id = p_emp returning id)
  select array_agg(id) into v_ids from m;
  v_movidos := v_movidos || jsonb_build_object('veiculos_disponibilidade', coalesce(to_jsonb(v_ids), '[]'::jsonb));

  -- Reserva feita pela própria pessoa: o "solicitado por" acompanha.
  with m as (update veiculos_agendamentos set
               condutor_id = p_principal,
               solicitado_por_id = case when solicitado_por_id = p_secundario then p_principal else solicitado_por_id end
             where condutor_id = p_secundario and emp_proprietaria_id = p_emp returning id)
  select array_agg(id) into v_ids from m;
  v_movidos := v_movidos || jsonb_build_object('veiculos_agendamentos', coalesce(to_jsonb(v_ids), '[]'::jsonb));

  with m as (update veiculos_abastecimentos set usuario_id = p_principal
             where usuario_id = p_secundario and emp_proprietaria_id = p_emp returning id)
  select array_agg(id) into v_ids from m;
  v_movidos := v_movidos || jsonb_build_object('veiculos_abastecimentos', coalesce(to_jsonb(v_ids), '[]'::jsonb));

  -- Infrações não têm coluna de tenant: o usuário já foi conferido acima.
  with m as (update veiculos_infracoes set condutor_infrator_id = p_principal
             where condutor_infrator_id = p_secundario returning id)
  select array_agg(id) into v_ids from m;
  v_movidos := v_movidos || jsonb_build_object('veiculos_infracoes', coalesce(to_jsonb(v_ids), '[]'::jsonb));

  with m as (update veiculos_checklists set inspetor_id = p_principal
             where inspetor_id = p_secundario and emp_proprietaria_id = p_emp returning id)
  select array_agg(id) into v_ids from m;
  v_movidos := v_movidos || jsonb_build_object('veiculos_checklists', coalesce(to_jsonb(v_ids), '[]'::jsonb));

  -- Flag legada (o Bubble lê) acompanha a autorização final.
  update usuarios set cnh_autorizado = coalesce((select autorizado from veiculos_condutores where usuario_id = p_principal), cnh_autorizado)
  where id = p_principal;

  insert into veiculos_condutores_unificacoes (emp_proprietaria_id, principal_usuario_id, secundario_usuario_id, cadastro_removido, cadastro_principal_antes, movidos, feito_por_id)
  values (p_emp, p_principal, p_secundario,
          case when cs.id is null then null else to_jsonb(cs) end,
          case when cp.id is null then null else to_jsonb(cp) end,
          v_movidos, p_autor)
  returning id into v_log;

  return jsonb_build_object('log_id', v_log, 'movidos', (
    select jsonb_object_agg(k, jsonb_array_length(v)) from jsonb_each(v_movidos) as e(k, v)
  ));
end $$;

-- Só o servidor (service role) chama: o app confere a permissão de gestão antes.
revoke all on function public.unificar_condutores(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unificar_condutores(uuid, uuid, uuid, uuid) to service_role;
