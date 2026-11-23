-- POR QUÊ: Gestão (23/11/2026), fase 1 da gestão do e-mail. Todo e-mail do
--   sistema sai por um ponto só (src/lib/email.ts), mas nada registrava o que
--   saiu: quando alguém pergunta "o e-mail chegou para fulano?", a resposta
--   dependia de consultar o Brevo à mão, e uma falha de envio passava em
--   silêncio. Também não havia como saber quais processos e departamentos
--   mais enviam — a base para teto, cotas e desligar por módulo (fases 2 e 3),
--   como já existe para a IA.
-- COMO: email_envios, uma linha por e-mail: processo e módulo (catálogo em
--   src/lib/email-processos.ts), quem disparou e o departamento dele, o
--   destinatário, o provedor e a situação. NÃO guarda assunto nem corpo (o
--   assunto às vezes leva dado pessoal). O id da linha vai no cabeçalho
--   X-Mailin-custom do e-mail, e o webhook do Brevo (/api/webhooks/brevo)
--   grava a entrega, o adiamento e a rejeição definitiva na mesma linha. O
--   destinatário é apagado pelo motor de retenção depois de 1 ano (RT38).
--   Resumo agregado no banco (email_envios_resumo), como o da IA.
--   Idempotente.

create table if not exists public.email_envios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  criado_em timestamptz not null default now(),
  processo text not null,
  modulo text not null,
  detalhe text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  departamento_id uuid references public.empresa_departamentos(id) on delete set null,
  destinatario text,
  dominio text,
  provedor text not null,
  situacao text not null default 'enviando',
  erro text,
  anexos integer not null default 0,
  entregue_em timestamptz,
  adiado_em timestamptz,
  rejeitado_em timestamptz,
  rejeicao text,
  constraint email_envios_situacao_valida check (situacao in ('enviando', 'enviado', 'falhou', 'sem_configuracao', 'teste')),
  constraint email_envios_provedor_valido check (provedor in ('brevo', 'resend', 'nenhum'))
);

create index if not exists email_envios_emp_data_idx on public.email_envios (emp_proprietaria_id, criado_em desc);
create index if not exists email_envios_emp_destinatario_idx on public.email_envios (emp_proprietaria_id, lower(destinatario), criado_em desc);

alter table public.email_envios enable row level security;
drop policy if exists tenant_isolation on public.email_envios;
create policy tenant_isolation on public.email_envios to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.email_envios from public, anon;
grant select, insert, update, delete on table public.email_envios to authenticated;
grant all on table public.email_envios to service_role;

drop trigger if exists set_emp_from_jwt on public.email_envios;
create trigger set_emp_from_jwt before insert on public.email_envios
  for each row execute function public.set_emp_from_jwt();

comment on table public.email_envios is 'Uma linha por e-mail enviado pelo sistema (src/lib/email.ts): processo, módulo, quem disparou, departamento, destinatário, provedor, situação e os eventos do provedor (entrega, adiamento, rejeição). Não guarda assunto nem corpo (Gestão, 23/11/2026). [lgpd:identificacao|titulares:filiados,funcionarios,fornecedores]';
comment on column public.email_envios.processo is 'Identificador do processo que enviou (catálogo em src/lib/email-processos.ts), ex.: acesso.codigo.';
comment on column public.email_envios.modulo is 'Módulo do processo (slug do catálogo), ex.: acesso, votacao, compras.';
comment on column public.email_envios.detalhe is 'Complemento técnico do processo, sem dado pessoal (ex.: o evento do aviso do sistema). [lgpd:nenhum]';
comment on column public.email_envios.usuario_id is 'Quem estava logado quando o e-mail saiu; nulo em tarefa agendada ou fluxo público. [lgpd:identificacao]';
comment on column public.email_envios.departamento_id is 'Departamento de quem disparou, no momento do envio (o principal marcado na Gestão; senão o que coordena; senão o primeiro).';
comment on column public.email_envios.destinatario is 'Endereço de e-mail do destinatário; apagado depois de 1 ano pelo motor de retenção (RT38). [lgpd:identificacao]';
comment on column public.email_envios.dominio is 'Domínio do destinatário (ex.: petrobras.com.br), que fica depois da retenção para as estatísticas de entrega. [lgpd:nenhum]';
comment on column public.email_envios.provedor is 'Provedor usado: brevo, resend ou nenhum (envio não configurado neste ambiente).';
comment on column public.email_envios.situacao is 'enviando (antes da resposta do provedor), enviado (aceito pelo provedor), falhou, sem_configuracao (ambiente sem chave) ou teste (sandbox, não entregue).';
comment on column public.email_envios.erro is 'Motivo curto da falha do envio (código HTTP ou erro de rede), nunca o conteúdo. [lgpd:nenhum]';
comment on column public.email_envios.anexos is 'Quantos arquivos foram anexados.';
comment on column public.email_envios.entregue_em is 'Brevo: quando o servidor do destinatário aceitou o e-mail.';
comment on column public.email_envios.adiado_em is 'Brevo: último adiamento (soft bounce ou caixa cheia); o provedor ainda tenta de novo.';
comment on column public.email_envios.rejeitado_em is 'Brevo: rejeição definitiva (hard bounce, endereço inválido, bloqueado ou marcado como spam).';
comment on column public.email_envios.rejeicao is 'Brevo: tipo e motivo curto da rejeição definitiva. [lgpd:nenhum]';

-- Resumo do período, agregado por processo, módulo, pessoa, departamento, situação e dia (Gestão › E-mail).
create or replace function public.email_envios_resumo(p_emp uuid, p_de timestamptz, p_ate timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select * from email_envios
     where emp_proprietaria_id = p_emp
       and criado_em >= p_de and criado_em < p_ate
  ),
  agrupado as (
    select dim, chave,
           count(*) as enviados,
           count(*) filter (where situacao = 'falhou') as falhas,
           count(*) filter (where entregue_em is not null) as entregues,
           count(*) filter (where rejeitado_em is not null) as rejeitados,
           max(criado_em) as ultima
      from (
        select 'processo' as dim, processo as chave, * from base
        union all select 'modulo', modulo, * from base
        union all select 'usuario', coalesce(usuario_id::text, ''), * from base
        union all select 'departamento', coalesce(departamento_id::text, ''), * from base
        union all select 'situacao', situacao, * from base
        union all select 'dia', to_char(criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), * from base
        union all select 'total', '', * from base
      ) x
     group by dim, chave
  )
  select coalesce(jsonb_object_agg(dim, linhas), '{}'::jsonb)
    from (
      select dim, jsonb_agg(jsonb_build_object(
               'chave', chave, 'enviados', enviados, 'falhas', falhas,
               'entregues', entregues, 'rejeitados', rejeitados, 'ultima', ultima
             ) order by enviados desc) as linhas
        from agrupado
       group by dim
    ) d;
$$;
revoke all on function public.email_envios_resumo(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.email_envios_resumo(uuid, timestamptz, timestamptz) to service_role;
comment on function public.email_envios_resumo(uuid, timestamptz, timestamptz) is 'E-mails da entidade no período, agregados por processo, módulo, pessoa, departamento, situação e dia (Gestão › E-mail, 23/11/2026).';
