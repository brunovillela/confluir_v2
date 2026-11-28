"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { apontamentosAbertos, vincularManutencao } from "@/lib/db/veiculos-apontamentos"
import { listarItens } from "@/lib/db/veiculos-checklist"
import {
  gravarChecklist,
  type EntradaApontamentoChecklist,
  type EntradaItemChecklist,
} from "@/lib/db/veiculos-checklist-gravar"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Veículos › Checklist — escrita.
 *
 * REALIZAR o checklist exige `veiculos_checklist` — a verificação é feita por um
 * FUNCIONÁRIO DEDICADO, não por quem vai dirigir. A gestão da frota
 * (`veiculos_gestao`) também pode, como retaguarda. CONFIGURAR a recorrência e o
 * catálogo exige `veiculos_gestao`.
 */

const BASE = "/painel/veiculos/checklists"

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

// ── Realizar o checklist ─────────────────────────────────────────────────────

export async function registrarChecklist(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_checklist", ["veiculos_gestao"])
  const veiculoId = txt(fd, "veiculo_id")
  if (!veiculoId) return { erro: "Escolha o veículo." }

  // Respostas por item e por apontamento em aberto; as regras do registro
  // (tudo respondido, descrição do não conforme, apontamento permanece ou
  // sanado) ficam em gravarChecklist — as mesmas do /checklist do Telegram.
  const [itens, abertos] = await Promise.all([listarItens(true), apontamentosAbertos(veiculoId)])
  const entradaItens: Record<string, EntradaItemChecklist> = {}
  for (const item of itens) {
    entradaItens[item.id] = { situacao: txt(fd, `situacao_${item.id}`), observacao: txt(fd, `obs_${item.id}`) }
  }
  const entradaApont: Record<string, EntradaApontamentoChecklist> = {}
  for (const a of abertos) {
    // Apontamento de item que saiu do catálogo tem campo de observação próprio.
    const orfao = !itens.some((i) => i.id === a.item_id)
    entradaApont[a.id] = { resposta: txt(fd, `apont_${a.id}`), observacao: orfao ? txt(fd, `obs_apont_${a.id}`) : "" }
  }

  const hodometroBruto = txt(fd, "hodometro")
  const hodometro = hodometroBruto ? Number(hodometroBruto) : null
  const { id: checklistId, erro } = await gravarChecklist({
    veiculoId,
    inspetorId: sessao.usuario.id,
    hodometro,
    observacoes: txt(fd, "observacoes") || null,
    itens: entradaItens,
    apontamentos: entradaApont,
  })
  if (erro || !checklistId) return { erro: erro ?? "Não foi possível registrar o checklist." }

  revalidatePath(BASE)
  revalidatePath("/painel/veiculos")
  revalidatePath(`/painel/veiculos/${veiculoId}/movimentacao`)
  revalidatePath(`/painel/veiculos/${veiculoId}`)
  redirect(`${BASE}/${checklistId}`)
}

export async function excluirChecklist(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = txt(fd, "id")
  if (!id) return { erro: "Checklist não informado." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Apontamento só se encerra por checklist: se ESTE era o que o deu como
  // sanado, ele volta a ficar aberto. Os que este checklist abriu continuam
  // abertos (a FK fica nula) — só um checklist novo os encerra. Um a um: se
  // já houver outro aberto para o mesmo item, o índice único recusa e esse
  // fica resolvido.
  const { data: sanadosAqui } = await admin
    .from("veiculos_checklist_apontamentos")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("checklist_resolucao_id", id)
  for (const a of sanadosAqui ?? []) {
    await admin
      .from("veiculos_checklist_apontamentos")
      .update({ situacao: "aberto", resolvido_em: null, checklist_resolucao_id: null, resolvido_por: null })
      .eq("id", String(a.id))
  }
  // as respostas caem por cascade (on delete cascade no SQL)
  await admin
    .from("veiculos_checklists")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)

  revalidatePath(BASE)
  redirect(BASE)
}

// ── Configuração (gestão) ────────────────────────────────────────────────────

