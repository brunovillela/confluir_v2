-- Confluir — Agenda: compromisso AVULSO (2026-10-01)
--
-- Até aqui a Agenda só era lida: quem gravava nela eram Eventos
-- (agenda.evento_id) e Votações (agenda.assembleia_id), além dos 654
-- compromissos migrados do Bubble. Agora quem tem "Agenda — editar" cria,
-- edita e exclui compromissos avulsos direto na Agenda. Os que pertencem a
-- Eventos/Votações continuam editados na área de origem.
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase.

-- 1) Permissão de edição ------------------------------------------------------
alter table public.permissoes
  add column if not exists ferramentas_agendas_edicao boolean default false;

-- Quem já via a Agenda passa a poder editá-la (era a única chave da área).
update public.permissoes
  set ferramentas_agendas_edicao = true
  where ferramentas_agendas = true
    and ferramentas_agendas_edicao is distinct from true;

-- Perfil "Apoio administrativo" (perfis-acesso.sql) ganha a chave nova.
insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select pf.id, pf.emp_proprietaria_id, 'ferramentas_agendas_edicao'
from public.perfis pf
where pf.sistema = true
  and pf.nome = 'Apoio administrativo'
  and not exists (
    select 1 from public.perfil_permissoes pp
    where pp.perfil_id = pf.id and pp.chave = 'ferramentas_agendas_edicao'
  );

-- 2) Autoria do compromisso -----------------------------------------------------
alter table public.agenda
  add column if not exists criado_por uuid references public.usuarios (id);
alter table public.agenda
  add column if not exists updated_at timestamptz;

notify pgrst, 'reload schema';
