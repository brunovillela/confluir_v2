-- Confluir — Ferramentas › Demandas: registrar quem criou (2026-09-05)
--
-- A tabela `demandas` guardava o RESPONSÁVEL (`membro_responsavel_id`), que é
-- outra coisa: quem vai tocar a demanda, não quem a abriu. Sem o criador não há
-- como permitir que ele — e só ele — apague a própria demanda.
--
-- Linhas antigas ficam com `criado_por` nulo (as que vieram do Bubble não têm
-- essa informação em lugar nenhum). Para elas, o código deixa a exclusão a
-- cargo do RESPONSÁVEL, senão elas ficariam impossíveis de remover.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table demandas add column if not exists criado_por uuid references usuarios(id);

create index if not exists idx_demandas_criado_por
  on demandas (emp_proprietaria_id, criado_por);
