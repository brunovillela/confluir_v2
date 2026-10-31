-- Deliberações das atas como itens próprios.
--
-- POR QUÊ: as decisões de cada reunião eram um campo de texto livre na ata
-- (`reuniao_ata.deliberacoes`). Não dava para consultar "o que se decidiu
-- sobre X", nem acompanhar se a decisão foi cumprida, nem marcar o grau de
-- sigilo de cada uma (31/10/2026).
--
-- COMO:
--  1. `reuniao_deliberacao`: uma linha por decisão, presa à ata (apagar a ata
--     apaga as deliberações). Assunto, teor, resultado da votação,
--     responsável, prazo, situação (a cumprir, em execução, cumprida,
--     cancelada) e sigilo (livre, reservado, restrito).
--  2. O texto antigo de cada ata vira itens — um por linha, situação "a
--     cumprir" e sigilo "reservado" (o mais cauteloso entre os que deixam a
--     diretoria ver). Só roda para atas que ainda não têm itens.
-- Idempotente.

create table if not exists public.reuniao_deliberacao (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  ata_id uuid not null references public.reuniao_ata(id) on delete cascade,
  ordem integer not null default 1,
  assunto text not null,
  texto text,
  votacao text,
  responsavel text,
  prazo date,
  situacao text not null default 'a_cumprir'
    check (situacao in ('a_cumprir', 'em_execucao', 'cumprida', 'cancelada')),
  sigilo text not null default 'reservado'
    check (sigilo in ('livre', 'reservado', 'restrito')),
  criado_por uuid,
  atualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reuniao_deliberacao_ata_idx
  on public.reuniao_deliberacao (ata_id, ordem);
create index if not exists reuniao_deliberacao_emp_situacao_idx
  on public.reuniao_deliberacao (emp_proprietaria_id, situacao);

alter table public.reuniao_deliberacao enable row level security;
drop policy if exists tenant_isolation on public.reuniao_deliberacao;
create policy tenant_isolation on public.reuniao_deliberacao to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

comment on table public.reuniao_deliberacao is 'Deliberação (decisão) de uma reunião registrada em ata: assunto, teor, votação, responsável, prazo, situação do cumprimento e grau de sigilo. Consulta em Institucional › Deliberações. [lgpd:identificacao,sensivel_sindical|titulares:diretores e participantes]';
comment on column public.reuniao_deliberacao.ata_id is 'Ata da reunião em que a decisão foi tomada; a data da deliberação é a da ata. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao.ordem is 'Posição da deliberação na ata (1, 2, 3…). [lgpd:nenhum]';
comment on column public.reuniao_deliberacao.assunto is 'Assunto curto da decisão, usado na busca e nos filtros. [lgpd:identificacao]';
comment on column public.reuniao_deliberacao.texto is 'Teor da decisão como deliberado. [lgpd:identificacao]';
comment on column public.reuniao_deliberacao.votacao is 'Resultado da votação, quando houve (ex.: "aprovada por unanimidade", "5 a 2"). [lgpd:identificacao]';
comment on column public.reuniao_deliberacao.responsavel is 'Quem ficou encarregado de cumprir a decisão (texto livre). [lgpd:identificacao]';
comment on column public.reuniao_deliberacao.prazo is 'Prazo para cumprir a decisão, quando fixado. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao.situacao is 'a_cumprir, em_execucao, cumprida ou cancelada. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao.sigilo is 'livre, reservado ou restrito: quem pode consultar depende do nível de sigilo concedido ao usuário. [lgpd:nenhum]';
comment on column public.reuniao_deliberacao.criado_por is 'Usuário que registrou a deliberação. [lgpd:identificacao]';
comment on column public.reuniao_deliberacao.atualizado_por is 'Usuário que alterou a deliberação por último. [lgpd:identificacao]';

-- ── 2. O texto antigo vira itens ────────────────────────────────────────────
insert into public.reuniao_deliberacao (emp_proprietaria_id, ata_id, ordem, assunto, texto)
select a.emp_proprietaria_id,
       a.id,
       l.n::integer,
       left(regexp_replace(btrim(l.linha), '^[-•*\d.)\s]+', ''), 120),
       regexp_replace(btrim(l.linha), '^[-•*\d.)\s]+', '')
from public.reuniao_ata a
cross join lateral regexp_split_to_table(a.deliberacoes, E'\\r?\\n') with ordinality as l(linha, n)
where a.emp_proprietaria_id is not null
  and btrim(coalesce(a.deliberacoes, '')) <> ''
  and btrim(l.linha) <> ''
  and not exists (select 1 from public.reuniao_deliberacao d where d.ata_id = a.id);
