-- Confluir — Perfis de acesso (RBAC) — 2026-08-24
--
-- Camada de PERFIS por cima das permissões que já existem. Hoje o acesso é uma
-- ACL plana: uma coluna boolean por funcionalidade na tabela `permissoes`,
-- marcada POR usuário. Isso não escala para ~80 pessoas. Aqui entram perfis
-- (pacotes nomeados de permissões) que se atribuem a usuários.
--
-- CHAVE DO DESENHO: `Permissoes` (o objeto que sidebar, proxy, requirePermissao
-- e podeAcessar consomem) é só um mapa chave→booleano. Os perfis viram uma
-- CAMADA DE COMPOSIÇÃO: a permissão efetiva = união das chaves dos perfis do
-- usuário ∪ overrides individuais (a tabela `permissoes`, mantida como está).
-- Nenhum consumidor muda; só muda COMO o mapa é montado — numa função única
-- `resolverPermissoes()` (lib/db/perfis.ts), consumida por getSessaoPainel e
-- proxy.ts.
--
-- INERTE ATÉ O CÓDIGO: este script só cria as tabelas e semeia os perfis de
-- fábrica. Enquanto `resolverPermissoes()` não existir, nada muda no
-- comportamento — e como a resolução é por UNIÃO, quem já tem flags (hoje só o
-- Bruno) continua funcionando mesmo sem perfil atribuído. Migração flags→perfis
-- é gradual, não big-bang.
--
-- IMPORTANTE: após rodar este script, RE-RODAR supabase/rls-emp-todas.sql — as
-- 3 tabelas novas têm emp_proprietaria_id e precisam de tenant_isolation +
-- grant + trigger set_emp_from_jwt (backstop data-driven, sem deny-all).
--
-- Overrides são GRANT-ONLY no v1 (concedem além dos perfis; não "negam" o que o
-- perfil dá — para negar, troca-se o perfil). O "Conselho Fiscal (leitura)"
-- nasce SEM chaves: leitura pura depende da limpeza ver×editar do catálogo
-- (algumas áreas têm flag única = agir). Fica registrado como pendência.

-- 1) Tabelas -----------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  nome text not null,
  descricao text,
  -- Teto de alçada padrão do perfil (espelha permissoes.alcada_aprovacao). A
  -- alçada efetiva do usuário = override se houver, senão o MAIOR entre os
  -- perfis. NULL = sem teto (perfis de comando).
  alcada_aprovacao numeric,
  -- Administrador: concede TODAS as chaves do catálogo (resolvido no código a
  -- partir de CHAVES_PERMISSAO), sem precisar listar cada uma aqui.
  concede_tudo boolean not null default false,
  -- Perfil "de fábrica": editável pelo tenant, mas protegido de exclusão
  -- acidental na UI.
  sistema boolean not null default false,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_perfis_emp on public.perfis (emp_proprietaria_id);
create unique index if not exists uq_perfis_emp_nome
  on public.perfis (emp_proprietaria_id, nome);

create table if not exists public.perfil_permissoes (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  emp_proprietaria_id uuid references public.empresa(id),
  chave text not null,               -- uma chave de CHAVES_PERMISSAO
  created_at timestamptz not null default now(),
  unique (perfil_id, chave)
);
create index if not exists idx_perfil_permissoes_perfil
  on public.perfil_permissoes (perfil_id);
create index if not exists idx_perfil_permissoes_emp
  on public.perfil_permissoes (emp_proprietaria_id);

create table if not exists public.usuario_perfis (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  unique (usuario_id, perfil_id)
);
create index if not exists idx_usuario_perfis_usuario
  on public.usuario_perfis (usuario_id);
create index if not exists idx_usuario_perfis_emp
  on public.usuario_perfis (emp_proprietaria_id);

-- 2) Seed dos perfis de fábrica (um conjunto por tenant, idempotente) --------
insert into public.perfis
  (emp_proprietaria_id, nome, descricao, alcada_aprovacao, concede_tudo, sistema, ordem)
