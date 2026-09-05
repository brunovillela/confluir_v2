"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { listarItens, type SituacaoItem } from "@/lib/db/veiculos-checklist"
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

  const itens = await listarItens(true)
  if (itens.length === 0) {
    return { erro: "Nenhum item de verificação cadastrado. Fale com a gestão da frota." }
  }

  // Toda categoria precisa de resposta — checklist pela metade não serve de
  // registro, e o "não se aplica" existe justamente para não obrigar a mentir.
  const respostas: {
    item_id: string
    categoria: string
    situacao: SituacaoItem
    observacao: string | null
  }[] = []
  for (const item of itens) {
    const s = txt(fd, `situacao_${item.id}`) as SituacaoItem
    if (!["conforme", "nao_conforme", "nao_aplica"].includes(s)) {
      return { erro: `Responda a verificação de "${item.categoria}".` }
    }
    const obs = txt(fd, `obs_${item.id}`)
    if (s === "nao_conforme" && !obs) {
      return {
        erro: `Descreva o problema encontrado em "${item.categoria}" — um item não conforme sem descrição não ajuda a oficina.`,
      }
    }
    respostas.push({
      item_id: item.id,
      categoria: item.categoria,
      situacao: s,
      observacao: obs || null,
    })
  }

  const hodometroBruto = txt(fd, "hodometro")
  const hodometro = hodometroBruto ? Number(hodometroBruto) : null
  if (hodometro !== null && (!Number.isFinite(hodometro) || hodometro < 0)) {
    return { erro: "Hodômetro inválido." }
  }

  const pendencias = respostas.filter((r) => r.situacao === "nao_conforme").length

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: criado, error } = await admin
    .from("veiculos_checklists")
    .insert({
      emp_proprietaria_id: emp,
      veiculo_id: veiculoId,
      realizado_em: new Date().toISOString(),
      hodometro,
      inspetor_id: sessao.usuario.id,
      observacoes: txt(fd, "observacoes") || null,
      pendencias,
    })
    .select("id")
    .single()
  if (error || !criado) {
    return { erro: `Não foi possível registrar: ${error?.message ?? "?"}` }
  }

  const checklistId = criado.id as string
  const { error: erroResp } = await admin
    .from("veiculos_checklist_respostas")
    .insert(
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

  revalidatePath(BASE)
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
