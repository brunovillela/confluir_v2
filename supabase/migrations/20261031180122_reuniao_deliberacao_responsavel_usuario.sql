-- Deliberações: responsável como usuário do sistema.
--
-- POR QUÊ: o responsável era só texto livre, então o aviso de prazo vencido
-- ia para quem registra as atas, não para quem precisa cumprir a decisão
-- (31/10/2026).
--
-- COMO: `responsavel_id` (usuário, opcional). Com ele preenchido, a
-- deliberação vencida entra na caixa de entrada e no lembrete diário dessa
-- pessoa. O texto livre (`responsavel`) continua para quem não é usuário
-- ("Secretaria-geral", um assessor externo). O sistema só aceita como
-- responsável quem tem nível de sigilo que alcança a deliberação.
-- Idempotente.

alter table public.reuniao_deliberacao
  add column if not exists responsavel_id uuid references public.usuarios(id) on delete set null;

create index if not exists reuniao_deliberacao_responsavel_idx
  on public.reuniao_deliberacao (responsavel_id)
  where responsavel_id is not null;

comment on column public.reuniao_deliberacao.responsavel_id is 'Usuário responsável por cumprir a decisão; recebe o aviso de prazo vencido. Precisa ter nível de sigilo que alcance a deliberação. [lgpd:identificacao]';
comment on column public.reuniao_deliberacao.responsavel is 'Responsável em texto livre, quando não é usuário do sistema (ex.: "Secretaria-geral"). [lgpd:identificacao]';