select t.empresa_id, p.nome, p.descricao, p.alcada, p.tudo, true, p.ordem
from public.tenants t
cross join (values
  ('Administrador do sistema',        'Acesso total, incluindo usuários e organização',                  null, true,  1),
  ('Diretoria / Coordenação',         'Visão ampla e autorizações (alçadas); não opera no dia a dia',    null, false, 2),
  ('Financeiro / Tesouraria',         'Ordens, caixa, centros de custo e lançamento de custeio',         0,    false, 3),
  ('Compras e Contratos',             'Solicitações, cotações, contratos, fornecedores e recebimentos',  0,    false, 4),
  ('Patrimônio e Frota',              'Bens patrimoniais e veículos',                                    0,    false, 5),
  ('Departamento Pessoal',            'Funcionários, contracheques, ponto, férias e afins',              0,    false, 6),
  ('Filiação e Secretaria',           'Filiados, receitas, convênios, hospedagens e empregadores',       0,    false, 7),
  ('Jurídico',                        'Processos, homologações e gestão jurídica',                       0,    false, 8),
  ('Saúde e SST',                     'CATs, CIPA e gestão de saúde (sem área clínica)',                 0,    false, 9),
  ('Profissional de saúde',           'Atendimentos clínicos (sigiloso) — perfil restrito',              0,    false, 10),
  ('Comunicação',                     'Notícias e resumos',                                              0,    false, 11),
  ('Apoio administrativo',            'Ferramentas transversais: agenda, documentos, ofícios, tarefas',  0,    false, 12),
  ('Conselho Fiscal (leitura)',       'Fiscalização — leitura (pendente da limpeza ver×editar)',         0,    false, 13)
) as p(nome, descricao, alcada, tudo, ordem)
where not exists (
  select 1 from public.perfis x
  where x.emp_proprietaria_id = t.empresa_id and x.nome = p.nome
);

