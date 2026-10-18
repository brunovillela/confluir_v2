-- Confluir — Eventos: filiados e vínculo com a Agenda (2026-09-07)
--
-- Três lacunas que o primeiro uso mostrou:
--
-- 1. `eventos_inscricoes.filiacao_id` existia desde o começo e NUNCA era
--    preenchido. Sem ele não dá para responder "quantos dos inscritos são
--    filiados?" nem para levar nada ao prontuário da pessoa.
--
-- 2. `eventos.agenda_id` também existia sem uso. O evento não aparecia na
--    Agenda do painel nem na do portal — o filiado não ficava sabendo.
--
-- 3. O prontuário precisa registrar três momentos distintos (inscreveu,
--    respondeu ao RSVP, compareceu). Sem marcar QUAL já foi lançado, um
--    reprocessamento duplicaria linhas no histórico de vida da pessoa.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 1. Carimbos do que já foi ao prontuário ─────────────────────────────────
-- São três porque acontecem em momentos diferentes e podem não acontecer todos.

alter table eventos_inscricoes
  add column if not exists prontuario_inscricao_em timestamptz;
alter table eventos_inscricoes
  add column if not exists prontuario_rsvp_em timestamptz;
alter table eventos_inscricoes
  add column if not exists prontuario_presenca_em timestamptz;

-- Casar inscrição com filiação é busca por CPF; o índice serve à conciliação
-- e ao indicador de quantos inscritos são filiados.
create index if not exists idx_eventos_insc_filiacao
  on eventos_inscricoes (emp_proprietaria_id, filiacao_id)
  where filiacao_id is not null;

-- A origem 'portal' já é aceita pela constraint criada em eventos.sql
-- (publica | portal | painel | planilha) — nada a fazer aqui.

-- ── 2. Vínculo com a Agenda ─────────────────────────────────────────────────
-- `eventos.agenda_id` já existe. O que falta é o caminho de volta: dado um
-- compromisso da agenda, saber que ele nasceu de um evento com inscrição — é
-- o que permite ao portal oferecer o botão "inscrever-se" na agenda.

alter table agenda add column if not exists evento_id uuid references eventos(id) on delete set null;

create index if not exists idx_agenda_evento
  on agenda (emp_proprietaria_id, evento_id)
  where evento_id is not null;
