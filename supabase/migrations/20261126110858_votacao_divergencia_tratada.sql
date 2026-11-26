-- Votação: divergência de cadastro tratada pelo setor de filiação (26/11/2026).
--
-- POR QUÊ: o voto liberado com divergência (nome da lista × ficha, ficha
-- inativa que não confere, nascimento suspeito, "meu nome está errado na
-- lista") gera aviso no sino do setor de filiação, mas o aviso não levava a
-- lugar nenhum. A nova fila "Divergências das votações" (Filiados) mostra cada
-- caso e registra o tratamento; o conflito_motivo fica como estava (é o
-- registro do que aconteceu na votação).
--
-- COMO: três colunas no apto — quando, quem e o que foi feito.

alter table public.voto_assembleias_aptos
  add column if not exists divergencia_tratada_em timestamptz,
  add column if not exists divergencia_tratada_por uuid,
  add column if not exists divergencia_tratamento text;

comment on column public.voto_assembleias_aptos.divergencia_tratada_em is
  'Quando o setor de filiação tratou a divergência de cadastro apontada no conflito_motivo (fila Divergências das votações). [lgpd:nenhum]';
comment on column public.voto_assembleias_aptos.divergencia_tratada_por is
  'Usuário (usuarios.id) que tratou a divergência. [lgpd:nenhum]';
comment on column public.voto_assembleias_aptos.divergencia_tratamento is
  'O que foi feito: ficha atualizada (nome/nascimento) ou observação de quem tratou; pode citar nomes. [lgpd:identificacao]';

create index if not exists voto_aptos_divergencia_aberta_idx
  on public.voto_assembleias_aptos (emp_proprietaria_id, conflito_em desc)
  where conflito_motivo is not null and divergencia_tratada_em is null;
