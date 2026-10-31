-- Confluir — Contracheques e ponto: liberação automática da remessa (31/10/2026)
--
-- POR QUÊ: a folha e o relatório de ponto importados entram bloqueados ao
-- funcionário; o gestor confere e libera. A liberação costuma ser num dia
-- certo (o do pagamento, no contracheque) e às vezes fica esquecida. Agora o
-- gestor marca a data na remessa e a rotina diária (/api/pessoal/liberacao/tick)
-- libera os bloqueados nesse dia, avisando cada funcionário como na liberação
-- manual.
--
-- COMO: liberar_em = o dia da liberação automática (vazio = só manual).
-- liberada_automaticamente_em = quando a rotina liberou; ela roda uma vez por
-- remessa (o que for bloqueado depois fica bloqueado). Marcar de novo uma
-- data futura zera a marca. Idempotente.

alter table public.pessoal_contracheques_remessas
  add column if not exists liberar_em date,
  add column if not exists liberada_automaticamente_em timestamptz;

alter table public.pessoal_registro_ponto_remessas
  add column if not exists liberar_em date,
  add column if not exists liberada_automaticamente_em timestamptz;

comment on column public.pessoal_contracheques_remessas.liberar_em is
  'Dia em que a rotina diária libera ao funcionário os contracheques ainda bloqueados (vazio = só liberação manual).';
comment on column public.pessoal_contracheques_remessas.liberada_automaticamente_em is
  'Quando a rotina diária liberou a remessa (uma vez; nova data futura zera).';
comment on column public.pessoal_registro_ponto_remessas.liberar_em is
  'Dia em que a rotina diária libera ao funcionário os registros de ponto ainda bloqueados (vazio = só liberação manual).';
comment on column public.pessoal_registro_ponto_remessas.liberada_automaticamente_em is
  'Quando a rotina diária liberou a remessa (uma vez; nova data futura zera).';

create index if not exists pessoal_contracheques_remessas_liberar_idx
  on public.pessoal_contracheques_remessas (liberar_em)
  where liberar_em is not null and liberada_automaticamente_em is null;
create index if not exists pessoal_registro_ponto_remessas_liberar_idx
  on public.pessoal_registro_ponto_remessas (liberar_em)
  where liberar_em is not null and liberada_automaticamente_em is null;
