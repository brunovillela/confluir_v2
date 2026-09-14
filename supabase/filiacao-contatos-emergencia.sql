-- ============================================================================
-- Filiados: contatos de emergência (2026-09-14). Idempotente — rodar no SQL
-- Editor do Supabase.
--
-- Pedido do Bruno: nome, telefone e tipo de vínculo (cônjuge, filho(a),
-- pai/mãe, amigo(a)…). Decisões:
-- • O contato é da PESSOA, não do registro: a mesma pessoa tem vários
--   registros em `filiacoes` (um por CPF é a regra dos contatos e reembolsos).
--   A chave de leitura é o `cpf` (só dígitos); `filiado_id` guarda o registro
--   em que foi cadastrado e serve de chave para quem não tem CPF.
-- • A gestão da filiação edita na ficha; o próprio filiado, no portal
--   (Meu cadastro). `origem` diz quem cadastrou.
-- ============================================================================

create table if not exists filiacao_contatos_emergencia (id uuid primary key default gen_random_uuid());
alter table filiacao_contatos_emergencia add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_contatos_emergencia add column if not exists filiado_id uuid references filiacoes(id) on delete cascade;
alter table filiacao_contatos_emergencia add column if not exists cpf text;          -- só dígitos
alter table filiacao_contatos_emergencia add column if not exists nome text not null default '';
alter table filiacao_contatos_emergencia add column if not exists telefone text not null default ''; -- só dígitos
alter table filiacao_contatos_emergencia add column if not exists vinculo text;      -- Cônjuge ou companheiro(a), Filho(a)…
alter table filiacao_contatos_emergencia add column if not exists origem text not null default 'painel'; -- painel | portal
alter table filiacao_contatos_emergencia add column if not exists atualizado_por uuid references usuarios(id);
alter table filiacao_contatos_emergencia add column if not exists created_at timestamptz not null default now();
alter table filiacao_contatos_emergencia add column if not exists updated_at timestamptz;

create index if not exists idx_fil_contatos_emerg_cpf
  on filiacao_contatos_emergencia (emp_proprietaria_id, cpf);
create index if not exists idx_fil_contatos_emerg_filiado
  on filiacao_contatos_emergencia (filiado_id);

alter table filiacao_contatos_emergencia enable row level security;
drop policy if exists tenant_isolation on filiacao_contatos_emergencia;
create policy tenant_isolation on filiacao_contatos_emergencia for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on filiacao_contatos_emergencia to authenticated;
drop trigger if exists set_emp_from_jwt on filiacao_contatos_emergencia;
create trigger set_emp_from_jwt before insert on filiacao_contatos_emergencia
  for each row execute function public.set_emp_from_jwt();
