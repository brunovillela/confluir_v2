import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Notificações internas — tabela `notificacoes` MIGRADA do Bubble (veio
 * vazia): `notificacao` é o texto, `notificado` marca a leitura e as FKs
 * `contracheque_id_fk`/`registro_ponto_id_fk` apontam o item que originou o
 * aviso (o destino ao clicar é derivado delas). `notificacao_data` é a data
 * do aviso. Sino no header do painel + histórico em /painel/notificacoes.
 */

export type Notificacao = {
  id: string
  usuario_id: string | null
  notificacao: string | null
  notificado: boolean | null
  notificacao_data: string | null
  contracheque_id_fk: string | null
  registro_ponto_id_fk: string | null
  created_at: string | null
}

/** Destino ao abrir a notificação, derivado da origem do aviso. */
export function destinoDaNotificacao(n: Notificacao): string {
  if (n.contracheque_id_fk || n.registro_ponto_id_fk) {
    return "/painel/perfil/contracheques"
  }
  return "/painel/notificacoes"
}

export async function criarNotificacao(dados: {
  usuarioId: string
  texto: string
  contrachequeId?: string | null
  registroPontoId?: string | null
}): Promise<void> {
  const admin = await createAdminClient()
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
  const { error } = await admin.from("notificacoes").insert({
    usuario_id: dados.usuarioId,
    notificacao: dados.texto,
    notificado: false,
    notificacao_data: hoje,
    contracheque_id_fk: dados.contrachequeId ?? null,
    registro_ponto_id_fk: dados.registroPontoId ?? null,
  })
  if (error) {
    throw new Error(`Falha ao criar notificação: ${error.message}`)
  }
}

export async function listarNotificacoes(
  usuarioId: string,
  limite = 100
): Promise<Notificacao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("notificacoes")
    .select(
      "id, usuario_id, notificacao, notificado, notificacao_data, contracheque_id_fk, registro_ponto_id_fk, created_at"
    )
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) throw new Error(`Falha ao listar notificações: ${error.message}`)
  return (data ?? []) as Notificacao[]
}

export async function contarNaoLidas(usuarioId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .eq("notificado", false)
  if (error) return 0
  return count ?? 0
}

/** Marca como lida (só do próprio usuário) e devolve o destino da notificação. */
export async function marcarLida(
  id: string,
  usuarioId: string
): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("notificacoes")
    .update({ notificado: true })
    .eq("id", id)
    .eq("usuario_id", usuarioId)
    .select(
      "id, usuario_id, notificacao, notificado, notificacao_data, contracheque_id_fk, registro_ponto_id_fk, created_at"
    )
    .maybeSingle()
  if (error || !data) return null
  return destinoDaNotificacao(data as Notificacao)
}

export async function marcarTodasLidas(usuarioId: string): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from("notificacoes")
    .update({ notificado: true })
    .eq("usuario_id", usuarioId)
    .eq("notificado", false)
}
