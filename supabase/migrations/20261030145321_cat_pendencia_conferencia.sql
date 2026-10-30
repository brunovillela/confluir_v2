-- Confluir — Saúde: pendência na conferência da CAT (30/10/2026)
--
-- POR QUÊ: a conferência em fila das CATs gravadas sem conferência
-- (/painel/saude/cat/conferir) tem o botão "Marcar pendência": quem confere
-- encontra algo que não consegue resolver olhando o PDF (página ilegível,
-- dado que falta pedir à empresa) e precisa deixar o motivo registrado, sem
-- validar a CAT.
--
-- COMO: `conferencia_pendencia` guarda o motivo; `pendencia_em/por`, quando
-- e quem marcou. A CAT continua `sem_conferencia`; validar limpa as três.
-- Idempotente.

alter table public.saude_cat
  add column if not exists conferencia_pendencia text,
  add column if not exists pendencia_em timestamptz,
  add column if not exists pendencia_por uuid references public.usuarios(id) on delete set null;

comment on column public.saude_cat.conferencia_pendencia is 'Pendência anotada na conferência da CAT registrada sem conferência (motivo em texto livre; pode citar a lesão). Limpa ao validar. [lgpd:sensivel_saude]';
comment on column public.saude_cat.pendencia_em is 'Quando a pendência da conferência foi marcada.';
comment on column public.saude_cat.pendencia_por is 'Quem marcou a pendência da conferência (usuarios.id). [lgpd:identificacao]';
