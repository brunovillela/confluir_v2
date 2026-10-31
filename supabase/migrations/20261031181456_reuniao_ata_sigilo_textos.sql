-- Ata de reunião: o sigilo vale também para a pauta e as observações.
--
-- POR QUÊ: depois do PDF e do resumo (20261031161406, 20261031174917), a
-- pauta e as observações eram os textos da ata ainda visíveis a todos que
-- consultam atas — e a pauta de uma reunião restrita já revela o assunto
-- (31/10/2026).
--
-- COMO: sem coluna nova. `reuniao_ata.sigilo_documento` passa a ser o
-- sigilo da ata: PDF, pauta, resumo e observações só vão a quem tem nível
-- igual ou acima. Ficam de fora título, data, local, tipo e presentes.
-- Aqui, só o comentário da coluna. Idempotente.

comment on column public.reuniao_ata.sigilo_documento is 'Sigilo da ata: PDF, pauta, resumo e observações só aparecem para quem tem nível de sigilo das deliberações igual ou acima (livre, reservado, restrito). Título, data, local, tipo e presentes ficam visíveis a quem consulta atas. Padrão restrito. [lgpd:nenhum]';
