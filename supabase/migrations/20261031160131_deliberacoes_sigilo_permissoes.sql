-- Deliberações: até que grau de sigilo cada usuário pode consultar.
--
-- POR QUÊ: as deliberações têm sigilo livre, reservado ou restrito
-- (20261031153653_reuniao_deliberacoes). Cada usuário passa a ter um nível —
-- nenhum, livre, reservado ou restrito — e só vê as deliberações até ele
-- (31/10/2026).
--
-- COMO: três chaves CUMULATIVAS em `permissoes`, para valer também nos
-- perfis de acesso (que compõem chaves liga/desliga): vale a mais alta
-- marcada; nenhuma = nível "nenhum".
--   deliberacoes_livre      → só as livres
--   deliberacoes_reservado  → livres e reservadas
--   deliberacoes_restrito   → todas
-- Quem já registrava atas (diretoria_reunioes) via todas as deliberações:
-- recebe "restrito", no usuário e nos perfis — ninguém perde o que já via.
-- Idempotente.

alter table public.permissoes
  add column if not exists deliberacoes_livre boolean default false,
  add column if not exists deliberacoes_reservado boolean default false,
  add column if not exists deliberacoes_restrito boolean default false;

comment on column public.permissoes.deliberacoes_livre is 'Deliberações das atas: consulta as de sigilo livre. Cumulativa com reservado/restrito — vale a mais alta. [lgpd:nenhum]';
comment on column public.permissoes.deliberacoes_reservado is 'Deliberações das atas: consulta as livres e as reservadas. [lgpd:nenhum]';
comment on column public.permissoes.deliberacoes_restrito is 'Deliberações das atas: consulta todas (livres, reservadas e restritas). [lgpd:nenhum]';

update public.permissoes
set deliberacoes_restrito = true
where diretoria_reunioes = true and coalesce(deliberacoes_restrito, false) = false;

insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select distinct pp.perfil_id, pp.emp_proprietaria_id, 'deliberacoes_restrito'
from public.perfil_permissoes pp
where pp.chave = 'diretoria_reunioes'
  and not exists (
    select 1 from public.perfil_permissoes x
    where x.perfil_id = pp.perfil_id and x.chave = 'deliberacoes_restrito'
  );
