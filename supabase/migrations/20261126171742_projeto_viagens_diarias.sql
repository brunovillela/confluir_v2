-- Viagens e diárias no projeto.
--
-- POR QUÊ: pedido de 26/11/2026. O gasto do projeto não via as passagens, as
-- hospedagens nem as diárias: a fatura da agência vira UMA ordem para várias
-- viagens (de projetos diferentes) e a remessa de diárias vira UMA ordem por
-- pessoa e mês (com atividades de projetos diferentes). Por isso o projeto
-- não fica na ordem, e sim no pedido — a viagem e a diária —, e o gasto do
-- projeto soma o valor de cada item/diária pela situação da ordem que o pagou.
--
-- COMO:
--  • viagens_solicitacoes.projeto_id e pessoal_diarias_solicitacoes.projeto_id
--    (opcionais, set null), com índice parcial.
--  • O livro financeiro_transferencias_projeto aceita tipo 'viagem', com
--    viagem_id. Idempotente.

alter table public.viagens_solicitacoes
  add column if not exists projeto_id uuid references public.projeto(id) on delete set null;
create index if not exists viagens_solicitacoes_projeto_idx
  on public.viagens_solicitacoes (emp_proprietaria_id, projeto_id) where projeto_id is not null;
comment on column public.viagens_solicitacoes.projeto_id is 'Projeto a que a viagem pertence (opcional). As passagens e hospedagens dela entram no gasto do projeto. [lgpd:nenhum]';

alter table public.pessoal_diarias_solicitacoes
  add column if not exists projeto_id uuid references public.projeto(id) on delete set null;
create index if not exists pessoal_diarias_solicitacoes_projeto_idx
  on public.pessoal_diarias_solicitacoes (emp_proprietaria_id, projeto_id) where projeto_id is not null;
comment on column public.pessoal_diarias_solicitacoes.projeto_id is 'Projeto da atividade que gerou a diária (opcional). A diária (com as despesas) entra no gasto do projeto. [lgpd:nenhum]';

alter table public.financeiro_transferencias_projeto
  add column if not exists viagem_id uuid references public.viagens_solicitacoes(id) on delete set null;
alter table public.financeiro_transferencias_projeto
  drop constraint if exists financeiro_transferencias_projeto_tipo_check;
alter table public.financeiro_transferencias_projeto
  add constraint financeiro_transferencias_projeto_tipo_check check (tipo in ('compra', 'ordem', 'custeio', 'viagem'));
comment on column public.financeiro_transferencias_projeto.viagem_id is 'A viagem transferida (tipo viagem). [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.tipo is 'compra = a solicitação de compra com as ordens dela; custeio = o custeio institucional com as ordens dele; viagem = a viagem com as passagens e hospedagens; ordem = a ordem lançada direto no projeto. [lgpd:nenhum]';
