-- Confluir — Representação Sindical › Reuniões com o empregador e setoriais (2026-09-29)
--
-- Na página de cada empregador:
-- • REUNIÃO (tipo 'empregador'): sindicato × empresa — negociação, mesa
--   permanente, comissão, audiência.
-- • SETORIAL (tipo 'setorial'): sindicato × trabalhadores daquela empresa,
--   numa unidade/local de trabalho.
-- Mesma tabela, com data, horário, modalidade, local, pauta, resumo (que a IA
-- pode ler da ata), encaminhamentos, arquivo da ata e participantes (do
-- sindicato, da empresa, trabalhadores). A ata vai para o bucket privado
-- `representacao` em reunioes/<id>/…
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

create table if not exists representacao_reunioes (id uuid primary key default gen_random_uuid());
alter table representacao_reunioes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table representacao_reunioes add column if not exists empresa_id uuid references empresa(id) on delete cascade;
alter table representacao_reunioes add column if not exists tipo text not null default 'empregador';     -- empregador | setorial
alter table representacao_reunioes add column if not exists situacao text not null default 'realizada';  -- agendada | realizada | cancelada
alter table representacao_reunioes add column if not exists titulo text;
alter table representacao_reunioes add column if not exists data date;
alter table representacao_reunioes add column if not exists hora_inicio text;   -- "14:00"
alter table representacao_reunioes add column if not exists hora_fim text;
alter table representacao_reunioes add column if not exists modalidade text not null default 'presencial'; -- presencial | online | hibrida
alter table representacao_reunioes add column if not exists local text;
alter table representacao_reunioes add column if not exists link_online text;
alter table representacao_reunioes add column if not exists unidade text;       -- setorial: plataforma, base, turno…
alter table representacao_reunioes add column if not exists presentes_total integer; -- setorial: quantos trabalhadores
alter table representacao_reunioes add column if not exists pauta text;
alter table representacao_reunioes add column if not exists resumo text;
alter table representacao_reunioes add column if not exists encaminhamentos text;
alter table representacao_reunioes add column if not exists ata_caminho text;
alter table representacao_reunioes add column if not exists ata_nome text;
alter table representacao_reunioes add column if not exists resumo_por_ia boolean not null default false;
alter table representacao_reunioes add column if not exists criado_por_id uuid references usuarios(id);
alter table representacao_reunioes add column if not exists created_at timestamptz not null default now();
alter table representacao_reunioes add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_representacao_reunioes_empresa on representacao_reunioes (empresa_id, tipo, data desc);

create table if not exists representacao_reuniao_participantes (id uuid primary key default gen_random_uuid());
alter table representacao_reuniao_participantes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table representacao_reuniao_participantes add column if not exists reuniao_id uuid references representacao_reunioes(id) on delete cascade;
alter table representacao_reuniao_participantes add column if not exists lado text not null default 'sindicato'; -- sindicato | empresa | trabalhador
alter table representacao_reuniao_participantes add column if not exists usuario_id uuid references usuarios(id) on delete set null;
alter table representacao_reuniao_participantes add column if not exists nome text;
alter table representacao_reuniao_participantes add column if not exists cargo text;
alter table representacao_reuniao_participantes add column if not exists ordem integer not null default 0;
create index if not exists idx_representacao_reuniao_participantes on representacao_reuniao_participantes (reuniao_id, lado, ordem);

do $$
declare t text;
begin
  foreach t in array array['representacao_reunioes', 'representacao_reuniao_participantes'] loop
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
