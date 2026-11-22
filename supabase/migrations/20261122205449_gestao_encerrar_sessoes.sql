-- POR QUÊ: Gestão (22/11/2026). Revogar o acesso de alguém barra o painel na
--   próxima navegação (o proxy confere `permissoes` a cada pedido), mas a
--   sessão de login continuava valendo em todos os aparelhos da pessoa: ela
--   seguia "logada" até sair sozinha. A Gestão passa a encerrar as sessões ao
--   revogar, e a ter o botão "Encerrar sessões" (celular perdido, conta
--   compartilhada, desligamento).
-- COMO: função security definer que apaga as sessões da conta de login
--   (auth.sessions; os refresh tokens saem em cascata) de um usuário DA
--   entidade informada. O token de acesso já emitido expira sozinho em até
--   uma hora, e o painel já está barrado pelo proxy. Só o service role executa.
--   Idempotente.

create or replace function public.encerrar_sessoes_usuario(p_emp uuid, p_usuario uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth uuid;
  v_n integer;
begin
  select auth_user_id into v_auth
    from public.usuarios
   where id = p_usuario
     and emp_proprietaria_id = p_emp;
  if v_auth is null then
    return 0;
  end if;
  delete from auth.sessions where user_id = v_auth;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.encerrar_sessoes_usuario(uuid, uuid) from public, anon, authenticated;
grant execute on function public.encerrar_sessoes_usuario(uuid, uuid) to service_role;
comment on function public.encerrar_sessoes_usuario(uuid, uuid) is 'Encerra todas as sessões de login de um usuário da entidade (Gestão: revogar acesso e "Encerrar sessões", 22/11/2026). Devolve quantas sessões saíram.';
