-- Confluir — Permissões dos usuários do hotel por área (2026-10-02)
--
-- Como no painel administrativo (ver × editar): cada usuário do hotel tem, por
-- área da interface do hotel (Cupons, Cupom emergencial, Reservas, Hóspedes,
-- Recepção, Avaliações, Faturamento, Dados bancários, Acordo), "sem acesso",
-- "ver" ou "editar" — {"reservas": "editar", "faturamento": "ver", ...}.
-- Início e Ajuda são sempre liberados. A gestão define no painel, em
-- Hospedagem › Hotel › Usuários do hotel.
--
-- NULO = acesso completo (como era até aqui): os usuários já cadastrados não
-- perdem nada até alguém configurar.
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase.

alter table public.hospedagem_hotel_usuarios
  add column if not exists permissoes jsonb;

comment on column public.hospedagem_hotel_usuarios.permissoes is
  'Acesso por área da interface do hotel: {"<area>": "ver"|"editar"}; área ausente = sem acesso; NULO = acesso completo.';

notify pgrst, 'reload schema';
