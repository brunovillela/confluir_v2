import "server-only"

import { type SupabaseClient } from "@supabase/supabase-js"

import { avisar, usuariosComPermissao } from "@/lib/db/avisos"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * SEGUIDORES (Onda 4, 23/11/2026): quem segue uma tarefa ou uma demanda
 * recebe os avisos dela sem ser o responsável (evento `item_seguido`):
 *  • tarefa: mensagem nova na conversa, conclusão e atraso;
 *  • demanda: mudança de situação e, nas tarefas dela, mensagem nova e
 *    conclusão.
 * A menção (@Fulano) na conversa inscreve a pessoa na tarefa (origem
 * "mencao"), o que lhe dá acesso à conversa daquela tarefa.
 */

export type Alvo = { tarefaId: string; demandaId?: undefined } | { demandaId: string; tarefaId?: undefined }
type Ambiente = { client?: SupabaseClient; tenantId?: string }

const TABELA = "demandas_seguidores"

function coluna(alvo: Alvo): ["tarefa_id" | "demanda_id", string] {
  return alvo.tarefaId ? ["tarefa_id", alvo.tarefaId] : ["demanda_id", alvo.demandaId as string]
}

/** Se a pessoa segue e quantas pessoas seguem. */
export async function estadoDeSeguir(usuarioId: string, alvo: Alvo): Promise<{ seguindo: boolean; total: number }> {
  const admin = await createAdminClient()
  const [col, id] = coluna(alvo)
  const { data, error } = await admin
    .from(TABELA)
    .select("usuario_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq(col, id)
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return { seguindo: false, total: 0 }
    throw new Error(`Falha ao ler os seguidores: ${error.message}`)
  }
  const ids = (data ?? []).map((l) => String(l.usuario_id))
  return { seguindo: ids.includes(usuarioId), total: ids.length }
}

/** Inscreve a pessoa (sem erro se já segue). */
export async function seguir(usuarioId: string, alvo: Alvo, origem: "manual" | "mencao" = "manual"): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const [col, id] = coluna(alvo)
  const { error } = await admin.from(TABELA).insert({
    emp_proprietaria_id: await tenantAtual(),
    usuario_id: usuarioId,
    [col]: id,
    origem,
  })
  if (error && error.code !== "23505") return { erro: `Não foi possível seguir: ${error.message}` }
  // Já seguia por escolha e agora foi mencionado: a menção vale (abre a conversa).
  if (error && origem === "mencao") {
    await admin.from(TABELA).update({ origem }).eq("usuario_id", usuarioId).eq(col, id)
  }
  return {}
}

export async function deixarDeSeguir(usuarioId: string, alvo: Alvo): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const [col, id] = coluna(alvo)
  const { error } = await admin
    .from(TABELA)
    .delete()
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("usuario_id", usuarioId)
    .eq(col, id)
  if (error) return { erro: `Não foi possível deixar de seguir: ${error.message}` }
  return {}
}

/**
 * A pessoa foi mencionada na conversa da tarefa? Isso lhe dá acesso à
 * conversa (seguir por escolha não dá: só segue quem já vê a tarefa).
 */
export async function mencionadoNaTarefa(tarefaId: string, usuarioId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA)
    .select("id")
    .eq("tarefa_id", tarefaId)
    .eq("usuario_id", usuarioId)
    .eq("origem", "mencao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .limit(1)
  if (error) return false
  return (data ?? []).length > 0
}

/**
 * Quem segue a tarefa ou a demanda dela (sem repetir). Com `amb`, roda fora
 * da requisição (o tick).
 */
export async function seguidoresDe(alvos: { tarefaId?: string | null; demandaId?: string | null }, amb: Ambiente = {}): Promise<string[]> {
  const client = amb.client ?? (await createAdminClient())
  const tenantId = amb.tenantId ?? (await tenantAtual())
  const filtros = [
    alvos.tarefaId ? `tarefa_id.eq.${alvos.tarefaId}` : null,
    alvos.demandaId ? `demanda_id.eq.${alvos.demandaId}` : null,
  ].filter(Boolean)
  if (!filtros.length) return []
  const { data, error } = await client
    .from(TABELA)
    .select("usuario_id")
    .eq("emp_proprietaria_id", tenantId)
    .or(filtros.join(","))
    .limit(500)
  if (error) return []
  return [...new Set((data ?? []).map((l) => String(l.usuario_id)))]
}

/**
 * Avisa quem segue (a tarefa e/ou a demanda), menos quem fez a ação e quem
 * já recebe o aviso por outro caminho (`exceto`). Melhor esforço: chamar
 * dentro de depoisDaResposta.
 */
