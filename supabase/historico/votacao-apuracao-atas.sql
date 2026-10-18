-- Confluir — Apuradores, atas/eventos da urna e apuração dinâmica (2026-08-30)
--
-- Fecha o ciclo do presencial:
--  * Máquina de estados da urna por eventos com ATA: instalação (1ª abertura),
--    abertura (2ª em diante), fechamento (fim de dia, exceto o último) e
--    encerramento (último — prazo ou urna cheia). Também guarda ANOMALIAS.
--  * Ritual de abertura: a urna fica FECHADA (mesmo no horário) até a abertura do
--    dia, feita com o 1º eleitor, que atesta o rompimento do lacre da boca e sua
--    introdução na urna.
--  * APURADOR: papel próprio (nome/CPF/e-mail), ambiente /apurador; o admin
--    atribui urnas. Ele abre a urna, atesta os lacres e apura.
--  * APURAÇÃO DINÂMICA: conta por OPÇÃO cadastrada na rodada (não há resposta
--    fixa) + BRANCO (sem marcação) + NULO (mais de uma marcação / rabiscos).
--
-- Idempotente. Rode no SQL Editor do Supabase.

-- ── Apuradores ──────────────────────────────────────────────────────────────
create table if not exists voto_apuradores (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  rod_assembleia_id uuid not null references voto_rod_assembleias(id),
  nome_completo text not null,
  cpf text,
  email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_voto_apuradores_rodada
  on voto_apuradores (rod_assembleia_id);
create index if not exists idx_voto_apuradores_email
  on voto_apuradores (emp_proprietaria_id, lower(email));

-- Urna → apurador atribuído (o admin atribui uma ou mais urnas ao apurador).
alter table voto_urnas
  add column if not exists apurador_id uuid references voto_apuradores(id);

-- ── Eventos/atas da urna ────────────────────────────────────────────────────
create table if not exists voto_urna_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  urna_id uuid not null references voto_urnas(id),
  tipo text not null check (tipo in (
    'instalacao', 'abertura', 'fechamento', 'encerramento', 'anomalia'
  )),
  data timestamptz not null default now(),
  -- quem operou (mesário na votação; apurador na apuração).
  mesario_id uuid references voto_mesarios(id),
  apurador_id uuid references voto_apuradores(id),
  -- abertura do dia: 1º eleitor atesta o rompimento do lacre da boca.
  primeiro_eleitor_nome text,
  atesta_lacre_rompido boolean,
  lacre_boca_numero text,
  -- descrição livre (anomalias, observações da ata).
  descricao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_voto_urna_eventos_urna
  on voto_urna_eventos (urna_id, data);

-- ── Apuração por urna (sessão do apurador) ─────────────────────────────────
create table if not exists voto_apuracao_urna (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  urna_id uuid not null references voto_urnas(id),
  apurador_id uuid references voto_apuradores(id),
  -- integridade dos lacres recebidos com a urna, atestada pelo apurador.
  lacres_ok boolean,
  lacres_observacao text,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluida')),
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  unique (emp_proprietaria_id, urna_id)
);

-- Contagem por opção/branco/nulo dentro de uma apuração de urna.
create table if not exists voto_apuracao_contagem (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  apuracao_urna_id uuid not null references voto_apuracao_urna(id) on delete cascade,
  pergunta_id uuid not null references voto_assembleias_perguntas(id),
  opcao_id uuid references voto_opcoes_resposta(id),
  -- 'opcao' usa opcao_id; 'branco' e 'nulo' têm opcao_id nulo.
  tipo text not null default 'opcao' check (tipo in ('opcao', 'branco', 'nulo')),
  quantidade integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (apuracao_urna_id, pergunta_id, opcao_id, tipo)
);

-- ── Resultado final por assembleia (snapshot ao encerrar) ───────────────────
-- Substitui os campos fixos aprovado/reprovado/abstenção: resultado por OPÇÃO
-- + branco + nulo. É o que o filiado vê em "Minhas votações".
create table if not exists voto_resultado_final (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  assembleia_id uuid not null references voto_assembleias(id),
  pergunta_id uuid not null references voto_assembleias_perguntas(id),
  opcao_id uuid references voto_opcoes_resposta(id),
  tipo text not null default 'opcao' check (tipo in ('opcao', 'branco', 'nulo')),
  quantidade integer not null default 0,
  created_at timestamptz not null default now(),
  unique (assembleia_id, pergunta_id, opcao_id, tipo)
);
create index if not exists idx_voto_resultado_final_assembleia
  on voto_resultado_final (assembleia_id);

-- ── RLS (isolamento por tenant; claim CORRETA `tenant_id`, ver admin.ts) ─────
do $$
declare
  t text;
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
begin
  foreach t in array array[
    'voto_apuradores', 'voto_urna_eventos', 'voto_apuracao_urna',
    'voto_apuracao_contagem', 'voto_resultado_final'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format(
      'create policy %I on %I for all using (emp_proprietaria_id = %s) with check (emp_proprietaria_id = %s)',
      t || '_tenant', t, claim, claim
    );
  end loop;
end $$;
