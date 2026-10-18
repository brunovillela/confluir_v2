-- ============================================================================
-- Compras: quem registra AQUISIÇÃO DIRETA e por quais DEPARTAMENTOS cada
-- pessoa compra e vê compras (2026-09-14). Idempotente — rodar no SQL Editor.
--
-- Pedido do Bruno: restringir quem pode fazer nova compra por aquisição direta
-- e por qual departamento cada um pode comprar e visualizar compras.
-- • Permissão nova `aquisicoes_compra_direta`: registrar aquisição direta
--   (a compra já feita pelo departamento, que gera ordem de pagamento).
--   "Compras — editar" continua abrindo solicitações Via Compras. Para não
--   tirar nada de quem já usa, quem tem "editar" (ou o perfil com ela)
--   recebe a nova chave agora — dá para retirar depois, pessoa a pessoa.
-- • compras_departamentos_acesso: os departamentos de cada pessoa em Compras.
--   SEM linha = todos os departamentos (como hoje). Com linhas, a pessoa só
--   escolhe esses departamentos na nova compra e só vê as compras deles —
--   mais as que ela mesma registrou.
-- • compras_solicitacoes.solicitante_id: quem registrou (o legado não tem).
-- A tabela herdada `permissoes_compras_depto` (Bubble, ligada a uma linha de
-- permissões sem usuário) não é usada.
-- ============================================================================

alter table permissoes add column if not exists aquisicoes_compra_direta boolean;

update permissoes
set aquisicoes_compra_direta = true
where aquisicoes_compras_edicao = true
  and aquisicoes_compra_direta is null;

insert into perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select perfil_id, emp_proprietaria_id, 'aquisicoes_compra_direta'
from perfil_permissoes
where chave = 'aquisicoes_compras_edicao'
on conflict (perfil_id, chave) do nothing;

alter table compras_solicitacoes add column if not exists solicitante_id uuid references usuarios(id);
comment on column compras_solicitacoes.solicitante_id is
  'Quem registrou a compra (solicitação ou aquisição direta). Vê a compra mesmo fora dos seus departamentos.';

create table if not exists compras_departamentos_acesso (id uuid primary key default gen_random_uuid());
alter table compras_departamentos_acesso add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table compras_departamentos_acesso add column if not exists usuario_id uuid references usuarios(id) on delete cascade;
alter table compras_departamentos_acesso add column if not exists departamento_id uuid references empresa_departamentos(id) on delete cascade;
alter table compras_departamentos_acesso add column if not exists definido_por uuid references usuarios(id);
alter table compras_departamentos_acesso add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_compras_deptos_acesso
  on compras_departamentos_acesso (usuario_id, departamento_id);
create index if not exists idx_compras_deptos_acesso_emp
  on compras_departamentos_acesso (emp_proprietaria_id, usuario_id);

alter table compras_departamentos_acesso enable row level security;
drop policy if exists tenant_isolation on compras_departamentos_acesso;
create policy tenant_isolation on compras_departamentos_acesso for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on compras_departamentos_acesso to authenticated;
drop trigger if exists set_emp_from_jwt on compras_departamentos_acesso;
create trigger set_emp_from_jwt before insert on compras_departamentos_acesso
  for each row execute function public.set_emp_from_jwt();
