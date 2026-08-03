-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Filiados) — 2026-08-02
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/filiados),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). Reaproveita a
-- empresa/tenant e o operador (demo@confluir.local, com todas as permissões)
-- criados por demo-seed-pessoal.sql — rode aquele antes, ou pelo menos garanta
-- que a empresa demo existe (este script a cria se faltar, sem apagar nada).
--
-- MESMAS REGRAS do seed do Pessoal: sem begin/commit e sem tabela temporária
-- (o SQL Editor do Supabase comita por statement); cada INSERT é autossuficiente;
-- idempotente (apaga os dados demo do módulo e reinsere). E — LIÇÃO IMPORTANTE —
-- TODA tabela tenant-owned recebe `emp_proprietaria_id = demo` EXPLÍCITO, senão
-- o RLS/trigger a marca com o tenant real e as linhas somem da demo.
--
-- NÃO inserir `nome_completo_norm` (coluna gerada em filiacoes e em
-- filiacao_solicitacoes).
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   fonte pagadora .... f0f0f0f0-0000-4000-8000-000000000001
--   termos ............ a1a1a1a1-… (LGPD)  a2a2a2a2-… (desconto)
--   filiados .......... 77777777-7777-4777-8777-0000000000NN
--   solicitações ...... 88888888-8888-4888-8888-0000000000NN
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0) Garante a empresa/tenant demo (não apaga se já existir — pode ter dados
--    do seed do Pessoal).
-- ---------------------------------------------------------------------------
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)', 'Confluir Demo', '00.000.000/0001-91', null)
on conflict (id) do nothing;

insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial')
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) LIMPEZA dos dados de FILIADOS da demo (filhos antes dos pais).
-- ---------------------------------------------------------------------------
delete from filiacao_solicitacao_eventos
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from filiacao_solicitacoes
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from filiacao_vinculos
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from filiacoes
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from filiacao_tl_lgpd
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from filiacao_tl_desconto
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa
  where id = 'f0f0f0f0-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 2) Fonte pagadora fictícia (empregador dos filiados) + termos legais
-- ---------------------------------------------------------------------------
-- (a coluna `empresa` é boolean, não o nome — o nome vem de nome_fantasia)
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('f0f0f0f0-0000-4000-8000-000000000001',
  'Petro Fictícia Sociedade Anônima', 'Petro Fictícia',
  '11.222.333/0001-44', '11111111-1111-4111-8111-111111111111');

insert into filiacao_tl_lgpd (id, texto, codigo, em_vigor, emp_proprietaria_id)
values ('a1a1a1a1-0000-4000-8000-000000000001',
  'Termo de tratamento de dados (LGPD) — versão de demonstração.', 'LGPD-2026', true,
  '11111111-1111-4111-8111-111111111111');

insert into filiacao_tl_desconto (id, texto, codigo, em_vigor, emp_proprietaria_id)
values ('a2a2a2a2-0000-4000-8000-000000000001',
  'Autorização de desconto em folha — versão de demonstração.', 'DESC-2026', true,
  '11111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- 3) Filiados fictícios. filiacao_excluida = false → aparecem na lista padrão;
--    filiacao_condicao varia para mostrar as situações. Colunas comuns
--    (consentimentos, endereço base) preenchidas no SELECT.
-- ---------------------------------------------------------------------------
insert into filiacoes (
  id, emp_proprietaria_id, nome_completo, cpf, matricula_sindical,
  filiacao_condicao, filiacao_excluida, filiacao_lotacao, sexo,
  nascimento_data, nascimento_dia, nascimento_mes,
  email_pessoal, telefone_1, telefone_1_whatsapp,
  endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro,
  endereco_cidade, endereco_estado,
  tl_lgpd_id, tl_desconto_id, tl_lgpd_data, tl_desconto_data, created_at
)
select
  p.id, '11111111-1111-4111-8111-111111111111', p.nome, p.cpf, p.matricula,
  p.condicao, false, p.lotacao, p.sexo::sexo_enum,
  p.nasc, extract(day from p.nasc)::int, extract(month from p.nasc)::int,
  p.email, p.tel, true,
  '24000-000', 'Av. das Amendoeiras', p.numero, 'Centro',
  p.cidade, 'RJ',
  'a1a1a1a1-0000-4000-8000-000000000001', 'a2a2a2a2-0000-4000-8000-000000000001',
  now() - interval '200 days', now() - interval '200 days', now() - interval '200 days'
from (values
  ('77777777-7777-4777-8777-000000000001'::uuid,'Roberto Alves Pereira','11122233301','2001','Ativo','Refinaria','Masculino', date '1979-05-14','roberto.demo@exemplo.com','(21) 99900-0001','120','Rio de Janeiro'),
  ('77777777-7777-4777-8777-000000000002'::uuid,'Mariana Souza Ribeiro','22233344402','2002','Ativo','Administrativo','Feminino', date '1985-09-02','mariana.demo@exemplo.com','(21) 99900-0002','58','Niterói'),
  ('77777777-7777-4777-8777-000000000003'::uuid,'José Carlos de Oliveira','33344455503','2003','Ativo','Operação','Masculino', date '1972-11-23','jose.demo@exemplo.com','(21) 99900-0003','305','Rio de Janeiro'),
  ('77777777-7777-4777-8777-000000000004'::uuid,'Patrícia Gomes Lima','44455566604','2004','Ativo','Laboratório','Feminino', date '1990-01-30','patricia.demo@exemplo.com','(21) 99900-0004','77','São Gonçalo'),
  ('77777777-7777-4777-8777-000000000005'::uuid,'Antônio Ferreira Nunes','55566677705','2005','Ativo','Manutenção','Masculino', date '1968-07-08','antonio.demo@exemplo.com','(21) 99900-0005','12','Rio de Janeiro'),
  ('77777777-7777-4777-8777-000000000006'::uuid,'Camila Rodrigues Pinto','66677788806','2006','Ativo','Segurança','Feminino', date '1993-03-17','camila.demo@exemplo.com','(21) 99900-0006','440','Niterói'),
  ('77777777-7777-4777-8777-000000000007'::uuid,'Fernando Batista Rocha','77788899907','2007','Inativo','Operação','Masculino', date '1965-12-05','fernando.demo@exemplo.com','(21) 99900-0007','9','Rio de Janeiro'),
  ('77777777-7777-4777-8777-000000000008'::uuid,'Sônia Maria Teixeira','88899900008','2008','Falecido','Administrativo','Feminino', date '1958-06-21','sonia.demo@exemplo.com','(21) 99900-0008','201','Maricá')
) as p(id, nome, cpf, matricula, condicao, lotacao, sexo, nasc, email, tel, numero, cidade);

-- ---------------------------------------------------------------------------
-- 4) Um vínculo (fonte pagadora) para o filiado do print de perfil (Roberto).
-- ---------------------------------------------------------------------------
insert into filiacao_vinculos (
  id, emp_proprietaria_id, filiado_id, fonte_pagadora_id, cargo, lotacao,
  matricula, filiacao_condicao, data_filiacao, created_at
) values (
  'b0b0b0b0-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
  '77777777-7777-4777-8777-000000000001', 'f0f0f0f0-0000-4000-8000-000000000001',
  'Operador de Produção', 'Refinaria', '2001', 'Ativo',
  date '2015-04-01', now() - interval '200 days'
);

