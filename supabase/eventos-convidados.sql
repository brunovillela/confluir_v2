-- Confluir — Eventos: cota de convidados (2026-09-05)
--
-- Parte das vagas de um evento não vai para o público: fica guardada para os
-- convidados que a entidade lança de dentro (diretoria, autoridades, imprensa,
-- parceiros). Sem essa reserva, o link público esgota o auditório antes de a
-- secretaria ter lançado a lista de convidados — e aí não há o que fazer.
--
-- `cota_convidados` é quantas vagas ficam guardadas. O público enxerga
-- `vagas - cota_convidados`; a soma continua limitada pela lotação do local.
--
-- `convidado_por` guarda a convite de QUEM a pessoa vem. Não é a mesma coisa
-- que `reservada_por`: quem digita costuma ser a secretaria, e quem convida é
-- o diretor. Na porta e na prestação de contas, o nome que importa é o do
-- anfitrião.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table eventos add column if not exists cota_convidados integer;
alter table eventos_inscricoes add column if not exists convidado_por text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_cota_convidados') then
    alter table eventos add constraint ck_eventos_cota_convidados
      check (cota_convidados is null or cota_convidados >= 0) not valid;
  end if;
end $$;

-- A lista de convidados é lida por anfitrião com frequência ("quem o Fulano
-- trouxe?"), e a importação confere CPF repetido a cada linha.
create index if not exists idx_eventos_insc_convidado_por
  on eventos_inscricoes (emp_proprietaria_id, evento_id, convidado_por)
  where convidado_por is not null;
create index if not exists idx_eventos_insc_reservada_por
  on eventos_inscricoes (evento_id, reservada_por)
  where reservada_por is not null;
