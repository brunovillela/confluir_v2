-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Comunicação) — 2026-08-04
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/noticias).
-- Rotas: hub /painel/comunicacao (estático, sem dado) ·
--        notícias /painel/comunicacao/noticias · resumo IA /painel/comunicacao/resumo
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente
-- (limpa por emp — todas estas tabelas são exclusivas do módulo).
-- emp EXPLÍCITO em TODAS (noticias, comunicacao_resumo_config, _fontes, _resumos).
-- `noticias.id` NÃO é setado (tabela Bubble sem DDL — deixa o default gerar).
-- CHECKs: config.frequencia in (diaria|dias_uteis|semanal|horas), tamanho in
-- (1000,2000,3000); resumos.origem in (manual|agendador). fontes_url é text[].
-- Permissão `noticias` já vem true no operador (seed do Pessoal).
-- ===========================================================================

-- 0) Garante a empresa/tenant demo.
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)', 'Confluir Demo', '00.000.000/0001-91', null)
on conflict (id) do nothing;
insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial')
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) LIMPEZA (por emp — tabelas exclusivas do módulo).
-- ---------------------------------------------------------------------------
delete from comunicacao_resumos       where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from comunicacao_fontes        where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from comunicacao_resumo_config where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from noticias                  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- 2) Notícias publicadas (id gerado pelo default; sem imagem = ícone).
-- ---------------------------------------------------------------------------
insert into noticias (emp_proprietaria_id, manchete, noticia, created_at) values
  ('11111111-1111-4111-8111-111111111111',
   'Assembleia geral aprova a pauta de reivindicações de 2026',
   'Em assembleia realizada nesta semana, a categoria aprovou por ampla maioria a pauta de reivindicações que orientará a negociação do Acordo Coletivo de Trabalho de 2026.',
   now() - interval '2 days'),
  ('11111111-1111-4111-8111-111111111111',
   'Novo convênio médico amplia a rede credenciada',
   'A diretoria firmou um novo convênio que amplia a rede credenciada de atendimento aos filiados e dependentes, com novas clínicas e laboratórios.',
   now() - interval '10 days'),
  ('11111111-1111-4111-8111-111111111111',
   'Curso de qualificação profissional com inscrições abertas',
   'Estão abertas as inscrições para o curso de qualificação profissional, gratuito para filiados. As vagas são limitadas.',
   now() - interval '20 days');

-- ---------------------------------------------------------------------------
-- 3) Resumo por IA: configuração + fontes + histórico.
-- ---------------------------------------------------------------------------
insert into comunicacao_resumo_config (
  emp_proprietaria_id, ativo, frequencia, hora, tamanho, prompt
) values (
  '11111111-1111-4111-8111-111111111111', true, 'diaria', time '07:00', 2000,
  'Resuma as principais notícias do setor petroleiro e do movimento sindical, destacando o que impacta a base de filiados: acordos coletivos, segurança do trabalho, decisões judiciais e políticas públicas relevantes. Seja objetivo e cite as fontes.');

insert into comunicacao_fontes (emp_proprietaria_id, url, nome, ativo) values
  ('11111111-1111-4111-8111-111111111111','https://www.gov.br/trabalho-e-emprego/pt-br','Ministério do Trabalho e Emprego', true),
  ('11111111-1111-4111-8111-111111111111','https://www.tst.jus.br/noticias','TST — Notícias', true),
  ('11111111-1111-4111-8111-111111111111','https://agenciabrasil.ebc.com.br/economia','Agência Brasil — Economia', true),
  ('11111111-1111-4111-8111-111111111111','https://www.exemplo-sindical.org.br/noticias','Portal Sindical (exemplo)', true);

insert into comunicacao_resumos (
  emp_proprietaria_id, titulo, resumo, tamanho, origem, fontes_url, created_at
) values
  ('11111111-1111-4111-8111-111111111111',
   'Resumo diário — 03/08/2026',
   'Destaques do dia: o TST fixou tese sobre horas de deslocamento; o MTE publicou atualização de norma regulamentadora de segurança; e as negociações do ACT avançaram em três empresas da base, com previsão de nova rodada na próxima semana.',
   2000, 'agendador',
   ARRAY['https://www.tst.jus.br/noticias','https://www.gov.br/trabalho-e-emprego/pt-br'], now() - interval '1 days'),
  ('11111111-1111-4111-8111-111111111111',
   'Resumo diário — 02/08/2026',
   'Principais notícias: discussão sobre o reajuste do salário mínimo; balanço de segurança em refinarias; e repercussão de decisão sobre contribuição assistencial.',
   2000, 'manual',
   ARRAY['https://agenciabrasil.ebc.com.br/economia'], now() - interval '2 days');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from noticias where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 3
-- ===========================================================================