export async function avisarSeguidores(
  alvos: { tarefaId?: string | null; demandaId?: string | null },
  aviso: { texto: string; link: string; assunto: string; chaveEntrega?: string },
  exceto: (string | null | undefined)[],
  amb: Ambiente = {}
): Promise<number> {
  const fora = new Set(exceto.filter(Boolean) as string[])
  const ids = (await seguidoresDe(alvos, amb)).filter((id) => !fora.has(id))
  if (!ids.length) return 0
  const pessoas = (await usuariosComPermissao(null, [], amb)).filter((p) => ids.includes(p.id))
  return avisar(pessoas, { ...aviso, evento: "item_seguido" }, amb)
}

/** A demanda da tarefa e o título (para os avisos de seguidor). */
export async function vinculoDaTarefa(
  tarefaId: string,
  amb: Ambiente = {}
): Promise<{ titulo: string; demandaId: string | null; responsavelId: string | null; demandanteId: string | null } | null> {
  const client = amb.client ?? (await createAdminClient())
  const { data } = await client
    .from("demandas_check_tarefas")
    .select("titulo, demanda_id, demandado_id, demandante_id")
    .eq("id", tarefaId)
    .eq("emp_proprietaria_id", amb.tenantId ?? (await tenantAtual()))
    .maybeSingle()
  if (!data) return null
  return {
    titulo: (texto(data.titulo) ?? "(sem título)").slice(0, 120),
    demandaId: texto(data.demanda_id),
    responsavelId: texto(data.demandado_id),
    demandanteId: texto(data.demandante_id),
  }
}

/** Concluir uma tarefa avisa quem segue a tarefa ou a demanda dela. */
export async function avisarConclusaoAosSeguidores(tarefaId: string, quem: string): Promise<void> {
  const t = await vinculoDaTarefa(tarefaId)
  if (!t) return
  await avisarSeguidores(
    { tarefaId, demandaId: t.demandaId },
    {
      texto: `A tarefa "${t.titulo}", que você segue, foi concluída.`,
      link: `/painel/perfil/tarefas?conversa=${tarefaId}`,
      assunto: "Tarefa que você segue foi concluída",
    },
    [quem]
  )
}

export type ItemSeguido = {
  tipo: "tarefa" | "demanda"
  id: string
  titulo: string
  concluido: boolean
  mencao: boolean
}

/** O que a pessoa segue (Meu perfil → Minhas tarefas). */
export async function itensSeguidos(usuarioId: string): Promise<ItemSeguido[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from(TABELA)
    .select("tarefa_id, demanda_id, origem")
    .eq("emp_proprietaria_id", emp)
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return []
  const linhas = data ?? []
  const tarefaIds = linhas.map((l) => texto(l.tarefa_id)).filter((v): v is string => !!v)
  const demandaIds = linhas.map((l) => texto(l.demanda_id)).filter((v): v is string => !!v)
  const [tarefas, demandas] = await Promise.all([
    tarefaIds.length
      ? admin.from("demandas_check_tarefas").select("id, titulo, concluido").in("id", tarefaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    demandaIds.length
      ? admin.from("demandas").select("id, nome, situacao").in("id", demandaIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const porTarefa = new Map((tarefas.data ?? []).map((t) => [String(t.id), t]))
  const porDemanda = new Map((demandas.data ?? []).map((d) => [String(d.id), d]))
  const itens: ItemSeguido[] = []
  for (const l of linhas) {
    const tId = texto(l.tarefa_id)
    const dId = texto(l.demanda_id)
    if (tId && porTarefa.has(tId)) {
      const t = porTarefa.get(tId)!
      itens.push({ tipo: "tarefa", id: tId, titulo: texto(t.titulo) ?? "(sem título)", concluido: t.concluido === true, mencao: l.origem === "mencao" })
    } else if (dId && porDemanda.has(dId)) {
      const d = porDemanda.get(dId)!
      itens.push({ tipo: "demanda", id: dId, titulo: texto(d.nome) ?? "(sem nome)", concluido: d.situacao === "Feito", mencao: false })
    }
  }
  return itens.sort((a, b) => Number(a.concluido) - Number(b.concluido))
}

/** A demanda mudou de situação: avisa quem segue a demanda. */
export async function avisarSituacaoAosSeguidores(demandaId: string, situacao: string, quem: string): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas")
    .select("nome, membro_responsavel_id")
    .eq("id", demandaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return
  const nome = (texto(data.nome) ?? "(sem nome)").slice(0, 120)
  await avisarSeguidores(
    { demandaId },
    {
      texto: `A demanda "${nome}", que você segue, passou para ${situacao}.`,
      link: `/painel/ferramentas/demandas/${demandaId}`,
      assunto: "Demanda que você segue mudou de situação",
    },
    [quem]
  )
}
