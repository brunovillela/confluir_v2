"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { obterConfigRpa, proximoNumeroRpa } from "@/lib/db/compras-rpa"
import {
  calcularPorBruto,
  calcularPorLiquido,
  type OpcoesRpa,
} from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Compras › Contratos › RPA — escrita. Emissão exige a permissão de EDIÇÃO de
 * contratos; a lista/consulta usa a de visualização (nas páginas).
 */

async function exigirEdicao() {
  return requirePermissao("aquisicoes_contratos_edicao")
}

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}
function num(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}
/** Número decimal "solto" (aceita 8157.41 ou 8.157,41). */
function numSolto(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const semMilhar = /,/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v
  const n = Number(semMilhar)
  return Number.isFinite(n) ? n : null
}

export async function emitirRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const fornecedorId = txt(fd, "fornecedor_id")
  const descricao = txt(fd, "descricao_servico")
  const base = txt(fd, "base") === "liquido" ? "liquido" : "bruto"
  const valor = num(fd, "valor")
  if (!fornecedorId) return { erro: "Escolha o prestador (fornecedor)." }
  if (!descricao) return { erro: "Descreva o serviço prestado." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor (ex.: 1.500,00)." }

  const cfg = await obterConfigRpa()
  const op: OpcoesRpa = {
    dependentes: Math.max(0, Math.round(numSolto(fd, "dependentes") ?? 0)),
    reterInss: fd.get("reter_inss") === "on",
    reterIrrf: fd.get("reter_irrf") === "on",
    reterIss: fd.get("reter_iss") === "on",
    issAliquota: numSolto(fd, "iss_aliquota") ?? cfg.iss_aliquota_padrao,
  }
  const r =
    base === "liquido"
      ? calcularPorLiquido(valor, cfg, op)
      : calcularPorBruto(valor, cfg, op)

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // até 3 tentativas para o número sequencial (colisão só com emissão simultânea)
  let rpaId: string | null = null
  let ultimoErro = ""
  for (let i = 0; i < 3 && !rpaId; i++) {
    const numero = await proximoNumeroRpa()
    const { data, error } = await admin
      .from("compras_rpa")
      .insert({
        emp_proprietaria_id: emp,
        numero,
        fornecedor_id: fornecedorId,
        descricao_servico: descricao,
        data_servico: txt(fd, "data_servico"),
        base,
        valor_informado: valor,
        valor_bruto: r.valorBruto,
        inss: r.inss,
        irrf: r.irrf,
        iss: r.iss,
        iss_aliquota: op.reterIss ? op.issAliquota : null,
        dependentes: op.dependentes,
        valor_liquido: r.valorLiquido,
        observacoes: txt(fd, "observacoes"),
        criado_por: sessao.usuario.id,
      })
      .select("id")
      .single()
    if (data) rpaId = data.id as string
    else ultimoErro = error?.message ?? ""
  }
  if (!rpaId) return { erro: `Não foi possível emitir: ${ultimoErro}` }
  revalidatePath("/painel/compras/contratos/rpa")
  redirect(`/painel/compras/contratos/rpa/${rpaId}?salvo=1`)
}

export async function excluirRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = txt(fd, "id")
  if (!id) return { erro: "RPA inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("compras_rpa")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/compras/contratos/rpa")
  redirect("/painel/compras/contratos/rpa?excluido=1")
}

export async function salvarConfigRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const faixas: { ate: number | null; aliquota: number; deduzir: number }[] = []
  for (let i = 0; i < 5; i++) {
    const aliquota = numSolto(fd, `faixa_aliquota_${i}`)
    if (aliquota === null) continue
    const ate = i === 4 ? null : numSolto(fd, `faixa_ate_${i}`)
    if (i < 4 && ate === null) continue
    faixas.push({
      ate,
      aliquota,
      deduzir: numSolto(fd, `faixa_deduzir_${i}`) ?? 0,
    })
  }
  if (faixas.length === 0) return { erro: "Informe a tabela do IRRF." }
  const admin = await createAdminClient()
  const { error } = await admin.from("compras_rpa_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      inss_aliquota: numSolto(fd, "inss_aliquota") ?? 11,
      inss_teto: numSolto(fd, "inss_teto") ?? 0,
      irrf_faixas: faixas,
      irrf_deducao_dependente: numSolto(fd, "irrf_deducao_dependente") ?? 0,
      iss_aliquota_padrao: numSolto(fd, "iss_aliquota_padrao") ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath("/painel/compras/contratos/rpa")
  return { ok: "Tabelas de retenção salvas — valem para os próximos RPAs." }
}
