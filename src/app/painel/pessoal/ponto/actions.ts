"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { depoisDaResposta } from "@/lib/db/avisos"
import { notificarLiberacaoPessoal, proximaOrdemRemessa } from "@/lib/db/pessoal"
import { lerEspelhoDoRegistro } from "@/lib/db/ponto-marcacoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { duasCasas, lerHoras } from "@/lib/horas"

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

async function exigirGestao() {
  await requirePermissao("pessoal_gestao")
}

function revalidar(remessaId?: string) {
  revalidatePath("/painel/pessoal/ponto")
  if (remessaId) revalidatePath(`/painel/pessoal/ponto/${remessaId}`)
  revalidatePath("/painel/perfil/contracheques")
}

/** Remessa finalizada não aceita inclusão, edição ou exclusão de itens. */
async function remessaAberta(
  remessaId: string
): Promise<{ ordem: number | null; nome: string | null } | { erro: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, ordem, nome_remessa, finalizada")
    .eq("id", remessaId)
    .maybeSingle()
  if (!data) return { erro: "Remessa não encontrada." }
  if (data.finalizada === true) {
    return {
      erro: "A remessa está finalizada — reabra a remessa para mexer nos registros.",
    }
  }
  return { ordem: data.ordem, nome: data.nome_remessa }
}

function lerCamposRemessa(formData: FormData) {
  const mes = String(formData.get("mes_referencia_os") ?? "")
  const ano = String(formData.get("ano_referencia_os") ?? "").trim()
  if (!MESES.includes(mes)) return { erro: "Escolha o mês de referência." }
  if (!/^\d{4}$/.test(ano)) return { erro: "Informe o ano de referência (AAAA)." }
  return {
    mes_referencia_os: mes,
    ano_referencia_os: ano,
    nome_remessa: `${mes}/${ano}`,
    finalizada: formData.get("finalizada") === "on",
  }
}

