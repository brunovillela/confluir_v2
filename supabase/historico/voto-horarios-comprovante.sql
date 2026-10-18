-- 1) Horário de início e término da assembleia (hoje só há a data).
--    A janela de votação online passa a ser data+hora, no fuso de São Paulo:
--    sem hora, vale o dia inteiro (00:00 às 23:59).
alter table public.voto_assembleias
  add column if not exists hora_inicio time,
  add column if not exists hora_termino time;

-- 2) Comprovante de votação (participação, nunca o conteúdo do voto).
--    Fica no APTO — a tabela que registra QUEM votou. O voto em si
--    (voto_online) não recebe nada disto, para nada ligar a pessoa às
--    opções escolhidas.
--
--    comprovante_codigo   código do eleitor (ex.: VT-7K3Q-8M2D)
--    comprovante_hash     SHA-256 de código+apto+assembleia+momento
--    comprovante_canal    'online' | 'urna_digital' | 'urna_fisica'
--    comprovante_em       quando o comprovante foi emitido
--    comprovante_email_em quando o e-mail de confirmação saiu (nulo = não saiu)
alter table public.voto_assembleias_aptos
  add column if not exists comprovante_codigo text,
  add column if not exists comprovante_hash text,
  add column if not exists comprovante_canal text,
  add column if not exists comprovante_em timestamptz,
  add column if not exists comprovante_email_em timestamptz;

-- O código é único por entidade (é por ele que a página de conferência busca).
create unique index if not exists voto_aptos_comprovante_codigo_idx
  on public.voto_assembleias_aptos (emp_proprietaria_id, comprovante_codigo)
  where comprovante_codigo is not null;

notify pgrst, 'reload schema';
