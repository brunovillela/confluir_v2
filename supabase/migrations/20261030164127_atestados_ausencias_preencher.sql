-- Confluir — Ausência dos atestados antigos (30/10/2026)
--
-- POR QUÊ: desde db890e29 todo atestado médico salvo gera (e mantém) a sua
-- ausência "Afastamento médico", ligada por pessoal_ausencias.atestado_id
-- (lib/db/pessoal-saude.ts). Os atestados registrados antes disso não têm a
-- ausência — ou têm uma lançada à mão, sem o vínculo. O usuário autorizou
-- preencher os antigos.
--
-- COMO: o mesmo que o código faz ao salvar, de uma vez, só DADOS (sem schema).
--   1. Adota: atestado sem ausência ligada + "Afastamento médico" avulso do
--      mesmo funcionário que cruza o período (sem atestado, férias ou falta)
--      → a ausência ganha o vínculo e as datas do atestado; a observação de
--      quem lançou fica. Cada ausência é adotada por um atestado só.
--   2. Cria: atestado ainda sem ausência → nova "Afastamento médico", no
--      tenant do funcionário. Término ausente vem dos dias (o início conta).
--      Atestado sem funcionário ou sem início fica de fora.
-- Idempotente: atestado que já tem ausência ligada não entra de novo.

-- 1. Adotar os afastamentos lançados à mão.
with sem as (
  select a.id, a.funcionario_id, a.inicio,
         coalesce(a.termino, a.inicio + (a.quantidade_dias - 1)) as termino
  from public.pes_atestados_medicos a
  where a.funcionario_id is not null
    and a.inicio is not null
    and (a.termino is not null or a.quantidade_dias > 0)
    and not exists (select 1 from public.pessoal_ausencias x where x.atestado_id = a.id)
),
par as (
  select distinct on (s.id) s.id as atestado, x.id as ausencia, s.inicio, s.termino
  from sem s
  join public.pessoal_ausencias x
    on x.funcionario_id = s.funcionario_id
   and x.motivo = 'Afastamento médico'
   and x.atestado_id is null and x.ferias_id is null and x.falta_id is null
   and x.inicio <= s.termino and x.termino >= s.inicio
  order by s.id, x.inicio, x.id
),
unico as (
  select distinct on (ausencia) * from par order by ausencia, inicio, atestado
)
update public.pessoal_ausencias x
   set atestado_id = u.atestado,
       inicio = u.inicio,
       termino = u.termino,
       observacao = coalesce(nullif(trim(x.observacao), ''), 'Atestado médico'),
       updated_at = now()
  from unico u
 where x.id = u.ausencia;

-- 2. Criar a ausência dos que ainda não têm.
insert into public.pessoal_ausencias
  (emp_proprietaria_id, funcionario_id, inicio, termino, motivo, observacao, atestado_id)
select u.emp_proprietaria_id,
       a.funcionario_id,
       a.inicio,
       coalesce(a.termino, a.inicio + (a.quantidade_dias - 1)),
       'Afastamento médico',
       case when a.atestado_acompanhamento
            then 'Atestado de acompanhamento' || coalesce(' (' || nullif(trim(a.nome_acompanhado), '') || ')', '')
            else 'Atestado médico' end,
       a.id
from public.pes_atestados_medicos a
join public.usuarios u on u.id = a.funcionario_id
where a.inicio is not null
  and (a.termino is not null or a.quantidade_dias > 0)
  and u.emp_proprietaria_id is not null
  and not exists (select 1 from public.pessoal_ausencias x where x.atestado_id = a.id);
