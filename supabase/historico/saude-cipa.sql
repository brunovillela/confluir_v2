-- Confluir — Saúde/CIPA: reuniões nas empresas (2026-07-21)
--
-- MODELO (confirmado com o Bruno em 21/07/2026): a CIPA é DA EMPRESA, não do
-- sindicato. O sindicato é CONVIDADO e se faz representar. O que se quer
-- medir é a relação: com que frequência somos chamados, quem foi, o que se
-- tratou.
--
-- Por isso o registro é o CONVITE, não a presença: convite recusado e
-- convite sem comparecimento ENTRAM no sistema. Se só o que foi atendido
-- fosse registrado, "quantas vezes fomos convidados e não fomos" não teria
-- resposta — o denominador se perderia.
--
-- A tabela `saude_cipa_agenda` já existia (vazia) e cobre empresa, unidade,
-- data, ordinária/extraordinária, online, ata e demanda de embarque. Este
-- script acrescenta o convite, os assuntos e os representantes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Convite, desfecho, pauta e local
-- ---------------------------------------------------------------------------
alter table public.saude_cipa_agenda
  add column if not exists convite_recebido_em date,
  add column if not exists situacao text not null default 'convidado',
  add column if not exists motivo_ausencia text,
  add column if not exists assuntos text,
  add column if not exists observacoes text,
  add column if not exists unidade text;

comment on column public.saude_cipa_agenda.unidade is
  'Unidade/plataforma onde ocorreu a reunião, em texto. A FK `unidade_id` '
  'aponta para voto_unidades_presenciais, cujas 31 linhas migradas estão '
  'TODAS VAZIAS (inclusive o nome) — não há de onde escolher. Além disso '
  'aquela tabela é escopada por rodada de assembleia, então serviria mal '
  'como registro geral de unidades. Texto agora; se a estatística por '
  'unidade passar a importar, criar tabela própria e migrar este campo.';

-- A ata é PDF, não link: guarda-se o CAMINHO no bucket privado e a URL
-- assinada é gerada na hora da exibição (padrão do projeto). O nome antigo
-- dizia "url" e mentia sobre o conteúdo; a tabela está vazia, então a
-- renomeação sai de graça.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'saude_cipa_agenda' and column_name = 'ata_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'saude_cipa_agenda' and column_name = 'ata_arquivo'
  ) then
    alter table public.saude_cipa_agenda rename column ata_url to ata_arquivo;
  end if;
end $$;

comment on column public.saude_cipa_agenda.ata_arquivo is
  'Caminho do PDF da ata no bucket privado `saude`. Nunca URL pública — a '
  'exibição gera signed URL de 1h.';

comment on column public.saude_cipa_agenda.situacao is
  'convidado | compareceu | nao_compareceu | recusado. O registro é o '
  'CONVITE: recusa e ausência ficam gravadas, senão a frequência de '
  'convites por empresa não tem denominador.';

comment on column public.saude_cipa_agenda.convite_recebido_em is
  'Quando o convite chegou. Nulo = reunião registrada sem convite formal.';

comment on column public.saude_cipa_agenda.motivo_ausencia is
  'Por que não houve representação. Preenchido em nao_compareceu/recusado.';

comment on column public.saude_cipa_agenda.assuntos is
  'Assuntos tratados na reunião. Texto livre — não é conteúdo clínico e não '
  'tem o sigilo do relatório de atendimento.';

-- ---------------------------------------------------------------------------
-- 2) Representantes do sindicato — quem foi à reunião
--
--    Vários podem representar na mesma reunião, então é tabela própria.
--    O legado guardava `representantes_sind_raw` (jsonb de bubble_ids), que
--    veio vazio e não serve de vínculo.
--
--    O representante é diretor, e diretor é filiado — mas pode também ser
--    usuário do sistema. Como o cadastro de DIRETORIA ainda não existe
--    (diretoria_mandatos só guarda os mandatos, sem membros), os dois
--    vínculos ficam opcionais e `nome` cobre quem não está em nenhum dos
--    dois. Quando o cadastro de diretoria existir, entra `diretor_id` aqui
--    sem quebrar o que já foi gravado.
-- ---------------------------------------------------------------------------
create table if not exists public.saude_cipa_representantes (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null
    references public.saude_cipa_agenda (id) on delete cascade,

  usuario_id uuid references public.usuarios (id),
  filiado_id uuid references public.filiacoes (id),
  /** Nome digitado, para quem não está em usuarios nem em filiacoes. */
  nome text,

  -- Designado é uma coisa, presente é outra: pode-se indicar dois e só um
  -- ir. Sem este campo, "nosso representante compareceu?" ficaria sem
  -- resposta por pessoa — só o agregado da reunião.
  compareceu boolean not null default false,

  emp_proprietaria_id uuid not null references public.empresa (id),
  created_at timestamptz not null default now(),

  -- Alguma forma de identificar o representante é obrigatória.
  constraint saude_cipa_representante_identificado
    check (usuario_id is not null or filiado_id is not null or nome is not null)
);

comment on table public.saude_cipa_representantes is
  'Quem representou o sindicato na reunião de CIPA. Vínculo por usuário ou '
  'filiado; `nome` cobre quem não está em nenhum dos dois.';

create index if not exists saude_cipa_representantes_reuniao_idx
  on public.saude_cipa_representantes (reuniao_id);
create index if not exists saude_cipa_representantes_usuario_idx
  on public.saude_cipa_representantes (usuario_id) where usuario_id is not null;
create index if not exists saude_cipa_representantes_filiado_idx
  on public.saude_cipa_representantes (filiado_id) where filiado_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Índices de consulta da agenda
-- ---------------------------------------------------------------------------
create index if not exists saude_cipa_agenda_data_idx
  on public.saude_cipa_agenda (data_reuniao desc);
create index if not exists saude_cipa_agenda_empresa_idx
  on public.saude_cipa_agenda (empresa_id, data_reuniao desc);
create index if not exists saude_cipa_agenda_situacao_idx
  on public.saude_cipa_agenda (situacao);

-- ---------------------------------------------------------------------------
-- 4) Padrão do projeto: RLS deny-all
-- ---------------------------------------------------------------------------
alter table public.saude_cipa_representantes enable row level security;
