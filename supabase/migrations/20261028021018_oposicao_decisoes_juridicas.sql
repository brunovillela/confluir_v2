-- Confluir — Oposição: decisões jurídicas por entidade e por campanha (28/10/2026)
--
-- POR QUÊ: o pente fino da oposição (docs/avaliacao-oposicao-2026-10.md)
-- deixou quatro pontos para o jurídico — aceitar carta depois do prazo, vídeo
-- com tempo mínimo, quais assinaturas valem (só gov.br ou também e-CPF),
-- prova adicional do não filiado — e a segregação das permissões. Cada
-- entidade decide, e cada campanha pode decidir diferente. Sem decisão, a
-- campanha não abre.
--
-- COMO:
--  1. `oposicao_regras`: o padrão da entidade (uma linha por entidade). Nulo
--     = ainda não decidido.
--  2. `oposicao_campanha.regra_*`: a decisão da campanha; nula = segue o
--     padrão da entidade. Ao abrir a campanha, o sistema grava nela as
--     decisões vigentes (mudar o padrão depois não muda campanha aberta) e
--     recusa abrir com alguma em branco.
--  3. Permissões `oposicao_configurar` e `oposicao_avaliar` em `permissoes`,
--     usadas quando a segregação está ligada.
-- Idempotente.

-- ── 1. Padrão da entidade ───────────────────────────────────────────────────
create table if not exists public.oposicao_regras (
  emp_proprietaria_id uuid primary key references public.empresa(id) on delete cascade,
  carta_fora_prazo text check (carta_fora_prazo in ('aceitar', 'recusar')),
  video_minimo text check (video_minimo in ('exigir', 'dispensar')),
  assinaturas_aceitas text check (assinaturas_aceitas in ('govbr', 'govbr_icp')),
  prova_nao_filiado text check (prova_nao_filiado in ('nenhuma', 'matricula', 'carta_govbr')),
  segregacao text check (segregacao in ('unica', 'separada')),
  definido_por uuid,
  definido_por_nome text,
  atualizado_em timestamptz not null default now()
);

alter table public.oposicao_regras enable row level security;
drop policy if exists tenant_isolation on public.oposicao_regras;
create policy tenant_isolation on public.oposicao_regras to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.oposicao_regras;
create trigger set_emp_from_jwt before insert on public.oposicao_regras
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.oposicao_regras from public, anon;
grant select, insert, update on table public.oposicao_regras to authenticated;
grant all on table public.oposicao_regras to service_role;

-- Sem o gatilho de auditoria genérico (ele usa a coluna `id`, que esta tabela
-- não tem): cada mudança vai para a trilha da oposição (`oposicao_eventos`,
-- evento `regras_entidade_editadas`, com autor e antes → depois).

comment on table public.oposicao_regras is 'Decisões jurídicas padrão da entidade para as campanhas de oposição (carta fora do prazo, vídeo mínimo, assinaturas aceitas, prova do não filiado, segregação de permissões). Nulo = não decidido. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.oposicao_regras.carta_fora_prazo is 'aceitar: a carta assinada enviada depois do prazo é recebida e marcada no checklist; recusar: o portal não a recebe.';
comment on column public.oposicao_regras.video_minimo is 'exigir: o vídeo da campanha precisa ser assistido pelo tempo mínimo antes de confirmar; dispensar: o vídeo aparece, sem tempo mínimo.';
comment on column public.oposicao_regras.assinaturas_aceitas is 'govbr: só a assinatura do Assinador gov.br; govbr_icp: gov.br ou certificado ICP-Brasil (e-CPF).';
comment on column public.oposicao_regras.prova_nao_filiado is 'nenhuma: nome, CPF e e-mail confirmado; matricula: matrícula obrigatória; carta_govbr: carta assinada obrigatória para o não filiado.';
comment on column public.oposicao_regras.segregacao is 'unica: a permissão "oposicao" faz tudo; separada: configurar exige oposicao_configurar e avaliar exige oposicao_avaliar.';
comment on column public.oposicao_regras.definido_por is 'Quem salvou as decisões por último. [lgpd:identificacao]';
comment on column public.oposicao_regras.definido_por_nome is 'Nome de quem salvou, no momento. [lgpd:identificacao]';

-- ── 2. Decisão da campanha (nula = padrão da entidade) ──────────────────────
alter table public.oposicao_campanha
  add column if not exists regra_carta_fora_prazo text check (regra_carta_fora_prazo in ('aceitar', 'recusar')),
  add column if not exists regra_video_minimo text check (regra_video_minimo in ('exigir', 'dispensar')),
  add column if not exists regra_assinaturas_aceitas text check (regra_assinaturas_aceitas in ('govbr', 'govbr_icp')),
  add column if not exists regra_prova_nao_filiado text check (regra_prova_nao_filiado in ('nenhuma', 'matricula', 'carta_govbr')),
  add column if not exists regra_segregacao text check (regra_segregacao in ('unica', 'separada'));

comment on column public.oposicao_campanha.regra_carta_fora_prazo is 'Decisão da campanha sobre carta depois do prazo; nula = padrão da entidade (oposicao_regras). Gravada ao abrir. [lgpd:nenhum]';
comment on column public.oposicao_campanha.regra_video_minimo is 'Decisão da campanha sobre o vídeo com tempo mínimo; nula = padrão da entidade. [lgpd:nenhum]';
comment on column public.oposicao_campanha.regra_assinaturas_aceitas is 'Assinaturas que a campanha aceita na carta; nula = padrão da entidade. [lgpd:nenhum]';
comment on column public.oposicao_campanha.regra_prova_nao_filiado is 'Prova exigida do não filiado; nula = padrão da entidade. [lgpd:nenhum]';
comment on column public.oposicao_campanha.regra_segregacao is 'Segregação de permissões da campanha; nula = padrão da entidade. [lgpd:nenhum]';

-- ── 3. Permissões da segregação ─────────────────────────────────────────────
alter table public.permissoes
  add column if not exists oposicao_configurar boolean default false,
  add column if not exists oposicao_avaliar boolean default false;

comment on column public.permissoes.oposicao_configurar is 'Oposição com segregação: criar e editar campanhas, questionário, decisões jurídicas e relação ao empregador. [lgpd:nenhum]';
comment on column public.permissoes.oposicao_avaliar is 'Oposição com segregação: avaliar (uma a uma e em lote), encerrar sem carta e reverificar assinatura. [lgpd:nenhum]';
