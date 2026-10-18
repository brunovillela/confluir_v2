-- Confluir — LGPD: anonimização do cadastro e retenção do acervo de saúde
-- (2026-07-21)
--
-- PREMISSA CENTRAL: não existe "titular anonimizado". Existem DOIS REGIMES
-- convivendo quando alguém pede exclusão:
--
--   (a) CADASTRO ADMINISTRATIVO — perde a base legal para seguir
--       identificado, então é anonimizado de fato (LGPD art. 5º, XI e 12).
--
--   (b) ACERVO DE SAÚDE OCUPACIONAL — permanece RETIDO e IDENTIFICADO, como
--       dado sensível, sob base própria: art. 11, II, "a" (obrigação legal)
--       e art. 16, I (conservação após o término do tratamento). O direito
--       de eliminação do art. 18, VI é expressamente ressalvado pelo art. 16.
--
-- Consequência que comanda o desenho: para (a) ser genuinamente anônimo, o
-- VÍNCULO entre os dois precisa ser CORTADO. Enquanto saude_assistidos
-- apontar para a linha de filiacoes, o cadastro continua reidentificável
-- pelo prontuário — seria pseudonimização, não anonimização. Por isso, na
-- anonimização, o registro de saúde recebe CÓPIA PRÓPRIA dos identificadores
-- (cifrada) e o filiado_id é apagado. Cada acervo passa a se sustentar
-- sozinho, sob o seu regime.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Marcas de anonimização no cadastro
-- ---------------------------------------------------------------------------
alter table public.filiacoes
  add column if not exists anonimizada_em timestamptz;
alter table public.usuarios
  add column if not exists anonimizado_em timestamptz;

comment on column public.filiacoes.anonimizada_em is
  'Quando os identificadores diretos foram destruídos. A linha permanece '
  'para preservar integridade referencial (16 tabelas apontam para cá), '
  'estatística e ocupação de matrícula.';

create index if not exists filiacoes_anonimizada_idx
  on public.filiacoes (anonimizada_em) where anonimizada_em is not null;

-- ---------------------------------------------------------------------------
-- 2) Livro de solicitações — prestação de contas (art. 37)
--
--    Registra QUE houve pedido e o que foi feito, sem guardar os dados
--    pessoais que o pedido mandou destruir. É o que permite demonstrar
--    tratamento adequado sem recriar o problema.
-- ---------------------------------------------------------------------------
create table if not exists public.lgpd_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa (id),

  -- Alvos da anonimização. Continuam apontando para linhas que existem —
  -- agora sem identificadores.
  filiacao_id uuid references public.filiacoes (id),
  usuario_id  uuid references public.usuarios (id),

  -- exclusao | anonimizacao | portabilidade | acesso | correcao
  tipo text not null,
  solicitado_em date not null,
  concluido_em  timestamptz,
  executado_por_id uuid references public.usuarios (id),

  -- O que foi destruído e o que foi retido, em texto — serve de resposta
  -- ao titular e de prova para a autoridade.
  registros_anonimizados text,
  registros_retidos      text,
  base_legal_retencao    text,

  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists lgpd_solicitacoes_filiacao_idx
  on public.lgpd_solicitacoes (filiacao_id);

comment on table public.lgpd_solicitacoes is
  'Livro de solicitações de titulares. NÃO armazenar aqui nome, CPF ou '
  'contato — o objetivo é provar o tratamento, não preservar o dado.';

-- ---------------------------------------------------------------------------
-- 3) Acervo de saúde — identidade própria e prazo de guarda
--
--    Os identificadores são cifrados pela aplicação (mesma chave e mesmo
--    mecanismo do relatório clínico: SAUDE_RELATORIO_CHAVE, AES-256-GCM).
--    Assim, depois da anonimização do cadastro, nem mesmo quem abre o banco
--    descobre QUEM tem prontuário retido — que é o que sustenta dizer que o
--    resto foi minimizado de fato.
-- ---------------------------------------------------------------------------
alter table public.saude_assistidos
  add column if not exists nome_retido_cifrado text,
  add column if not exists cpf_retido_cifrado  text,
  add column if not exists retencao_ate        date,
  add column if not exists retencao_regime     text,
  add column if not exists retencao_observacao text,
  add column if not exists exposicao_cancerigeno_quimico  boolean not null default false,
  add column if not exists exposicao_radiacao_ionizante   boolean not null default false;

comment on column public.saude_assistidos.nome_retido_cifrado is
  'Cópia do nome, cifrada, gravada na anonimização do cadastro. É a âncora '
  'de identidade do acervo retido — sem ela o prontuário deixa de ser '
  'atribuível ao trabalhador e não serve a PPP nem a nexo previdenciário.';

comment on column public.saude_assistidos.retencao_ate is
  'Até quando o registro fica retido identificado. Regras (NR-07 7.6.1.1 e '
  'Anexo V): filiado sem vínculo empregatício = data de registro + 20 anos; '
  'empregado = contrato_demissao + 20 anos; empregado exposto a cancerígeno '
  'químico ou radiação ionizante = contrato_demissao + 40 anos. A norma diz '
  '"no mínimo": isto é PISO, nunca teto.';

comment on column public.saude_assistidos.retencao_regime is
  'Regime que comanda o prazo quando ele extrapola a NR-07: benzeno '
  '(IN 2/1995 e PPEOB), radiacao_cnen (dosimetria individual), amianto '
  '(latência longa), previdenciario (LTCAT/PPP). Preenchido = descarte '
  'NUNCA automático, sempre com análise.';

comment on column public.saude_assistidos.exposicao_cancerigeno_quimico is
  'NR-07 Anexo V: dobra a guarda para 40 anos. Não é derivável do sistema — '
  'pessoal_atividades_riscos e _perigos estão vazias — então é declaração '
  'manual, alimentada pelo PGR.';

create index if not exists saude_assistidos_retencao_idx
  on public.saude_assistidos (retencao_ate) where retencao_ate is not null;

-- ---------------------------------------------------------------------------
-- 4) Fila de descarte — LISTA, nunca apaga
--
--    Vencido o prazo, a base do art. 16, I cai e manter identificado passa a
--    ser excesso. Mas o descarte é decisão humana: "no mínimo 20/40 anos" é
--    piso, e benzeno, CNEN, amianto e a camada previdenciária esticam além.
--    Uma rotina que apagasse sozinha destruiria prontuário ainda exigível.
-- ---------------------------------------------------------------------------
create or replace view public.lgpd_retencoes_vencidas as
  select
    a.id                as assistido_id,
    a.retencao_ate,
    a.retencao_regime,
    a.retencao_observacao,
    a.exposicao_cancerigeno_quimico,
    a.exposicao_radiacao_ionizante,
    (current_date - a.retencao_ate) as dias_vencidos,
    (select count(*) from public.saude_atendimentos t
      where t.assistido_id = a.id) as atendimentos
  from public.saude_assistidos a
  where a.retencao_ate is not null
    and a.retencao_ate < current_date
    and a.retencao_regime is null   -- regime especial sai da fila automática
  order by a.retencao_ate;

comment on view public.lgpd_retencoes_vencidas is
  'Candidatos a descarte, para ANÁLISE humana. Registros com '
  'retencao_regime preenchido ficam de fora: seguem norma própria, mais '
  'longa que a NR-07.';

-- ---------------------------------------------------------------------------
-- 5) Padrão do projeto: RLS deny-all
-- ---------------------------------------------------------------------------
alter table public.lgpd_solicitacoes enable row level security;
