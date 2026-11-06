-- Viagens: quem entra no quadro já pode pedir viagem para si.
--
-- POR QUÊ: `viagens_solicitar` (20261103204610) foi dada a quem estava no
-- quadro naquele dia. Funcionário contratado ou diretor que ganha conta depois
-- ficava sem poder pedir até alguém marcar a permissão — antes dela, bastava
-- estar no quadro (06/11/2026).
--
-- COMO: gatilhos marcam `viagens_solicitar` (criando a linha de
-- `permissoes` se a pessoa não tiver) quando:
--   - entra um vínculo trabalhista em vigor com a própria entidade;
--   - um integrante da diretoria é cadastrado com usuário, ou recebe um
--     usuário depois (diretor que ganha conta).
-- Só na entrada: quem teve a permissão retirada não a recebe de volta numa
-- alteração qualquer, apenas num vínculo novo ou ao ser ligado a um usuário.
-- Pedir continua exigindo o quadro na hora do pedido. Também alcança quem
-- entrou entre a migração anterior e esta. Idempotente.

create or replace function public.conceder_viagens_solicitar(p_usuario uuid, p_emp uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_usuario is null or p_emp is null
     or not exists (select 1 from public.usuarios where id = p_usuario) then
    return;
  end if;
  if exists (select 1 from public.permissoes where usuario_id = p_usuario) then
    update public.permissoes
    set viagens_solicitar = true
    where usuario_id = p_usuario and coalesce(viagens_solicitar, false) = false;
  else
    insert into public.permissoes (usuario_id, emp_proprietaria_id, viagens_solicitar)
    values (p_usuario, p_emp, true);
  end if;
end;
$$;

revoke all on function public.conceder_viagens_solicitar(uuid, uuid) from public, anon, authenticated;

comment on function public.conceder_viagens_solicitar(uuid, uuid) is 'Marca viagens_solicitar para o usuário (cria a linha de permissoes se faltar). Usada pelos gatilhos de entrada no quadro.';

create or replace function public.viagens_solicitar_ao_entrar_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.contrato_demissao is null and new.empregador_id = new.emp_proprietaria_id then
    perform public.conceder_viagens_solicitar(new.trabalhador_id, new.emp_proprietaria_id);
  end if;
  return new;
end;
$$;

create or replace function public.viagens_solicitar_ao_entrar_diretoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.usuario_id is not null
     and new.situacao is distinct from 'excluido'
     and (tg_op = 'INSERT' or old.usuario_id is distinct from new.usuario_id) then
    perform public.conceder_viagens_solicitar(new.usuario_id, new.emp_proprietaria_id);
  end if;
  return new;
end;
$$;

revoke all on function public.viagens_solicitar_ao_entrar_vinculo() from public, anon, authenticated;
revoke all on function public.viagens_solicitar_ao_entrar_diretoria() from public, anon, authenticated;

drop trigger if exists viagens_solicitar_ao_entrar on public.vinculos_trabalhistas;
create trigger viagens_solicitar_ao_entrar
  after insert on public.vinculos_trabalhistas
  for each row execute function public.viagens_solicitar_ao_entrar_vinculo();

drop trigger if exists viagens_solicitar_ao_entrar on public.diretoria_integrantes;
create trigger viagens_solicitar_ao_entrar
  after insert or update of usuario_id on public.diretoria_integrantes
  for each row execute function public.viagens_solicitar_ao_entrar_diretoria();

-- Quem entrou depois da migração anterior (aplicada em 03/11 à noite).
select public.conceder_viagens_solicitar(v.trabalhador_id, v.emp_proprietaria_id)
from public.vinculos_trabalhistas v
where v.created_at >= '2026-11-03 23:00:00+00'
  and v.contrato_demissao is null
  and v.empregador_id = v.emp_proprietaria_id;

select public.conceder_viagens_solicitar(i.usuario_id, i.emp_proprietaria_id)
from public.diretoria_integrantes i
where i.created_at >= '2026-11-03 23:00:00+00'
  and i.usuario_id is not null
  and i.situacao is distinct from 'excluido';
