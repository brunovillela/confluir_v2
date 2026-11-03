"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  aplicarReajusteSalarial,
  atualizarNivelSalarial,
  baseEmUso,
  criarNivelSalarial,
  TIPOS_AVANCO,
} from "@/lib/db/carreira"
import {
  criarTabelaSalarial,
  excluirTabelaSalarial,
  lerVigencia,
  salvarVigenciaTabela,
  tornarTabelaVigente,
} from "@/lib/db/tabelas-salariais"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Chave dedicada do Bubble libera a seção sem a gestão completa.
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])
}

function revalidar(funcionarioId?: string | null) {
  revalidatePath("/painel/pessoal/niveis")
  revalidatePath("/painel/pessoal/niveis/tabela")
  revalidatePath("/painel/pessoal/niveis/tabelas")
  revalidatePath("/painel/perfil/contracheques")
  if (funcionarioId) {
    revalidatePath(`/painel/pessoal/${funcionarioId}`)
    revalidatePath(`/painel/pessoal/carreira/funcionario/${funcionarioId}`)
  }
}

/** Depois de salvar ou excluir, volta à tela de onde o lançamento foi aberto. */
function destinoDoLancamento(formData: FormData, funcionarioId: string | null, aviso: string) {
  const de = String(formData.get("de") ?? "")
  if (de === "carreira" && funcionarioId) return `/painel/pessoal/carreira/funcionario/${funcionarioId}?${aviso}`
  if (de === "lancamentos") return `/painel/pessoal/niveis?aba=lancamentos&${aviso}`
  return `/painel/pessoal/niveis?${aviso}`
}

function lerCamposLancamento(formData: FormData) {
  const funcionario_id = String(formData.get("funcionario_id") ?? "")
  const tipo_avanco = String(formData.get("tipo_avanco") ?? "")
  const nivel_atual_id = String(formData.get("nivel_atual_id") ?? "")
  const nivel_atual_data = String(formData.get("nivel_atual_data") ?? "")
  const proximo_nivel_id = String(formData.get("proximo_nivel_id") ?? "")
  const proximo_nivel_data = String(formData.get("proximo_nivel_data") ?? "")

  if (!funcionario_id) return { erro: "Escolha o funcionário." }
  if (!(TIPOS_AVANCO as readonly string[]).includes(tipo_avanco)) {
    return { erro: "Escolha o tipo de avanço." }
  }
  if (!nivel_atual_id) return { erro: "Escolha o nível salarial." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nivel_atual_data)) {
    return { erro: "Informe a data em que o nível passou a valer." }
  }
  if (proximo_nivel_data && !/^\d{4}-\d{2}-\d{2}$/.test(proximo_nivel_data)) {
    return { erro: "Data do próximo nível inválida." }
  }
  return {
    funcionario_id,
    tipo_avanco,
    nivel_atual_id,
    nivel_atual_data,
    proximo_nivel_id: proximo_nivel_id || null,
    proximo_nivel_data: proximo_nivel_data || null,
  }
}

export async function criarLancamentoNivel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposLancamento(formData)
  if ("erro" in dados) return dados

  const { erro } = await criarNivelSalarial(dados)
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect(destinoDoLancamento(formData, dados.funcionario_id, "salvo=1"))
}

export async function atualizarLancamentoNivel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Lançamento inválido." }

  const dados = lerCamposLancamento(formData)
  if ("erro" in dados) return dados

  const { erro } = await atualizarNivelSalarial(id, dados)
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect(destinoDoLancamento(formData, dados.funcionario_id, "salvo=1"))
}

export async function excluirLancamentoNivel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Lançamento inválido." }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_nivel_salarial")
    .delete()
    .eq("id", id)
    .select("funcionario_id")
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Lançamento não encontrado." }

  revalidar(data![0].funcionario_id)
  redirect(destinoDoLancamento(formData, data![0].funcionario_id, "excluido=1"))
}

// ── Reajuste salarial linear ───────────────────────────────────────────────

/** Percentual pt-BR ('4,5') → número; janela de sanidade -50%..+100%. */
export async function lerPercentualReajuste(
  bruto: string
): Promise<number | null> {
  const pct = Number(bruto.trim().replace(",", "."))
  if (!bruto.trim() || Number.isNaN(pct) || pct === 0) return null
  if (pct <= -50 || pct > 100) return null
  return pct
}

export async function aplicarReajuste(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Mexe em TODOS os salários — só a gestão completa.
  await requirePermissao("pessoal_gestao")

  const pct = await lerPercentualReajuste(
    String(formData.get("percentual") ?? "")
  )
  if (pct === null) {
    return {
      erro: "Informe um percentual válido (entre -50% e 100%, diferente de zero).",
    }
  }

  const r = await aplicarReajusteSalarial(pct)
  if (r.erro) return { erro: r.erro }

  revalidar()
  redirect(
    `/painel/pessoal/niveis/tabela?reajustado=${encodeURIComponent(
      pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    )}`
  )
}