export async function criarRemessaPonto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirGestao()

  const dados = lerCamposRemessa(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_registro_ponto_remessas")
    .insert({
      ...dados,
      ordem: await proximaOrdemRemessa("pessoal_registro_ponto_remessas"),
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível criar a remessa: ${error?.message}` }
  }

  revalidar(data.id)
  redirect(`/painel/pessoal/ponto/${data.id}?salvo=1`)
}

export async function atualizarRemessaPonto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirGestao()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Remessa inválida." }

  const dados = lerCamposRemessa(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_registro_ponto_remessas")
    .update(dados, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Remessa não encontrada." }

  revalidar(id)
  redirect(`/painel/pessoal/ponto/${id}?salvo=1`)
}

/** Exclusão só de remessa VAZIA. */
export async function excluirRemessaPonto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirGestao()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Remessa inválida." }

  const admin = await createAdminClient()
  const { data: remessa } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, finalizada")
    .eq("id", id)
    .maybeSingle()
  if (!remessa) return { erro: "Remessa não encontrada." }
  if (remessa.finalizada === true) {
    return { erro: "Remessa finalizada não pode ser excluída — reabra antes." }
  }

  const { count } = await admin
    .from("pessoal_registro_ponto")
    .select("id", { count: "exact", head: true })
    .eq("remessa_id", id)
  if ((count ?? 0) > 0) {
    return {
      erro: `A remessa tem ${count} registro${count === 1 ? "" : "s"} de ponto — exclua os registros antes.`,
    }
  }

  const { error } = await admin
    .from("pessoal_registro_ponto_remessas")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  revalidar()
  redirect("/painel/pessoal/ponto?excluida=1")
}

// ── Registros de ponto da remessa ──────────────────────────────────────────

const CAMPOS_HORAS = [
  ["horas_realizadas_70", "Realizadas 70%"],
  ["horas_pagas_70", "Pagas 70%"],
  ["saldo_remessa_anterior_70", "Saldo da remessa anterior 70%"],
  ["horas_realizadas_100", "Realizadas 100%"],
  ["horas_pagas_100", "Pagas 100%"],
  ["saldo_remessa_anterior_100", "Saldo da remessa anterior 100%"],
] as const

/**
 * Horas digitadas em HH:MM (ou decimal) → decimais com duas casas. O saldo
 * remanescente não vem do formulário: é a conta saldo anterior + realizadas −
 * pagas, para cada percentual.
 */
function lerCamposHoras(formData: FormData): Record<string, number | null> | { erro: string } {
  const horas: Record<string, number | null> = {}
  for (const [campo, rotulo] of CAMPOS_HORAS) {
    const valor = lerHoras(String(formData.get(campo) ?? ""))
    if (valor !== null && Number.isNaN(valor)) {
      return { erro: `Valor inválido em "${rotulo}" — use horas e minutos (ex.: 10:30).` }
    }
    horas[campo] = valor === null ? null : duasCasas(valor)
  }
  for (const pct of ["70", "100"] as const) {
    const partes = [horas[`saldo_remessa_anterior_${pct}`], horas[`horas_realizadas_${pct}`], horas[`horas_pagas_${pct}`]]
    horas[`saldo_remanescente_${pct}`] = partes.every((v) => v === null)
      ? null
      : duasCasas((partes[0] ?? 0) + (partes[1] ?? 0) - (partes[2] ?? 0))
  }
  return horas
}

/** Upload opcional do espelho de ponto (PDF) — retorna caminho ou null. */
async function subirArquivoPonto(
  formData: FormData,
  remessaId: string
): Promise<{ caminho: string | null } | { erro: string }> {
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: null }
  if (arquivo.type !== "application/pdf") {
    return { erro: "O espelho de ponto deve ser um arquivo PDF." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }
  const admin = await createAdminClient()
  const caminho = `ponto/${remessaId}/${Date.now()}.pdf`
  const { error } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

export async function criarRegistroPonto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirGestao()

  const remessaId = String(formData.get("remessa_id") ?? "")
  const funcionarioId = String(formData.get("funcionario_id") ?? "")
  if (!remessaId) return { erro: "Remessa inválida." }
  if (!funcionarioId) return { erro: "Escolha o funcionário." }

  const horas = lerCamposHoras(formData)
  if ("erro" in horas) return horas

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  // Um registro por funcionário na remessa.
  const { data: existente } = await admin
    .from("pessoal_registro_ponto")
    .select("id")
    .eq("remessa_id", remessaId)
    .eq("funcionario_id", funcionarioId)
    .limit(1)
  if ((existente ?? []).length > 0) {
    return { erro: "Este funcionário já tem registro de ponto nesta remessa." }
  }

  const upload = await subirArquivoPonto(formData, remessaId)
  if ("erro" in upload) return upload

  const liberado = formData.get("liberado") === "on"
  const { data: criado, error } = await admin
    .from("pessoal_registro_ponto")
    .insert({
      remessa_id: remessaId,
      funcionario_id: funcionarioId,
      ordem: remessa.ordem,
      liberado,
      arquivo: upload.caminho,
      ...horas,
    })
    .select("id")
    .single()
  if (error || !criado) {
    return { erro: `Não foi possível criar: ${error?.message}` }
  }

  if (liberado) {
    await notificarLiberacaoPessoal(funcionarioId, "ponto", remessa.nome, criado.id)
  }
  // Marcações do espelho para os indicadores (lib/db/ponto-marcacoes), sem fazer esperar.
  if (upload.caminho) depoisDaResposta(() => lerEspelhoDoRegistro(criado.id))

  revalidar(remessaId)
  redirect(`/painel/pessoal/ponto/${remessaId}?salvo=1`)
}

export async function atualizarRegistroPonto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirGestao()

  const id = String(formData.get("id") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  if (!id || !remessaId) return { erro: "Registro inválido." }

  const horas = lerCamposHoras(formData)
  if ("erro" in horas) return horas

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const upload = await subirArquivoPonto(formData, remessaId)
  if ("erro" in upload) return upload

  const admin = await createAdminClient()
  const { data: anterior } = await admin
    .from("pessoal_registro_ponto")
    .select("liberado, funcionario_id")
    .eq("id", id)
    .eq("remessa_id", remessaId)
    .maybeSingle()
  if (!anterior) return { erro: "Registro não encontrado." }

  const liberado = formData.get("liberado") === "on"
  const { error, count } = await admin
    .from("pessoal_registro_ponto")
    .update(
      {
        liberado,
        ...(upload.caminho ? { arquivo: upload.caminho } : {}),
        ...horas,
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("remessa_id", remessaId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Registro não encontrado." }

  if (upload.caminho) depoisDaResposta(() => lerEspelhoDoRegistro(id))

  // Aviso só na TRANSIÇÃO para liberado (não repete a cada edição).
  if (liberado && anterior.liberado !== true && anterior.funcionario_id) {
    await notificarLiberacaoPessoal(
      anterior.funcionario_id,
      "ponto",
      remessa.nome,
      id
    )
  }

  revalidar(remessaId)
  redirect(`/painel/pessoal/ponto/${remessaId}?salvo=1`)
}

export async function excluirRegistroPonto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirGestao()

  const id = String(formData.get("id") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  if (!id || !remessaId) return { erro: "Registro inválido." }

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_registro_ponto")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("remessa_id", remessaId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Registro não encontrado." }

  revalidar(remessaId)
  return { ok: "Registro excluído." }
}
