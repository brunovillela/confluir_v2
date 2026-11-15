-- Confluir — cobrança automática das relações de desconto
--
-- POR QUÊ: a cobrança das fontes pagadoras era só sob demanda (uma por uma ou
-- em lote). Uma tarefa diária passa a lembrar o RH antes do prazo e cobrar
-- depois dele, sem ninguém precisar abrir o sistema; e a remessa do mês nasce
-- no dia 1, não na primeira visita.
--
-- COMO:
--  1. empresa.filiacao_cobranca_automatica (na entidade): liga a cobrança
--     automática (padrão desligado: a entidade decide).
--  2. empresa.filiacao_lembrete_dias (na entidade): quantos dias antes do
--     prazo da relação sai o lembrete; 0 = sem lembrete.
--  3. empresa.repasse_cobranca_automatica (na fonte pagadora): a entidade
--     pode tirar uma empresa da cobrança automática (padrão: incluída).
--  4. filiacao_repasse_eventos ganha o evento 'lembrete' (lembrete antes do
--     prazo), para não repetir o mesmo lembrete.
-- Idempotente.

alter table public.empresa
  add column if not exists filiacao_cobranca_automatica boolean not null default false,
  add column if not exists filiacao_lembrete_dias smallint not null default 3 check (filiacao_lembrete_dias between 0 and 15),
  add column if not exists repasse_cobranca_automatica boolean not null default true;

alter table public.filiacao_repasse_eventos drop constraint if exists filiacao_repasse_eventos_evento_check;
alter table public.filiacao_repasse_eventos
  add constraint filiacao_repasse_eventos_evento_check
  check (evento in ('relacao_recebida', 'sem_desconto', 'cobranca', 'contato', 'lembrete'));

comment on column public.empresa.filiacao_cobranca_automatica is 'Na entidade: a tarefa diária lembra o RH das fontes pagadoras antes do prazo da relação e cobra depois dele (15/11/2026). [lgpd:nenhum]';
comment on column public.empresa.filiacao_lembrete_dias is 'Na entidade: dias antes do prazo da relação em que sai o lembrete automático; 0 = sem lembrete. [lgpd:nenhum]';
comment on column public.empresa.repasse_cobranca_automatica is 'Na fonte pagadora: entra na cobrança automática da entidade (false = só cobrança manual). [lgpd:nenhum]';