/** Reajuste que guarda a anterior: gera uma nova tabela, ainda não vigente. */
export async function gerarTabelaComReajuste(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")

  const pct = await lerPercentualReajuste(String(formData.get("percentual") ?? ""))
  if (pct === null) return { erro: "Informe um percentual válido (entre -50% e 100%, diferente de zero)." }
  const vigencia = lerVigencia(formData)
  if ("erro" in vigencia) return vigencia
  const tabelaId = String(formData.get("tabela_id") ?? "")
  if (!tabelaId) return { erro: "Não há tabela vigente para copiar." }

  const r = await criarTabelaSalarial(vigencia, sessao.usuario.id, { tabelaId, percentual: pct })
  if (r.erro || !r.id) return { erro: r.erro ?? "Não foi possível criar a tabela." }

  revalidar()
  redirect(`/painel/pessoal/niveis/tabelas/${r.id}?salvo=1`)
}

// ── Tabelas salariais (registro e vigência) ────────────────────────────────

export async function salvarTabelaSalarial(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])

  const vigencia = lerVigencia(formData)
  if ("erro" in vigencia) return vigencia

  const id = String(formData.get("id") ?? "")
  if (id) {
    const { erro } = await salvarVigenciaTabela(id, vigencia)
    if (erro) return { erro }
    revalidar()
    redirect(`/painel/pessoal/niveis/tabelas/${id}?salvo=1`)
  }

  const copiarDe = String(formData.get("copiar_de") ?? "")
  const r = await criarTabelaSalarial(vigencia, sessao.usuario.id, copiarDe ? { tabelaId: copiarDe } : undefined)
  if (r.erro || !r.id) return { erro: r.erro ?? "Não foi possível criar a tabela." }

  revalidar()
  redirect(`/painel/pessoal/niveis/tabelas/${r.id}?salvo=1`)
}

export async function tornarVigente(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Muda o salário dos funcionários: só a gestão completa, como o reajuste.
  await requirePermissao("pessoal_gestao")

  const id = String(formData.get("id") ?? "")
  const r = await tornarTabelaVigente(id)
  if (r.erro) return { erro: r.erro }

  revalidar()
  if (r.falhas?.length) {
    return { erro: `A tabela passou a ser a vigente e ${r.movidos} funcionário(s) mudaram de degrau, mas estes falharam: ${r.falhas.join("; ")}` }
  }
  redirect(`/painel/pessoal/niveis/tabelas/${id}?vigente=${r.movidos ?? 0}&sem=${r.semEquivalente ?? 0}`)
}

export async function excluirTabela(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const { erro } = await excluirTabelaSalarial(String(formData.get("id") ?? ""))
  if (erro) return { erro }

  revalidar()
  redirect("/painel/pessoal/niveis/tabelas?excluida=1")
}

// ── Tabela salarial base (degraus do ACT por cargo) ────────────────────────

/** Volta à tabela do degrau (sem ela, a página abre a vigente). */
const paginaDaTabela = (tabelaId: string, extra: string) =>
  `/painel/pessoal/niveis/tabela?${tabelaId ? `tabela=${tabelaId}&` : ""}${extra}`

function lerCamposBase(formData: FormData) {
  const cargo_id = String(formData.get("cargo_id") ?? "")
  const nivel_vertical = String(formData.get("nivel_vertical") ?? "").trim()
  const nivel_horizontal = String(formData.get("nivel_horizontal") ?? "").trim()
  const nivel_carreira = String(formData.get("nivel_carreira") ?? "").trim()
  const ordemBruta = String(formData.get("ordem") ?? "").trim()
  const salarioBruto = String(formData.get("salario_base") ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")

  if (!cargo_id) return { erro: "Escolha o cargo." }
  if (!nivel_vertical) return { erro: "Informe o nível vertical (ex.: 428)." }
  const ordem = ordemBruta ? Number(ordemBruta) : null
  if (ordemBruta && !Number.isInteger(ordem)) {
    return { erro: "A ordem deve ser um número inteiro." }
  }
  const salario_base = Number(salarioBruto)
  if (!salarioBruto || Number.isNaN(salario_base) || salario_base < 0) {
    return { erro: "Informe o salário básico (ex.: 3.000,12)." }
  }
  return {
    cargo_id,
    nivel_vertical,
    nivel_horizontal: nivel_horizontal || null,
    nivel_carreira: nivel_carreira || null,
    ordem,
    salario_base,
  }
}

export async function criarNivelBase(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposBase(formData)
  if ("erro" in dados) return dados
  const tabelaId = String(formData.get("tabela_id") ?? "")
  if (!tabelaId) return { erro: "Cadastre a tabela salarial antes de adicionar degraus." }

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_nivel_salarial_base").insert({
    ...dados,
    tabela_id: tabelaId,
    emp_proprietaria_id: await tenantAtual(),
    sindicato_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }

  revalidar()
  redirect(paginaDaTabela(tabelaId, "salvo=1"))
}

export async function atualizarNivelBase(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Degrau inválido." }

  const dados = lerCamposBase(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_nivel_salarial_base")
    .update(dados, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Degrau não encontrado." }

  revalidar()
  redirect(paginaDaTabela(String(formData.get("tabela_id") ?? ""), "salvo=1"))
}

export async function excluirNivelBase(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Degrau inválido." }

  const emUso = await baseEmUso("pessoal_nivel_salarial", id)
  if (emUso > 0) {
    return {
      erro: `Este degrau é usado por ${emUso} lançamento${emUso === 1 ? "" : "s"} — não pode ser excluído.`,
    }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_nivel_salarial_base")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Degrau não encontrado." }

  revalidar()
  return { ok: "Degrau excluído." }
}
