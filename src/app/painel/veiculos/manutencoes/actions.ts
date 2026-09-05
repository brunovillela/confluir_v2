"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Veículos › Manutenções — escrita.
 *
 * REGISTRAR exige `veiculos_manutencao` (ou `veiculos_gestao` como retaguarda),
 * na mesma lógica do checklist: quem lança manutenção não é qualquer pessoa com
 * acesso a Veículos. PROGRAMAR preventivas exige `veiculos_gestao`.
 */

const BASE = "/painel/veiculos/manutencoes"
const MAX_NF = 5 * 1024 * 1024
const TIPOS_NF: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function num(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (!v) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Data + meses, respeitando fim de mês (31/01 + 1 mês = 28/02, não 03/03). */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)
  ).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimoDia))
  return alvo.toISOString().slice(0, 10)
}

// ── Registrar manutenção ─────────────────────────────────────────────────────

export async function salvarManutencao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_manutencao", [
    "veiculos_gestao",
  ])

  const id = txt(fd, "id")
  const veiculoId = txt(fd, "veiculo_id")
  if (!veiculoId) return { erro: "Escolha o veículo." }

  const tipo = txt(fd, "tipo")
  if (tipo !== "preventiva" && tipo !== "corretiva") {
    return { erro: "Escolha se a manutenção é preventiva ou corretiva." }
  }

  const descricao = txt(fd, "descricao")
  if (descricao.length < 5) {
    return { erro: "Descreva o serviço executado." }
  }

  const realizadaEm = txt(fd, "realizada_em")
  if (!realizadaEm) return { erro: "Informe a data da manutenção." }
  if (realizadaEm > new Date().toISOString().slice(0, 10)) {
    return { erro: "A data da manutenção não pode estar no futuro." }
  }

  const hodometro = num(fd, "hodometro")
  if (hodometro !== null && hodometro < 0) {
    return { erro: "Hodômetro inválido." }
  }
  const valor = num(fd, "valor")
  if (valor !== null && valor < 0) return { erro: "Valor inválido." }

  const garantiaMeses = num(fd, "garantia_meses")
  const garantiaKm = num(fd, "garantia_km")

  // Derivadas: guardar o VENCIMENTO já calculado evita recalcular em toda
  // listagem e mantém a garantia correta se o intervalo for editado depois.
  const garantiaAte =
    garantiaMeses && garantiaMeses > 0
      ? somarMeses(realizadaEm, Math.trunc(garantiaMeses))
      : null
  const garantiaHodometro =
    garantiaKm && garantiaKm > 0 && hodometro !== null
      ? hodometro + garantiaKm
      : null

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Nome do local congelado junto — o cadastro do fornecedor pode mudar.
  const localId = txt(fd, "local_id") || null
  let localNome: string | null = null
  if (localId) {
    const { data: forn } = await admin
      .from("empresa")
      .select("nome_fantasia, nome_razao")
      .eq("id", localId)
      .maybeSingle()
    localNome =
      (forn?.nome_fantasia as string | null) ??
      (forn?.nome_razao as string | null) ??
      null
  }

  // Nota fiscal (opcional) no bucket privado do módulo.
  let notaUrl: string | undefined
  const arquivo = fd.get("nota_fiscal")
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > MAX_NF) {
      return { erro: "A nota fiscal deve ter no máximo 5 MB." }
    }
    const extensao = TIPOS_NF[arquivo.type]
    if (!extensao) {
      return { erro: "A nota fiscal deve ser PDF, JPG, PNG ou WebP." }
    }
    const caminho = `manutencoes/${veiculoId}/${Date.now()}.${extensao}`
    const { error: erroUpload } = await admin.storage
      .from("veiculos")
      .upload(caminho, arquivo, { contentType: arquivo.type })
    if (erroUpload) {
      return { erro: `Falha ao subir a nota fiscal: ${erroUpload.message}` }
    }
    notaUrl = caminho
  }

  const dados: Record<string, unknown> = {
    veiculo_id: veiculoId,
    tipo,
    descricao,
    realizada_em: realizadaEm,
    hodometro,
    local_id: localId,
    local_nome: localNome,
    valor,
    compra_id: txt(fd, "compra_id") || null,
    nota_fiscal_numero: txt(fd, "nota_fiscal_numero") || null,
    garantia_meses: garantiaMeses ? Math.trunc(garantiaMeses) : null,
    garantia_km: garantiaKm ? Math.trunc(garantiaKm) : null,
    garantia_ate: garantiaAte,
    garantia_hodometro: garantiaHodometro,
    plano_id: txt(fd, "plano_id") || null,
    observacoes: txt(fd, "observacoes") || null,
    updated_at: new Date().toISOString(),
  }
  // Sem arquivo novo, o anterior é preservado (não sobrescreve com null).
  if (notaUrl) dados.nota_fiscal_url = notaUrl

  const { data: gravado, error } = id
    ? await admin
        .from("veiculos_manutencoes")
        .update(dados)
        .eq("id", id)
        .eq("emp_proprietaria_id", emp)
        .select("id")
        .single()
    : await admin
        .from("veiculos_manutencoes")
        .insert({
          ...dados,
          emp_proprietaria_id: emp,
          registrada_por: sessao.usuario.id,
        })
        .select("id")
        .single()

  if (error || !gravado) {
    return { erro: `Não foi possível salvar: ${error?.message ?? "?"}` }
  }

  revalidatePath(BASE)
  revalidatePath(`/painel/veiculos/${veiculoId}`)
  redirect(`${BASE}/${gravado.id as string}`)
}

