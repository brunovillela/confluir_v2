-- Confluir — Eventos: quando a confirmação de presença abre (2026-09-06)
--
-- Do jeito que estava, o passo "confirmar que vai comparecer" aparecia para a
-- pessoa NO MESMO MINUTO em que ela se inscreveu. Confirmar presença um minuto
-- depois de se inscrever não é informação nova — é a inscrição repetida. O
-- valor do RSVP está em perguntar DE NOVO, perto da data, quando a pessoa já
-- sabe se vai conseguir ir.
--
-- `rsvp_abre_em` é a data e hora em que a confirmação abre, definida por quem
-- organiza. Antes dela o passo fica travado e a página diz à pessoa quando ela
-- receberá o e-mail; depois dela, o e-mail sai e o botão funciona.
--
-- `rsvp_enviado_lote_em` carimba o disparo do evento inteiro, para o envio
-- automático não repetir o que já saiu.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table eventos add column if not exists rsvp_abre_em timestamptz;
alter table eventos add column if not exists rsvp_enviado_lote_em timestamptz;

-- O varredor procura eventos publicados cujo RSVP abriu e ainda não saiu.
create index if not exists idx_eventos_rsvp_pendente
  on eventos (emp_proprietaria_id, rsvp_abre_em)
  where exige_rsvp = true and rsvp_enviado_lote_em is null;
