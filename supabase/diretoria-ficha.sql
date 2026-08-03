-- Confluir — Ficha do diretor (2026-07-26)
--
-- Ficha completa 1:1 com diretoria_integrantes. Reusar enderecos/dados_bancarios/
-- telefones NÃO encaixa: elas ancoram em usuario_id/filiado_id/empresa_id/
-- fornecedor_id (sem integrante_id), e a maioria dos diretores não tem usuário
-- nem filiação. Dados 1:1 (não coleções) → tabela própria. nome/cpf continuam
-- no integrante (não duplica aqui).
--
-- APÓS este script: RE-RODAR supabase/rls-emp-todas.sql (tenant_isolation +
-- grant + trigger set_emp_from_jwt na tabela nova, que tem emp_proprietaria_id).

create table if not exists public.diretoria_ficha (
  id uuid primary key default gen_random_uuid(),
  integrante_id uuid not null unique
    references public.diretoria_integrantes(id) on delete cascade,

  -- Pessoais (nome e CPF ficam no integrante)
  data_nascimento date,
  email_particular text,
  telefone_particular text,
  telefone_whatsapp boolean not null default false,
  tamanho_camisa text,
  tipo_sanguineo text,

  -- Endereço
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,

  -- Vínculo empregatício
  tipo_vinculo text,
  empregador_id uuid references public.empresa(id),  -- fonte pagadora / empregador
  matricula_empregador text,
  base_operacional text,                             -- sede do empregador (texto v1)

  -- Dados bancários
  banco text,
  agencia text,
  conta_corrente text,
  pix text,
  tipo_chave_pix text,

  -- Acessibilidade
  tem_restricao boolean not null default false,
  restricao_descricao text,

  -- Contato de emergência
  contato_emergencia text,
  telefone_emergencia text,

  emp_proprietaria_id uuid references public.empresa(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_diretoria_ficha_emp
  on public.diretoria_ficha (emp_proprietaria_id);
