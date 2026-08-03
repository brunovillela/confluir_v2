-- Confluir — Saúde/Atendimentos: sigilo do relatório clínico (2026-07-20)
--
-- Decisões do Bruno registradas em 20/07/2026:
--   • Lê o relatório quem é profissional do MESMO TIPO do atendimento,
--     mais o autor, sempre.
--   • Coordenação clínica ainda não existe, mas o sistema deve prever.
--   • O relatório fica em tabela SEPARADA.
--   • A pessoa ATENDIDA lê apenas a observação aberta, pela área do
--     filiado. O relatório fica sob guarda profissional.
--   • O BANCO NÃO PODE SER UM LOCAL ONDE O DADO É ACESSADO.
--
-- Consequência do último item: o relatório é gravado CIFRADO pela aplicação
-- (AES-256-GCM), com a chave em variável de ambiente — nunca no banco, nem
-- no Vault, nem em pgcrypto. Quem abrir esta tabela pelo dashboard, por um
-- backup ou com a service role key vê apenas base64 sem sentido.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Corrige a FK que faltava (as irmãs já tinham)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'saude_atendimentos_assistido_id_fkey'
      and table_name = 'saude_atendimentos'
  ) then
    alter table public.saude_atendimentos
      add constraint saude_atendimentos_assistido_id_fkey
      foreign key (assistido_id) references public.saude_assistidos (id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Relatório clínico — tabela separada e cifrada
--
--    Separada de propósito: com o texto na tabela principal, um único
--    `select('*')` distraído vazaria todos os relatórios. Aqui, vazar exige
--    intenção — o código precisa nomear esta tabela.
-- ---------------------------------------------------------------------------
create table if not exists public.saude_atendimentos_relatorio (
  atendimento_id uuid primary key
    references public.saude_atendimentos (id) on delete cascade,

  -- base64 de iv(12) || authTag(16) || ciphertext, AES-256-GCM.
  -- O id do atendimento entra como dado autenticado adicional (AAD), então
  -- mover um relatório de um atendimento para outro quebra a decifragem.
  relatorio_cifrado text not null,

  -- Versão da chave usada. Permite rotação sem reescrever tudo de uma vez.
  chave_versao smallint not null default 1,

  autor_profissional_id uuid references public.saude_profissionais (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.saude_atendimentos_relatorio is
  'Relatório clínico do atendimento, CIFRADO pela aplicação (AES-256-GCM). '
  'A chave vive em SAUDE_RELATORIO_CHAVE, fora do banco: ler esta tabela '
  'diretamente não revela conteúdo. Acesso restrito ao autor, a profissional '
  'do mesmo tipo do atendimento e à coordenação clínica — NÃO à gestão nem à '
  'pessoa atendida, que vê apenas saude_atendimentos.observacao_aberta. Toda '
  'leitura é registrada em saude_atendimentos_acessos.';

comment on column public.saude_atendimentos_relatorio.relatorio_cifrado is
  'base64(iv || authTag || ciphertext) — AES-256-GCM com AAD = atendimento_id.';

-- Se a coluna antiga existir e estiver vazia, sai de cena: manter dois
-- lugares para a mesma informação é como o sigilo se perde.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'saude_atendimentos'
      and column_name = 'relatorio_atendimento'
  ) then
    if exists (
      select 1 from public.saude_atendimentos
      where relatorio_atendimento is not null
        and btrim(relatorio_atendimento) <> ''
    ) then
      raise exception
        'ABORTADO: saude_atendimentos.relatorio_atendimento tem conteúdo. '
        'Migre para saude_atendimentos_relatorio (cifrando) antes de remover.';
    end if;
    alter table public.saude_atendimentos drop column relatorio_atendimento;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Registro de acesso — append-only
--
--    Regra de acesso afrouxa com o tempo; o log é o que torna o abuso
--    detectável depois. Mesmo espírito do histórico imutável de infrações.
-- ---------------------------------------------------------------------------
create table if not exists public.saude_atendimentos_acessos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null
    references public.saude_atendimentos (id) on delete cascade,
  usuario_id uuid references public.usuarios (id),
  -- leitura | gravacao | negado
  acao text not null,
  -- autor | profissional_mesmo_tipo | coordenacao
  motivo text,
  criado_em timestamptz not null default now()
);

comment on table public.saude_atendimentos_acessos is
  'Trilha de auditoria dos relatórios clínicos. SOMENTE INSERT — nunca '
  'atualizar nem apagar. Inclui tentativas negadas.';

create index if not exists saude_atendimentos_acessos_atendimento_idx
  on public.saude_atendimentos_acessos (atendimento_id, criado_em desc);
create index if not exists saude_atendimentos_acessos_usuario_idx
  on public.saude_atendimentos_acessos (usuario_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- 4) Coordenação clínica — previsto, ainda sem ninguém
--
--    Fica no cadastro de PROFISSIONAL, não nas permissões do painel: quem
--    atravessa tipos precisa ser clínico habilitado, não administrador.
-- ---------------------------------------------------------------------------
alter table public.saude_profissionais
  add column if not exists acesso_todos_tipos boolean not null default false;

alter table public.saude_profissionais
  add column if not exists inativo boolean not null default false;

comment on column public.saude_profissionais.acesso_todos_tipos is
  'Coordenação clínica: lê relatórios de todos os tipos. Conceder apenas a '
  'profissional habilitado — NUNCA derivar de saude_gestao, que é permissão '
  'administrativa.';

-- ---------------------------------------------------------------------------
-- 5) Índices de consulta
-- ---------------------------------------------------------------------------
create index if not exists saude_atendimentos_assistido_idx
  on public.saude_atendimentos (assistido_id, data_atendimento desc);
create index if not exists saude_atendimentos_data_idx
  on public.saude_atendimentos (data_atendimento desc);
create index if not exists saude_atendimentos_tipo_idx
  on public.saude_atendimentos (tipo_id);
create index if not exists saude_profissionais_usuario_idx
  on public.saude_profissionais (usuario_id) where usuario_id is not null;
create index if not exists saude_assistidos_filiado_idx
  on public.saude_assistidos (filiado_id) where filiado_id is not null;
create index if not exists saude_acompanhamento_assistido_idx
  on public.saude_acompanhamento (assistido_id);
create index if not exists saude_agenda_assistido_idx
  on public.saude_agenda_atendimentos (assistido_id, inicio desc);

-- ---------------------------------------------------------------------------
-- 6) Padrão do projeto: RLS deny-all (acesso só pelo servidor, service role)
-- ---------------------------------------------------------------------------
alter table public.saude_atendimentos            enable row level security;
alter table public.saude_atendimentos_relatorio  enable row level security;
alter table public.saude_atendimentos_acessos    enable row level security;
alter table public.saude_atendimentos_tipos      enable row level security;
alter table public.saude_assistidos              enable row level security;
alter table public.saude_profissionais           enable row level security;
alter table public.saude_acompanhamento          enable row level security;
alter table public.saude_agenda_atendimentos     enable row level security;
alter table public.saude_cipa_agenda             enable row level security;