export async function salvarConfig(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const dias = Number(txt(fd, "recorrencia_dias"))
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    return { erro: "A recorrência deve ficar entre 1 e 365 dias." }
  }
  const antecedencia = Number(txt(fd, "alerta_antecedencia_dias") || 0)
  if (!Number.isFinite(antecedencia) || antecedencia < 0 || antecedencia >= dias) {
    return {
      erro: "A antecedência do aviso deve ser menor que a recorrência.",
    }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("veiculos_checklist_config").upsert(
    {
      emp_proprietaria_id: emp,
      recorrencia_dias: dias,
      alerta_antecedencia_dias: antecedencia,
      ativo: fd.get("ativo") === "on",
      atualizada_por: sessao.usuario.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  revalidatePath(`${BASE}/config`)
  revalidatePath(BASE)
  return { ok: "Configuração salva." }
}

export async function salvarItem(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = txt(fd, "id")
  const categoria = txt(fd, "categoria")
  if (!categoria) return { erro: "Informe o sistema ou categoria." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const dados = {
    categoria,
    itens_verificar: txt(fd, "itens_verificar") || null,
    proposito: txt(fd, "proposito") || null,
    ordem: Number(txt(fd, "ordem") || 0) || 0,
    ativo: fd.get("ativo") !== null ? fd.get("ativo") === "on" : true,
    updated_at: new Date().toISOString(),
  }

  const { error } = id
    ? await admin
        .from("veiculos_checklist_itens")
        .update(dados)
        .eq("id", id)
        .eq("emp_proprietaria_id", emp)
    : await admin
        .from("veiculos_checklist_itens")
        .insert({ ...dados, emp_proprietaria_id: emp })

  if (error) {
    const duplicado = /duplicate|unique/i.test(error.message)
    return {
      erro: duplicado
        ? "Já existe um item com esse nome de sistema/categoria."
        : `Não foi possível salvar: ${error.message}`,
    }
  }
  revalidatePath(`${BASE}/config`)
  return { ok: id ? "Item atualizado." : "Item criado." }
}

export async function removerItem(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = txt(fd, "id")
  if (!id) return { erro: "Item não informado." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("veiculos_checklist_itens")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) {
    return {
      erro: "Este item já foi usado em checklists. Desative-o em vez de excluir.",
    }
  }
  revalidatePath(`${BASE}/config`)
  return { ok: "Item removido." }
}

/** Recorrência PRÓPRIA de um veículo (vazio = usa a do tenant). */
export async function salvarRecorrenciaVeiculo(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const veiculoId = txt(fd, "veiculo_id")
  if (!veiculoId) return { erro: "Veículo não informado." }

  const bruto = txt(fd, "checklist_recorrencia_dias")
  let dias: number | null = null
  if (bruto) {
    dias = Number(bruto)
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
      return { erro: "A recorrência deve ficar entre 1 e 365 dias." }
    }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("veiculos")
    .update({ checklist_recorrencia_dias: dias })
    .eq("id", veiculoId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  revalidatePath(`/painel/veiculos/${veiculoId}`)
  revalidatePath(BASE)
  return {
    ok: dias
      ? `Este veículo passa a exigir checklist a cada ${dias} dias.`
      : "Este veículo volta a seguir a recorrência padrão da frota.",
  }
}

// ── Apontamentos ─────────────────────────────────────────────────────────────

/**
 * Vincula (ou desvincula) um apontamento a uma manutenção do mesmo veículo.
 * É coisa de quem registra manutenção; a gestão entra como retaguarda. O
 * apontamento segue aberto até um checklist o declarar sanado.
 */
export async function vincularManutencaoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_manutencao", ["veiculos_gestao"])
  const apontamentoId = txt(fd, "apontamento_id")
  if (!apontamentoId) return { erro: "Apontamento não informado." }
  const manutencaoId = txt(fd, "manutencao_id") || null
  const { erro, veiculoId } = await vincularManutencao(apontamentoId, manutencaoId)
  if (erro) return { erro }
  revalidatePath(BASE)
  revalidatePath("/painel/veiculos")
  if (veiculoId) revalidatePath(`/painel/veiculos/${veiculoId}`)
  return {
    ok: manutencaoId
      ? "Manutenção vinculada. O apontamento se encerra quando o próximo checklist o der como sanado."
      : "Vínculo desfeito.",
  }
}
