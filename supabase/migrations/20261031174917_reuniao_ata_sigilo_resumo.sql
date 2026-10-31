-- Ata de reunião: o sigilo do PDF passa a valer também para o resumo.
--
-- POR QUÊ: depois do sigilo do PDF (20261031161406), o resumo era o único
-- texto da ata visível a todos que consultam atas — e pode contar o que foi
-- discutido em reunião reservada ou restrita (31/10/2026).
--
-- COMO: sem coluna nova. `reuniao_ata.sigilo_documento` passa a governar o
-- PDF e o resumo; o código só entrega o resumo a quem tem nível igual ou
-- acima. Aqui, só o comentário da coluna. Idempotente.

comment on column public.reuniao_ata.sigilo_documento is 'Sigilo do PDF e do resumo da ata: só aparecem para quem tem nível de sigilo das deliberações igual ou acima (livre, reservado, restrito). Padrão restrito. [lgpd:nenhum]';