export async function excluirManutencao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = txt(fd, "id")
  if (!id) return { erro: "Manutenção não informada." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin
    .from("veiculos_manutencoes")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)

  revalidatePath(BASE)
  redirect(BASE)
}

// ── Preventivas programadas (gestão) ─────────────────────────────────────────

export async function salvarPlano(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = txt(fd, "id")
  const veiculoId = txt(fd, "veiculo_id")
  if (!veiculoId) return { erro: "Escolha o veículo." }

  const descricao = txt(fd, "descricao")
  if (descricao.length < 3) return { erro: "Descreva a manutenção programada." }

  const dias = num(fd, "intervalo_dias")
  const km = num(fd, "intervalo_km")
  if (!dias && !km) {
    return {
      erro: "Informe o intervalo em dias, em quilômetros, ou os dois — sem intervalo o plano nunca vence.",
    }
  }
  if (dias !== null && dias < 0) return { erro: "Intervalo de dias inválido." }
  if (km !== null && km < 0) return { erro: "Intervalo de quilômetros inválido." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const dados = {
    veiculo_id: veiculoId,
    descricao,
    intervalo_dias: dias ? Math.trunc(dias) : null,
    intervalo_km: km ? Math.trunc(km) : null,
    base_data: txt(fd, "base_data") || null,
    base_hodometro: num(fd, "base_hodometro"),
    alerta_dias: Math.trunc(num(fd, "alerta_dias") ?? 15),
    alerta_km: Math.trunc(num(fd, "alerta_km") ?? 500),
    ativo: fd.get("ativo") !== null ? fd.get("ativo") === "on" : true,
    updated_at: new Date().toISOString(),
  }

  const { error } = id
    ? await admin
        .from("veiculos_manutencao_planos")
        .update(dados)
        .eq("id", id)
        .eq("emp_proprietaria_id", emp)
    : await admin
        .from("veiculos_manutencao_planos")
        .insert({ ...dados, emp_proprietaria_id: emp })

  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  revalidatePath(`${BASE}/planos`)
  revalidatePath(BASE)
  revalidatePath(`/painel/veiculos/${veiculoId}`)
  return { ok: id ? "Programação atualizada." : "Programação criada." }
}

export async function removerPlano(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = txt(fd, "id")
  if (!id) return { erro: "Programação não informada." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // As manutenções que cumpriram o plano ficam: o FK é `on delete set null`,
  // então o prontuário não perde nada — só deixa de apontar para a programação.
  const { error } = await admin
    .from("veiculos_manutencao_planos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível remover: ${error.message}` }

  revalidatePath(`${BASE}/planos`)
  return { ok: "Programação removida." }
}
