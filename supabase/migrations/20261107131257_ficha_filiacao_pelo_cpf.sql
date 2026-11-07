-- Confluir — ficha de filiação online começando pelo CPF
--
-- POR QUÊ: a ficha pública pedia tudo de uma vez e, para quem já tinha cadastro
-- (quem saiu e quer voltar), recusava o CPF ("acesse o portal"). Agora a pessoa
-- informa CPF e nascimento; quem já tem cadastro recebe o link no e-mail do
-- cadastro e confere os dados já preenchidos; quem não tem (ou perdeu o acesso
-- ao e-mail) informa um e-mail e preenche do zero. O link do e-mail substitui o
-- código de 6 dígitos: a pessoa continua na aba que o e-mail abriu.
--
-- COMO: colunas novas em filiacao_solicitacoes e a situação 'em_preenchimento'
-- (e-mail confirmado pelo link, ficha ainda sendo preenchida):
--  - caminho: 'cadastro' (link no e-mail do cadastro, dados pré-preenchidos),
--    'outro_email' (tem cadastro pelo CPF, mas o e-mail é outro: sem
--    pré-preenchimento, identidade conferida pela assinatura gov.br) ou 'novo';
--  - cadastro_existente_id: o cadastro do CPF, que a aprovação atualiza em vez
--    de criar outro;
--  - mesma_fonte: se a pessoa continua na fonte do último vínculo;
--  - passo: até onde a ficha foi preenchida (o link retoma dali);
--  - link_expira_em: validade do link enquanto a ficha não é concluída (7 dias).

alter table public.filiacao_solicitacoes
  add column if not exists caminho text,
  add column if not exists cadastro_existente_id uuid references public.filiacoes(id) on delete set null,
  add column if not exists mesma_fonte boolean,
  add column if not exists passo smallint not null default 0,
  add column if not exists link_expira_em timestamptz;

alter table public.filiacao_solicitacoes drop constraint if exists filiacao_solicitacoes_caminho_check;
alter table public.filiacao_solicitacoes
  add constraint filiacao_solicitacoes_caminho_check
  check (caminho is null or caminho in ('cadastro', 'outro_email', 'novo'));

alter table public.filiacao_solicitacoes drop constraint if exists filiacao_solicitacoes_situacao_check;
alter table public.filiacao_solicitacoes
  add constraint filiacao_solicitacoes_situacao_check
  check (situacao in (
    'aguardando_verificacao', 'em_preenchimento', 'aguardando_assinatura',
    'nao_avaliada', 'aprovada', 'reprovada', 'desistente'
  ));

create index if not exists idx_filiacao_solicitacoes_cpf
  on public.filiacao_solicitacoes (emp_proprietaria_id, cpf);

comment on column public.filiacao_solicitacoes.caminho is 'Como a ficha começou: cadastro (link no e-mail do cadastro), outro_email (CPF com cadastro, e-mail informado) ou novo. [lgpd:nenhum]';
comment on column public.filiacao_solicitacoes.cadastro_existente_id is 'Cadastro de filiado com o mesmo CPF, atualizado na aprovação. [lgpd:identificacao]';
comment on column public.filiacao_solicitacoes.mesma_fonte is 'A pessoa continua na fonte pagadora do último vínculo. [lgpd:trabalhista]';
comment on column public.filiacao_solicitacoes.passo is 'Até que passo a ficha foi preenchida (o link retoma dali). [lgpd:nenhum]';
comment on column public.filiacao_solicitacoes.link_expira_em is 'Validade do link do e-mail enquanto a ficha não é concluída. [lgpd:nenhum]';
