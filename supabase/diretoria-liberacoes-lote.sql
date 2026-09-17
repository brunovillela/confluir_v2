-- ============================================================================
-- Diretoria: liberações em lote e instâncias dentro do mandato  (2026-09-17)
--
-- Pedido do Bruno:
-- • Um ofício costuma liberar VÁRIAS pessoas de uma vez. A liberação ganha o
--   ofício (da área de Ofícios) e um `lote_id` que agrupa quem saiu no mesmo
--   ofício, cada um com a sua data de saída e de retorno.
-- • Trabalhadores da base podem ser liberados sem ser diretores: a liberação
--   passa a aceitar uma FILIAÇÃO (ou só nome e CPF) no lugar do integrante, e
--   guarda o mandato em que foi lançada (antes era deduzido do integrante).
-- • Os vínculos dos diretores às instâncias (assentos) passam a ser lançados
--   dentro do mandato: o assento guarda o mandato.
--
-- Idempotente. Rodar uma vez no SQL Editor do Supabase.
-- ============================================================================

-- Liberações ------------------------------------------------------------------
alter table diretoria_liberacoes alter column integrante_id drop not null;
alter table diretoria_liberacoes add column if not exists mandato_id uuid references diretoria_mandatos (id) on delete set null;
alter table diretoria_liberacoes add column if not exists filiacao_id uuid references filiacoes (id) on delete set null;
alter table diretoria_liberacoes add column if not exists nome text;   -- snapshot de quem foi liberado
alter table diretoria_liberacoes add column if not exists cpf text;
alter table diretoria_liberacoes add column if not exists oficio_id uuid references oficios (id) on delete set null;
alter table diretoria_liberacoes add column if not exists lote_id uuid;

-- Toda liberação tem uma pessoa: o diretor, a filiação ou ao menos o nome.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'diretoria_liberacoes_tem_pessoa') then
    alter table diretoria_liberacoes add constraint diretoria_liberacoes_tem_pessoa
      check (integrante_id is not null or filiacao_id is not null or nome is not null);
  end if;
end $$;

-- As liberações de antes ficam no mandato do diretor.
update diretoria_liberacoes l
   set mandato_id = i.mandato_id
  from diretoria_integrantes i
 where l.integrante_id = i.id and l.mandato_id is null;

create index if not exists idx_diretoria_liberacoes_mandato on diretoria_liberacoes (mandato_id);
create index if not exists idx_diretoria_liberacoes_oficio on diretoria_liberacoes (oficio_id);
create index if not exists idx_diretoria_liberacoes_lote on diretoria_liberacoes (lote_id);

comment on column diretoria_liberacoes.filiacao_id is
  'Trabalhador da base liberado sem ser diretor (integrante_id nulo).';
comment on column diretoria_liberacoes.lote_id is
  'Liberações lançadas juntas, pelo mesmo ofício.';

-- Assentos em instâncias --------------------------------------------------------
alter table diretoria_instancia_assentos add column if not exists mandato_id uuid references diretoria_mandatos (id) on delete set null;

update diretoria_instancia_assentos a
   set mandato_id = i.mandato_id
  from diretoria_integrantes i
 where a.integrante_id = i.id and a.mandato_id is null;

create index if not exists idx_diretoria_assentos_mandato on diretoria_instancia_assentos (mandato_id);

notify pgrst, 'reload schema';
