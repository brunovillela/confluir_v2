import "server-only"

import { esquemaAusente, lerEmLotes, nomesDosUsuarios } from "@/lib/db/comum"
import { listarDias, listarInscricoes, type DiaEvento } from "@/lib/db/eventos"
import { hojeEmSP } from "@/lib/hospedagem-garantida-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Presenças lançadas depois, pela página do evento (27/11/2026).
 *
 * A porta registra uma pessoa por vez e só com o evento publicado. Aqui a
 * gestão marca e desmarca numa lista — a partir da lista de assinatura em
 * papel, por exemplo —, com o evento já encerrado inclusive. A presença
 * lançada aqui sai com `metodo = 'manual'`; lançar e retirar ficam na trilha
 * `eventos_presencas_ajustes`, porque retirar apaga a linha da presença.
 */

export type PessoaNoLancamento = {
  inscricaoId: string
  nome: string | null
  cpf: string | null
  situacao: string
  filiado: boolean
  convidado: boolean
  presente: boolean
  /** Como entrou: qr/busca (porta) ou manual (lançada aqui). */
  metodo: string | null
  confirmadaEm: string | null
  confirmadaPorNome: string | null
}

/** O dia pode receber presença: é do evento e não está no futuro. */
export function diaLancavel(dia: Pick<DiaEvento, "data">): boolean {
  return dia.data <= hojeEmSP()
}

/**
 * Quem aparece na lista de um dia: os confirmados e, em qualquer situação,
 * quem já tem presença naquele dia (para poder retirar). Pendentes, recusados
 * e lista de espera sem presença ficam fora; anonimizados nunca entram.
 */
