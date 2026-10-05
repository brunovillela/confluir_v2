-- ============================================================================
-- Diárias em remessa, autorização de contratos e custeios, forma de pagamento
-- e formalização do custeio (05/10/2026). Idempotente — rodar no SQL Editor do
-- Supabase ANTES do deploy (`atualizarAcesso` grava todas as chaves do
-- catálogo: a permissão nova precisa existir antes).
--
-- 1. DIÁRIAS EM REMESSA: cada diária lançada entra na remessa ABERTA do
--    beneficiário (uma por pessoa e quadro), que acumula diárias e despesas.
--    Quem gere as diárias ENVIA a remessa para pagamento: aí nasce UMA ordem
--    com a soma das diárias aprovadas e o rateio por conta. Reaproveita a
--    tabela das remessas migradas do sistema anterior (as novas não têm
--    bubble_id).
-- 2. AUTORIZAÇÃO DE CONTRATOS: permissão `aquisicoes_contratos_autorizacao`.
--    Parcela recorrente só é gerada para contrato autorizado e já nasce
--    autorizada, esperando só o documento fiscal; pagamento extraordinário
--    passa pela autorização pontual — que, em ordem de contrato, exige esta
--    permissão além da alçada (em custeio, `custeio_institucional_autorizacao`).
--    Quem hoje tem alçada de avaliação recebe a chave nova.
-- 3. CUSTEIO: forma de pagamento completa (chave/conta do beneficiário,
--    código Pix, caixa, boleto) e o arquivo de formalização.
-- ============================================================================

-- ── 1. Diárias em remessa ───────────────────────────────────────────────────
alter table public.pessoal_diarias_remessas
  add column if not exists beneficiario_tipo text,
  add column if not exists enviado_em timestamptz,
  add column if not exists enviado_por uuid references public.usuarios(id);

comment on column public.pessoal_diarias_remessas.beneficiario_tipo is
  'Quadro da remessa (funcionario | diretor) — decide a porta (Pessoal ou Diretoria). Nulo nas migradas do sistema anterior.';

alter table public.pessoal_diarias_solicitacoes
  add column if not exists remessa_id uuid references public.pessoal_diarias_remessas(id),
  add column if not exists valor_descontos numeric(12, 2);

comment on column public.pessoal_diarias_solicitacoes.remessa_id is
  'Remessa do beneficiário em que a diária entrou ao ser lançada.';
comment on column public.pessoal_diarias_solicitacoes.valor_descontos is
  'Infrações de trânsito abatidas na aprovação (a diária entra líquida na remessa).';

create index if not exists idx_diarias_solicitacoes_remessa
  on public.pessoal_diarias_solicitacoes (remessa_id);
create index if not exists idx_diarias_remessas_abertas
  on public.pessoal_diarias_remessas (emp_proprietaria_id, beneficiario_id, beneficiario_tipo)
  where bubble_id is null and enviado is not true;

-- ── 2. Autorização de contratos ─────────────────────────────────────────────
alter table public.permissoes
  add column if not exists aquisicoes_contratos_autorizacao boolean;

comment on column public.permissoes.aquisicoes_contratos_autorizacao is
  'Autorizar contratos (as parcelas recorrentes nascem autorizadas) e os pagamentos extraordinários de contrato.';

update public.permissoes
   set aquisicoes_contratos_autorizacao = true
 where aquisicoes_avaliacoes is true
   and aquisicoes_contratos_autorizacao is distinct from true;

insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select pf.id, pf.emp_proprietaria_id, 'aquisicoes_contratos_autorizacao'
  from public.perfis pf
 where pf.nome = 'Diretoria / Coordenação'
   and not exists (
     select 1 from public.perfil_permissoes pp
      where pp.perfil_id = pf.id and pp.chave = 'aquisicoes_contratos_autorizacao'
   );

-- ── 3. Custeio: forma de pagamento e formalização ───────────────────────────
alter table public.institucional_custeios
  add column if not exists pix_codigo text,
  add column if not exists caixa_conta_id uuid references public.caixa_contas(id),
  add column if not exists arquivo_boleto text,
  add column if not exists conta_favorecido text,
  add column if not exists arquivo_formalizacao text;

comment on column public.institucional_custeios.arquivo_formalizacao is
  'Documento que formaliza o custeio (convite, ata, ofício, termo) — bucket compras.';

notify pgrst, 'reload schema';
