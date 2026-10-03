-- Confluir — LGPD executável (2026-10-03, onda 1 / S16)
--
-- Complementa supabase/lgpd-anonimizacao.sql (que criou as marcas, o livro
-- de solicitações e o acervo de saúde retido). Até aqui a anonimização era
-- só um comentário; agora:
--
--   1. permissão `filiacao_lgpd` — quem pode anonimizar um cadastro;
--   2. `filiacao_tl_aceites` — histórico de consentimento com versão do
--      termo, IP, navegador e origem (o que a LGPD pede para provar o aceite);
--   3. `anonimizar_filiacao(id, emp)` — destrói os identificadores diretos do
--      cadastro administrativo (todos os registros do CPF no tenant), apaga
--      telefones, endereços, dados bancários, contatos de emergência e a
--      identidade de acesso, e corta o vínculo com o acervo de saúde (a
--      aplicação grava antes as cópias cifradas — ver lib/db/lgpd.ts).
--      Só o servidor executa (revogada para authenticated).
--
-- O que FICA, de propósito: a linha de filiacoes (integridade referencial,
-- estatística, matrícula), os vínculos e o histórico de contribuições (sem
-- identificador), o prontuário administrativo e o acervo de saúde retido
-- (LGPD art. 16, I; art. 11, II, a; NR-07).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- 1. Permissão -------------------------------------------------------------
alter table public.permissoes add column if not exists filiacao_lgpd boolean;

-- 2. Histórico de aceites ---------------------------------------------------
create table if not exists public.filiacao_tl_aceites (
  id                  uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  filiacao_id         uuid references public.filiacoes(id) on delete set null,
  cpf                 text,                        -- só dígitos; vira null na anonimização
  tipo                text not null check (tipo in ('lgpd', 'desconto')),
  termo_id            uuid,                        -- versão do termo aceita (filiacao_tl_lgpd / filiacao_tl_desconto)
  origem              text not null check (origem in ('portal', 'ficha_publica', 'secretaria')),
  ip                  text,
  user_agent          text,
  aceito_em           timestamptz not null default now()
);
create index if not exists filiacao_tl_aceites_cpf_idx
  on public.filiacao_tl_aceites (emp_proprietaria_id, cpf, aceito_em desc);

alter table public.filiacao_tl_aceites enable row level security;
drop policy if exists tenant_isolation on public.filiacao_tl_aceites;
create policy tenant_isolation on public.filiacao_tl_aceites for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.filiacao_tl_aceites to authenticated;
drop trigger if exists set_emp_from_jwt on public.filiacao_tl_aceites;
create trigger set_emp_from_jwt before insert on public.filiacao_tl_aceites
  for each row execute function public.set_emp_from_jwt();

-- 3. Anonimização ----------------------------------------------------------
create or replace function public.anonimizar_filiacao(p_filiacao_id uuid, p_emp uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cpf      text;
  v_digitos  text;
  v_ids      uuid[];
  n_fil      integer := 0;
  n_tel      integer := 0;
  n_end      integer := 0;
  n_banc     integer := 0;
  n_cont     integer := 0;
  n_ident    integer := 0;
  n_saude    integer := 0;
  n_aceites  integer := 0;
begin
  select cpf into v_cpf
    from filiacoes
   where id = p_filiacao_id and emp_proprietaria_id = p_emp;
  if not found then
    raise exception 'Filiação % não encontrada no tenant', p_filiacao_id;
  end if;
  v_digitos := nullif(regexp_replace(coalesce(v_cpf, ''), '\D', '', 'g'), '');

  -- Todos os registros da MESMA pessoa (mesmo CPF, qualquer grafia) no tenant.
  if v_digitos is null then
    v_ids := array[p_filiacao_id];
  else
    select coalesce(array_agg(id), array[p_filiacao_id]) into v_ids
      from filiacoes
     where emp_proprietaria_id = p_emp
       and regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_digitos;
  end if;

  update filiacoes set
    nome_completo = 'Titular anonimizado',   -- nome_completo_norm é gerada: recalcula sozinha
    nome_social = null,
    foto = null,
    sexo = null,
    nascimento_data = null,
    nascimento_dia = null,
    nascimento_mes = null,
    telefone_1 = null,
    telefone_1_whatsapp = null,
    telefone_2 = null,
    telefone_2_whatsapp = null,
    email_pessoal = null,
    email_corporativo = null,
    endereco_cep = null,
    endereco_logradouro = null,
    endereco_numero = null,
    endereco_complemento = null,
    endereco_bairro = null,
    endereco_cidade = null,
    endereco_estado = null,
    codigo_verificacao = null,
    slug = null,
    cpf = null,
    recebe_mensagens = false,
    comunicados_optout_em = coalesce(comunicados_optout_em, now()),
    comunicados_optout_origem = coalesce(comunicados_optout_origem, 'secretaria'),
    anonimizada_em = now()
  where id = any (v_ids);
  get diagnostics n_fil = row_count;

  delete from telefones where filiado_id = any (v_ids);
  get diagnostics n_tel = row_count;
  delete from enderecos where filiado_id = any (v_ids);
  get diagnostics n_end = row_count;
  delete from dados_bancarios where filiado_id = any (v_ids);
  get diagnostics n_banc = row_count;
  if to_regclass('public.filiacao_contatos_emergencia') is not null then
    delete from filiacao_contatos_emergencia where filiado_id = any (v_ids);
    get diagnostics n_cont = row_count;
  end if;
  if v_digitos is not null and to_regclass('public.auth_identidades') is not null then
    delete from auth_identidades where emp_proprietaria_id = p_emp and cpf = v_digitos;
    get diagnostics n_ident = row_count;
  end if;
  if to_regclass('public.filiacao_tl_aceites') is not null then
    update filiacao_tl_aceites set cpf = null, ip = null, user_agent = null
     where emp_proprietaria_id = p_emp and (filiacao_id = any (v_ids) or (v_digitos is not null and cpf = v_digitos));
    get diagnostics n_aceites = row_count;
  end if;
  -- Acervo de saúde: fica retido com identidade própria (cifrada pela
  -- aplicação antes desta chamada); o vínculo com o cadastro é cortado.
  if to_regclass('public.saude_assistidos') is not null then
    update saude_assistidos set filiado_id = null where filiado_id = any (v_ids);
    get diagnostics n_saude = row_count;
  end if;

  return jsonb_build_object(
    'ids', to_jsonb(v_ids),
    'filiacoes', n_fil,
    'telefones', n_tel,
    'enderecos', n_end,
    'dados_bancarios', n_banc,
    'contatos_emergencia', n_cont,
    'identidades_acesso', n_ident,
    'aceites', n_aceites,
    'saude_desvinculados', n_saude
  );
end;
$fn$;

revoke all on function public.anonimizar_filiacao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.anonimizar_filiacao(uuid, uuid) to service_role;

-- 4. Conferência -----------------------------------------------------------
-- select proname, prosecdef from pg_proc where proname = 'anonimizar_filiacao';
