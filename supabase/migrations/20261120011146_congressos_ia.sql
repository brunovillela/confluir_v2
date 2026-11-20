-- Confluir — Congressos: IA na relatoria (Fase 5)
--
-- POR QUÊ: entre o fim do 2º dia e o início do 3º, a relatoria precisa unir
-- as propostas de vários grupos numa pauta só, de madrugada. A IA sugere
-- redação mais clara, propostas parecidas para fundir, eixo e abrangência,
-- o que está fora da competência do congresso, temas contraditórios entre
-- grupos, a síntese do grupo e a triagem das moções; também lê o caderno de
-- teses e o regimento. Nada muda sem aceite de uma pessoa, e cada sugestão
-- fica registrada com o aceite ou a recusa, para medir se a IA ajuda.
--
-- COMO:
--   congresso_sugestoes_ia      cada sugestão (função, alvo, conteúdo), com
--                               situação pendente/aceita/recusada/obsoleta
--                               e quem decidiu
--   congresso_grupos.sintese*   síntese do grupo revista e guardada
--   congresso_proposta_versoes.motivo ganha 'redacao_ia' (refino aceito)
-- Idempotente.

create table if not exists public.congresso_sugestoes_ia (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  lote uuid not null default gen_random_uuid(),
  funcao text not null
    check (funcao in ('refino', 'mesclagem', 'eixo', 'abrangencia', 'competencia', 'correlacao', 'sintese', 'triagem_mocao', 'caderno', 'regimento')),
  grupo_id uuid references public.congresso_grupos(id) on delete cascade,
  mocao_id uuid references public.congresso_mocoes(id) on delete cascade,
  proposta_ids uuid[] not null default '{}',
  conteudo jsonb not null default '{}'::jsonb,
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'aceita', 'ajustada', 'recusada', 'obsoleta')),
  pedida_por text,
  decidida_por text,
  decidida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists congresso_sugestoes_ia_congresso
  on public.congresso_sugestoes_ia (congresso_id, funcao, situacao);
create index if not exists congresso_sugestoes_ia_propostas
  on public.congresso_sugestoes_ia using gin (proposta_ids);

alter table public.congresso_grupos
  add column if not exists sintese text,
  add column if not exists sintese_em timestamptz,
  add column if not exists sintese_por text;

alter table public.congresso_proposta_versoes drop constraint if exists congresso_proposta_versoes_motivo_check;
alter table public.congresso_proposta_versoes add constraint congresso_proposta_versoes_motivo_check
  check (motivo in ('criada', 'grupo', 'consolidacao', 'fusao', 'plenaria', 'correcao', 'redacao_ia'));

do $$
begin
  alter table public.congresso_sugestoes_ia enable row level security;
  drop policy if exists tenant_isolation on public.congresso_sugestoes_ia;
  create policy tenant_isolation on public.congresso_sugestoes_ia to authenticated
    using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
    with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
  drop trigger if exists set_emp_from_jwt on public.congresso_sugestoes_ia;
  create trigger set_emp_from_jwt before insert on public.congresso_sugestoes_ia
    for each row execute function public.set_emp_from_jwt();
  revoke all on table public.congresso_sugestoes_ia from public, anon;
  grant all on table public.congresso_sugestoes_ia to service_role;
  grant select, insert, update on table public.congresso_sugestoes_ia to authenticated;
  drop trigger if exists auditoria_registrar on public.congresso_sugestoes_ia;
  create trigger auditoria_registrar after insert or update or delete on public.congresso_sugestoes_ia
    for each row execute function public.registrar_auditoria();
end $$;

comment on table public.congresso_sugestoes_ia is 'Sugestões da IA na relatoria do congresso (redação, fusão, eixo, abrangência, competência, correlação entre grupos, síntese, triagem de moção, leitura do caderno e do regimento), com aceite ou recusa de quem revisou. Os textos enviados à IA vão sem nomes de pessoas. [lgpd:identificacao|titulares:relatores e comissão de congressos]';
comment on column public.congresso_sugestoes_ia.conteudo is 'O que a IA sugeriu (texto, propostas envolvidas, motivo, alertas). Não guarda nomes de pessoas. [lgpd:nenhum]';
comment on column public.congresso_sugestoes_ia.pedida_por is 'Nome de quem pediu a sugestão. [lgpd:identificacao]';
comment on column public.congresso_sugestoes_ia.decidida_por is 'Nome de quem aceitou ou recusou. [lgpd:identificacao]';
comment on column public.congresso_grupos.sintese is 'Síntese do grupo (resumo e minuta do relatório), revista por uma pessoa antes de guardar. [lgpd:nenhum]';
comment on column public.congresso_grupos.sintese_em is 'Quando a síntese foi guardada. [lgpd:nenhum]';
comment on column public.congresso_grupos.sintese_por is 'Quem guardou a síntese. [lgpd:identificacao]';