export async function pessoasDoDia(eventoId: string, diaId: string): Promise<PessoaNoLancamento[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [inscricoes, presencas] = await Promise.all([
    listarInscricoes({ eventoId, situacao: "todas" }),
    lerEmLotes<{ inscricao_id: string; metodo: string; confirmada_em: string; confirmada_por: string | null }>(
      (de, ate) =>
        admin
          .from("eventos_presencas")
          .select("inscricao_id, metodo, confirmada_em, confirmada_por")
          .eq("emp_proprietaria_id", emp)
          .eq("dia_id", diaId)
          .order("id")
          .range(de, ate)
    ),
  ])
  const porInscricao = new Map(presencas.map((p) => [p.inscricao_id, p]))
  const nomes = await nomesDosUsuarios(
    presencas.map((p) => p.confirmada_por).filter((id): id is string => !!id)
  )
  return inscricoes
    .filter((i) => !i.anonimizada_em && (i.situacao === "confirmada" || porInscricao.has(i.id)))
    .map((i) => {
      const p = porInscricao.get(i.id)
      return {
        inscricaoId: i.id,
        nome: i.nome,
        cpf: i.cpf,
        situacao: i.situacao,
        filiado: !!i.filiacao_id,
        convidado: !!i.reservada_por,
        presente: !!p,
        metodo: p?.metodo ?? null,
        confirmadaEm: p?.confirmada_em ?? null,
        confirmadaPorNome: p?.confirmada_por ? (nomes.get(p.confirmada_por) ?? null) : null,
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
}

/**
 * Grava o que mudou na lista: `marcar` ganha presença (método manual),
 * `retirar` perde. Só aceita inscrições do evento, não anonimizadas; marcar
 * exige inscrição confirmada (como na porta). Devolve as que de fato
 * ganharam presença, para o prontuário.
 */
export async function ajustarPresencas(input: {
  eventoId: string
  diaId: string
  marcar: string[]
  retirar: string[]
  usuarioId: string
}): Promise<{ erro?: string; lancadas?: string[]; retiradas?: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const dia = (await listarDias(input.eventoId)).find((d) => d.id === input.diaId)
  if (!dia) return { erro: "Dia não encontrado neste evento." }
  if (!diaLancavel(dia)) return { erro: "Esse dia ainda não chegou — a presença se lança no dia ou depois." }

  const ids = [...new Set([...input.marcar, ...input.retirar])]
  if (ids.length === 0) return { lancadas: [], retiradas: 0 }
  if (ids.length > 2000) return { erro: "Mudanças demais de uma vez; salve em partes." }

  const inscricoes = await lerEmLotes<{ id: string; situacao: string; anonimizada_em: string | null }>(
    (de, ate) =>
      admin
        .from("eventos_inscricoes")
        .select("id, situacao, anonimizada_em")
        .eq("emp_proprietaria_id", emp)
        .eq("evento_id", input.eventoId)
        .order("id")
        .range(de, ate)
  )
  const doEvento = new Map(inscricoes.map((i) => [i.id, i]))
  const fora = ids.filter((id) => !doEvento.get(id) || doEvento.get(id)!.anonimizada_em)
  if (fora.length > 0) return { erro: "A lista mudou enquanto você marcava. Recarregue a página e confira." }
  const naoConfirmadas = input.marcar.filter((id) => doEvento.get(id)!.situacao !== "confirmada")
  if (naoConfirmadas.length > 0) {
    return { erro: "Só quem está com a inscrição confirmada pode receber presença. Recarregue a página e confira." }
  }

  // Todas as presenças do dia (lote, não .in() com milhares de ids na URL).
  const existentes = await lerEmLotes<{ inscricao_id: string }>((de, ate) =>
    admin
      .from("eventos_presencas")
      .select("inscricao_id")
      .eq("emp_proprietaria_id", emp)
      .eq("dia_id", input.diaId)
      .order("id")
      .range(de, ate)
  )
  const jaPresentes = new Set(existentes.map((p) => p.inscricao_id))

  const novas = input.marcar.filter((id) => !jaPresentes.has(id))
  const sair = input.retirar.filter((id) => jaPresentes.has(id))

  if (novas.length > 0) {
    const { error } = await admin.from("eventos_presencas").insert(
      novas.map((inscricao_id) => ({
        emp_proprietaria_id: emp,
        inscricao_id,
        dia_id: input.diaId,
        confirmada_por: input.usuarioId,
        metodo: "manual",
      }))
    )
    if (error) return { erro: `Não foi possível lançar as presenças: ${error.message}` }
  }
  for (let i = 0; i < sair.length; i += 200) {
    const { error } = await admin
      .from("eventos_presencas")
      .delete()
      .eq("emp_proprietaria_id", emp)
      .eq("dia_id", input.diaId)
      .in("inscricao_id", sair.slice(i, i + 200))
    if (error) return { erro: `Não foi possível retirar as presenças: ${error.message}` }
  }

  const trilha = [
    ...novas.map((inscricao_id) => ({ inscricao_id, acao: "lancou" })),
    ...sair.map((inscricao_id) => ({ inscricao_id, acao: "retirou" })),
  ].map((t) => ({
    ...t,
    emp_proprietaria_id: emp,
    evento_id: input.eventoId,
    dia_id: input.diaId,
    usuario_id: input.usuarioId,
  }))
  if (trilha.length > 0) {
    // A trilha não desfaz o que já foi gravado: falha só fica no log.
    const { error } = await admin.from("eventos_presencas_ajustes").insert(trilha)
    if (error) console.error("eventos_presencas_ajustes:", error.message)
  }

  return { lancadas: novas, retiradas: sair.length }
}

export type AjustePresenca = {
  id: string
  acao: "lancou" | "retirou"
  nome: string | null
  dia: string | null
  usuarioNome: string | null
  em: string
}

/** Últimos lançamentos e retiradas à mão do evento, do mais recente. */
export async function ajustesDePresenca(eventoId: string, limite = 30): Promise<AjustePresenca[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("eventos_presencas_ajustes")
    .select("id, acao, inscricao_id, dia_id, usuario_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os ajustes de presença: ${error.message}`)
  }
  const linhas = data ?? []
  if (linhas.length === 0) return []
  const inscIds = [...new Set(linhas.map((l) => l.inscricao_id as string | null).filter((x): x is string => !!x))]
  const [{ data: insc }, dias, nomes] = await Promise.all([
    inscIds.length
      ? admin.from("eventos_inscricoes").select("id, nome").eq("emp_proprietaria_id", emp).in("id", inscIds)
      : Promise.resolve({ data: [] as { id: string; nome: string | null }[] }),
    listarDias(eventoId),
    nomesDosUsuarios(linhas.map((l) => l.usuario_id as string | null).filter((x): x is string => !!x)),
  ])
  const nomeInsc = new Map((insc ?? []).map((i) => [i.id as string, (i.nome as string | null) ?? null]))
  const dataDia = new Map(dias.map((d) => [d.id, d.data]))
  return linhas.map((l) => ({
    id: l.id as string,
    acao: l.acao as "lancou" | "retirou",
    nome: l.inscricao_id ? (nomeInsc.get(l.inscricao_id as string) ?? null) : null,
    dia: l.dia_id ? (dataDia.get(l.dia_id as string) ?? null) : null,
    usuarioNome: l.usuario_id ? (nomes.get(l.usuario_id as string) ?? null) : null,
    em: l.created_at as string,
  }))
}