-- 3) Seed das chaves de cada perfil (idempotente) ----------------------------
-- Administrador não entra aqui: concede_tudo = true resolve todas as chaves no
-- código. Conselho Fiscal não entra: nasce sem chaves de propósito.
insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select pf.id, pf.emp_proprietaria_id, m.chave
from public.perfis pf
join (values
  -- Diretoria / Coordenação (autoriza; segregação: detém as alçadas)
  ('Diretoria / Coordenação', 'aquisicoes_avaliacoes'),
  ('Diretoria / Coordenação', 'financeiro_pagamento'),
  ('Diretoria / Coordenação', 'custeio_institucional'),
  ('Diretoria / Coordenação', 'custeio_institucional_autorizacao'),
  ('Diretoria / Coordenação', 'diretoria_mandatos'),
  ('Diretoria / Coordenação', 'diretoria_reunioes'),
  ('Diretoria / Coordenação', 'diretoria_passagens'),
  ('Diretoria / Coordenação', 'assembleias'),
  ('Diretoria / Coordenação', 'oposicao'),
  ('Diretoria / Coordenação', 'acordos_coletivos'),
  ('Diretoria / Coordenação', 'empregadores'),
  ('Diretoria / Coordenação', 'apoio_institucional'),
  ('Diretoria / Coordenação', 'apoio_institucional_edicao'),
  ('Diretoria / Coordenação', 'registro_mte'),

  -- Financeiro / Tesouraria (lança; a alçada é limitada pelo valor = 0)
  ('Financeiro / Tesouraria', 'financeiro_caixa'),
  ('Financeiro / Tesouraria', 'financeiro_caixa_admin'),
  ('Financeiro / Tesouraria', 'financeiro_pagamento'),
  ('Financeiro / Tesouraria', 'financeiro_centro_custo'),
  ('Financeiro / Tesouraria', 'financeiro_receitas_sindicais'),
  ('Financeiro / Tesouraria', 'financeiro_tributos'),
  ('Financeiro / Tesouraria', 'financeiro_apoio'),
  ('Financeiro / Tesouraria', 'custeio_institucional'),
  ('Financeiro / Tesouraria', 'custeio_institucional_edicao'),

  -- Compras e Contratos (sem alçada de avaliação)
  ('Compras e Contratos', 'aquisicoes_compras'),
  ('Compras e Contratos', 'aquisicoes_compras_edicao'),
  ('Compras e Contratos', 'aquisicoes_contratos'),
  ('Compras e Contratos', 'aquisicoes_contratos_edicao'),
  ('Compras e Contratos', 'aquisicoes_fornecedores'),
  ('Compras e Contratos', 'aquisicoes_recebimentos'),

  -- Patrimônio e Frota
  ('Patrimônio e Frota', 'patrimonio_geral'),
  ('Patrimônio e Frota', 'veiculos'),
  ('Patrimônio e Frota', 'veiculos_gestao'),
  ('Patrimônio e Frota', 'veiculos_condutores'),
  ('Patrimônio e Frota', 'veiculos_contratos'),
  ('Patrimônio e Frota', 'veiculos_infracoes'),

  -- Departamento Pessoal
  ('Departamento Pessoal', 'pessoal_gestao'),
  ('Departamento Pessoal', 'pessoal_contracheque'),
  ('Departamento Pessoal', 'pessoal_anuenios'),
  ('Departamento Pessoal', 'pessoal_niveis_salariais'),
  ('Departamento Pessoal', 'pessoal_diarias'),
  ('Departamento Pessoal', 'pessoal_aso'),
  ('Departamento Pessoal', 'pessoal_faltas_justificadas'),
  ('Departamento Pessoal', 'pessoal_registro_ponto'),
  ('Departamento Pessoal', 'pessoal_informes_rendimentos'),

  -- Filiação e Secretaria
  ('Filiação e Secretaria', 'filiacao_filiados'),
  ('Filiação e Secretaria', 'filiacao_gestao'),
  ('Filiação e Secretaria', 'filiacao_receitas'),
  ('Filiação e Secretaria', 'filiacao_reembolsos'),
  ('Filiação e Secretaria', 'filiacao_empresas'),
  ('Filiação e Secretaria', 'filiacao_convenios'),
  ('Filiação e Secretaria', 'filiacao_consulta_convenios'),
  ('Filiação e Secretaria', 'filiacao_hospedagens'),
  ('Filiação e Secretaria', 'filiacao_hospedagens_edicao'),
  ('Filiação e Secretaria', 'filiacao_hospedagens_gestao'),
  ('Filiação e Secretaria', 'empregadores'),

  -- Jurídico
  ('Jurídico', 'juridico_geral'),
  ('Jurídico', 'juridico_gestao'),
  ('Jurídico', 'juridico_homologacoes'),

  -- Saúde e SST (sem área clínica)
  ('Saúde e SST', 'saude_cat'),
  ('Saúde e SST', 'saude_gestao'),

  -- Profissional de saúde (clínico, sigiloso)
  ('Profissional de saúde', 'saude_atendimento'),

  -- Comunicação
  ('Comunicação', 'noticias'),

  -- Apoio administrativo (transversal — empilhável nos demais)
  ('Apoio administrativo', 'ferramentas_projetos'),
  ('Apoio administrativo', 'ferramentas_projetos_edicao'),
  ('Apoio administrativo', 'ferramentas_demandas'),
  ('Apoio administrativo', 'ferramentas_tarefas'),
  ('Apoio administrativo', 'ferramentas_anomalias'),
  ('Apoio administrativo', 'ferramentas_documentos'),
  ('Apoio administrativo', 'ferramentas_agendas'),
  ('Apoio administrativo', 'ferramentas_oficios'),
  ('Apoio administrativo', 'ferramentas_linhas_telefone'),
  ('Apoio administrativo', 'ferramentas_ci'),
  ('Apoio administrativo', 'ferramentas_busca_pessoas'),
  ('Apoio administrativo', 'filiacao_consulta_convenios')
) as m(perfil_nome, chave) on m.perfil_nome = pf.nome
where pf.sistema = true
  and not exists (
    select 1 from public.perfil_permissoes pp
    where pp.perfil_id = pf.id and pp.chave = m.chave
  );

-- ===========================================================================
-- Conferência:
--   select p.nome, count(pp.*) as chaves, p.concede_tudo, p.alcada_aprovacao
--     from perfis p left join perfil_permissoes pp on pp.perfil_id = p.id
--     group by p.id order by p.ordem;
-- Próximo passo (código): lib/db/perfis.ts com resolverPermissoes() + trocar
-- getSessaoPainel e proxy.ts; tela de seleção de perfis + overrides recolhidos.
-- ===========================================================================
