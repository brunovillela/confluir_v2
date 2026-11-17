-- Confluir — "O que mudou" na versão do termo de privacidade (LGPD)
--
-- POR QUÊ: com o Primeiro acesso exigindo o termo em vigor (Filiados › Área
-- do associado), cada versão nova do termo LGPD faz toda a base aceitá-lo de
-- novo no próximo acesso ao portal. O associado tinha de reler o texto
-- inteiro para descobrir o que mudou, e a LGPD (art. 8º, § 6º) pede que a
-- mudança seja informada com destaque e de forma específica. Análise de
-- 16/11/2026.
--
-- COMO: um resumo opcional, escrito por quem publica a versão em Filiados ›
-- Termos legais, mostrado no passo de renovação do primeiro acesso, acima do
-- texto. Só no termo LGPD (o de desconto não passa pelo primeiro acesso).
-- Idempotente.

alter table public.filiacao_tl_lgpd
  add column if not exists o_que_mudou text;

comment on column public.filiacao_tl_lgpd.o_que_mudou is 'Resumo do que mudou em relação à versão anterior, escrito por quem publica; aparece ao associado no passo de renovação do primeiro acesso. [lgpd:nenhum]';
