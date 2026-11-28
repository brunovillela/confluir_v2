import "server-only"

import {
  aplicarChecklistAosApontamentos,
  apontamentosAbertos,
  type RespostaApontamento,
} from "@/lib/db/veiculos-apontamentos"
import { listarItens, type SituacaoItem } from "@/lib/db/veiculos-checklist"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Gravação do checklist — a MESMA para a tela (Veículos › Checklist) e para o
 * bot do Telegram (/checklist do carro dedicado, lib/telegram-checklist.ts).
 * Quem chama já conferiu a permissão; aqui ficam as regras do registro:
 *
 * - toda categoria ativa precisa de resposta (o "não se aplica" existe para
 *   não obrigar a mentir);
 * - item não conforme precisa de descrição;
 * - cada apontamento em aberto do veículo precisa dizer se permanece ou foi
 *   sanado — só essa resposta encerra um apontamento.
 */

export type EntradaItemChecklist = { situacao: string; observacao: string }
export type EntradaApontamentoChecklist = { resposta: string; observacao: string }

export async function gravarChecklist(p: {
  veiculoId: string
  inspetorId: string
  hodometro: number | null
  observacoes: string | null
  /** Por item_id. */
  itens: Record<string, EntradaItemChecklist | undefined>
  /** Por id do apontamento: "permanece" | "sanado". */
  apontamentos: Record<string, EntradaApontamentoChecklist | undefined>
}): Promise<{ id?: string; erro?: string }> {
  const itens = await listarItens(true)
  if (itens.length === 0) {
    return { erro: "Nenhum item de verificação cadastrado. Fale com a gestão da frota." }
  }

  const abertos = await apontamentosAbertos(p.veiculoId)
  const respostasApont: RespostaApontamento[] = []
  const novos: { item_id: string; categoria: string; descricao: string | null }[] = []
  const lerApontamento = (a: (typeof abertos)[number]) => {
    const r = p.apontamentos[a.id]?.resposta
    return r === "permanece" || r === "sanado" ? r : null
  }

  const respostas: {
    item_id: string
    categoria: string
    situacao: SituacaoItem
    observacao: string | null
  }[] = []
  for (const item of itens) {
    const aberto = abertos.find((a) => a.item_id === item.id)
    const obs = (p.itens[item.id]?.observacao ?? "").trim()
    if (aberto) {
      const r = lerApontamento(aberto)
      if (!r) {
        return { erro: `Diga se o apontamento de "${item.categoria}" permanece ou foi sanado.` }
      }
      if (r === "permanece") {
        // O problema segue: o item fica não conforme, com o que se viu agora
        // (ou a descrição original, se o inspetor não acrescentou nada).
        const obsApont = (p.apontamentos[aberto.id]?.observacao ?? "").trim() || obs
        respostasApont.push({ apontamentoId: aberto.id, permanece: true, observacao: obsApont || null })
        respostas.push({
          item_id: item.id,
          categoria: item.categoria,
          situacao: "nao_conforme",
          observacao: obsApont || aberto.descricao,
        })
        continue
      }
      respostasApont.push({ apontamentoId: aberto.id, permanece: false, observacao: null })
    }
    const s = p.itens[item.id]?.situacao as SituacaoItem
    if (!["conforme", "nao_conforme", "nao_aplica"].includes(s)) {
      return { erro: `Responda a verificação de "${item.categoria}".` }
    }
    if (s === "nao_conforme" && !obs) {
      return {
        erro: `Descreva o problema encontrado em "${item.categoria}" — um item não conforme sem descrição não ajuda a oficina.`,
      }
    }
    if (s === "nao_conforme") novos.push({ item_id: item.id, categoria: item.categoria, descricao: obs })
    respostas.push({
      item_id: item.id,
      categoria: item.categoria,
      situacao: s,
      observacao: obs || null,
    })
  }
  // Apontamento de item que saiu do catálogo: a pergunta continua valendo.
  let orfaosPermanecem = 0
  for (const a of abertos.filter((a) => !itens.some((i) => i.id === a.item_id))) {
    const r = lerApontamento(a)
    if (!r) return { erro: `Diga se o apontamento de "${a.categoria}" permanece ou foi sanado.` }
    if (r === "permanece") orfaosPermanecem++
    respostasApont.push({
      apontamentoId: a.id,
      permanece: r === "permanece",
      observacao: r === "permanece" ? (p.apontamentos[a.id]?.observacao ?? "").trim() || null : null,
    })
  }

  if (p.hodometro !== null && (!Number.isFinite(p.hodometro) || p.hodometro < 0)) {
    return { erro: "Hodômetro inválido." }
  }

  const pendencias = respostas.filter((r) => r.situacao === "nao_conforme").length + orfaosPermanecem
  const realizadoEm = new Date().toISOString()

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: criado, error } = await admin
    .from("veiculos_checklists")
    .insert({
      emp_proprietaria_id: emp,
      veiculo_id: p.veiculoId,
      realizado_em: realizadoEm,
      hodometro: p.hodometro,
      inspetor_id: p.inspetorId,
      observacoes: p.observacoes,
      pendencias,
    })
    .select("id")
    .single()
  if (error || !criado) {
    return { erro: `Não foi possível registrar: ${error?.message ?? "?"}` }
  }

  const checklistId = criado.id as string
  const { error: erroResp } = await admin.from("veiculos_checklist_respostas").insert(
    respostas.map((r) => ({
      emp_proprietaria_id: emp,
      checklist_id: checklistId,
      item_id: r.item_id,
      categoria: r.categoria,
      situacao: r.situacao,
      observacao: r.observacao,
    }))
  )
  if (erroResp) {
    // sem as respostas o checklist não vale nada — desfaz o cabeçalho
    await admin.from("veiculos_checklists").delete().eq("id", checklistId)
    return { erro: `Não foi possível gravar as respostas: ${erroResp.message}` }
  }

  const { erro: erroApont } = await aplicarChecklistAosApontamentos({
    veiculoId: p.veiculoId,
    checklistId,
    realizadoEm,
    inspetorId: p.inspetorId,
    respostas: respostasApont,
    novos,
  })
  if (erroApont) {
    await admin.from("veiculos_checklists").delete().eq("id", checklistId)
    return { erro: erroApont }
  }
  return { id: checklistId }
}
