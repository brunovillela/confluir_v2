-- Ata de reunião: sigilo do PDF.
--
-- POR QUÊ: as deliberações têm sigilo por item e cada usuário tem um nível
-- (20261031160131_deliberacoes_sigilo_permissoes), mas o PDF da ata traz
-- todas as decisões — quem consultava atas lia no PDF até as restritas
-- (31/10/2026).
--
-- COMO: `reuniao_ata.sigilo_documento` (livre, reservado, restrito; padrão
-- restrito). O link assinado do PDF só é gerado para quem tem nível de
-- sigilo igual ou acima; o bucket `diretoria` é privado e não se lê sem esse
-- link. As atas que já existem ficam restritas (o mais cauteloso); quem
-- registra a ata pode baixar o sigilo quando o PDF não tem nada sensível.
-- Idempotente.

alter table public.reuniao_ata
  add column if not exists sigilo_documento text not null default 'restrito'
    check (sigilo_documento in ('livre', 'reservado', 'restrito'));

comment on column public.reuniao_ata.sigilo_documento is 'Sigilo do PDF da ata: só abre para quem tem nível de sigilo das deliberações igual ou acima (livre, reservado, restrito). Padrão restrito. [lgpd:nenhum]';