-- ---------------------------------------------------------------------------
-- 5) Solicitações da ficha pública. A #1 fica 'nao_avaliada' (pendente, pronta
--    para avaliar) — é o print. A #2 já 'aprovada' (para a lista ter variedade).
--    documento_assinado_url aponta para um PDF no bucket privado `filiacao`
--    (subido pelo script de preparo) — o requisito "Ficha assinada" fica verde.
-- ---------------------------------------------------------------------------
insert into filiacao_solicitacoes (
  id, emp_proprietaria_id, nome_completo, cpf, nascimento_data, sexo, email,
  telefone_1, telefone_1_whatsapp,
  endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro,
  endereco_cidade, endereco_estado,
  empregador_id, matricula, cargo, lotacao,
  aceite_lgpd_data, aceite_desconto_data, tl_lgpd_id, tl_desconto_id,
  situacao, documento_assinado_url, protocolo, email_verificado_em, created_at
) values
  ('88888888-8888-4888-8888-000000000001','11111111-1111-4111-8111-111111111111',
   'Lucas Moreira Andrade','99900011109', date '1994-08-19','Masculino','lucas.demo@exemplo.com',
   '(21) 99900-1001', true,
   '24020-000','Rua das Palmeiras','340','Icaraí','Niterói','RJ',
   'f0f0f0f0-0000-4000-8000-000000000001','2101','Técnico de Operação','Refinaria',
   now() - interval '3 days', now() - interval '3 days',
   'a1a1a1a1-0000-4000-8000-000000000001','a2a2a2a2-0000-4000-8000-000000000001',
   'nao_avaliada','assinados/demo-solicitacao-1.pdf', 1042, now() - interval '2 days',
   now() - interval '2 days'),
  ('88888888-8888-4888-8888-000000000002','11111111-1111-4111-8111-111111111111',
   'Beatriz Carvalho Nunes','10111213140', date '1996-02-11','Feminino','beatriz.demo@exemplo.com',
   '(21) 99900-1002', true,
   '24030-000','Rua São João','88','Santa Rosa','Niterói','RJ',
   'f0f0f0f0-0000-4000-8000-000000000001','2102','Analista Jr','Administrativo',
   now() - interval '10 days', now() - interval '10 days',
   'a1a1a1a1-0000-4000-8000-000000000001','a2a2a2a2-0000-4000-8000-000000000001',
   'aprovada','assinados/demo-solicitacao-2.pdf', 1039, now() - interval '9 days',
   now() - interval '10 days');

-- Trilha de auditoria da solicitação pendente (deixa o cartão "Trilha" cheio).
insert into filiacao_solicitacao_eventos (
  id, emp_proprietaria_id, solicitacao_id, evento, detalhe, created_at
) values
  ('c0c0c0c0-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   '88888888-8888-4888-8888-000000000001','E-mail verificado','Código confirmado', now() - interval '2 days'),
  ('c0c0c0c0-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   '88888888-8888-4888-8888-000000000001','Ficha assinada','Documento gov.br recebido', now() - interval '2 days');

-- ===========================================================================
-- Depois de rodar: suba o PDF placeholder (script de preparo) e capture os
-- prints com scripts/manual-prints.mjs (SHOTS já ajustados para Filiados).
--   select count(*) from filiacoes
--     where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 8
-- ===========================================================================
