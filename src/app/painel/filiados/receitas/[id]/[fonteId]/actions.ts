"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { decodificarCsv, normalizarCabecalho, parseCsv } from "@/lib/csv"
import { invalidarCacheFontes } from "@/lib/db/fontes"
import {
  invalidarCacheRemessa,
  resolverFiliadosLote,
} from "@/lib/db/receitas"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_COMPROVANTE = 3 * 1024 * 1024 // 3mb
const TIPOS_COMPROVANTE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/** '1.234,56' | '1234,56' | '1234.56' → número (ou null). */
function parseValor(bruto: string): number | null {
  const v = bruto.trim()
  if (!v) return null
  const normalizado = v.includes(",")
    ? v.replace(/\./g, "").replace(",", ".")
    : v
  const n = Number(normalizado.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

function idsDoForm(formData: FormData): { remessaId: string; fonteId: string } | null {
  const remessaId = String(formData.get("remessa_id") ?? "")
  const fonteId = String(formData.get("fonte_id") ?? "")
  if (!UUID.test(remessaId) || !UUID.test(fonteId)) return null
  return { remessaId, fonteId }
}

function voltar(remessaId: string, fonteId: string, flag: string): never {
  revalidatePath(`/painel/filiados/receitas/${remessaId}`)
  revalidatePath(`/painel/filiados/receitas/${remessaId}/${fonteId}`)
  redirect(`/painel/filiados/receitas/${remessaId}/${fonteId}?${flag}=1`)
}

// ── Recebimento (depósito) ─────────────────────────────────────────────────

/** Registra (ou atualiza) o depósito, com comprovante no Supabase Storage. */
export async function registrarRecebimento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  if (!ids) return { erro: "Remessa ou fonte inválida." }
  const { remessaId, fonteId } = ids

  const data = String(formData.get("data") ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: "Informe a data do depósito." }
  }
  const valor = parseValor(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) {
    return { erro: "Informe o valor depositado." }
  }

  const admin = await createAdminClient()

  // Comprovante (opcional): arquivo de até 3mb no bucket privado
  let comprovante: string | undefined
  const arquivo = formData.get("comprovante")
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > MAX_COMPROVANTE) {
      return { erro: "O comprovante deve ter no máximo 3 MB." }
    }
    const extensao = TIPOS_COMPROVANTE[arquivo.type]
    if (!extensao) {
      return { erro: "Comprovante deve ser PDF, JPG, PNG ou WebP." }
    }
    const caminho = `${remessaId}/${fonteId}/${Date.now()}.${extensao}`
    const { error: erroUpload } = await admin.storage
      .from("comprovantes")
      .upload(caminho, arquivo, { contentType: arquivo.type })
    if (erroUpload) {
      return { erro: `Falha ao subir o comprovante: ${erroUpload.message}` }
    }
    comprovante = caminho
  }

  const { data: existente } = await admin
    .from("filiacao_recebe_comprovacao")
    .select("id")
    .eq("remessa_id", remessaId)
    .eq("fonte_pg_id", fonteId)
    .limit(1)
    .maybeSingle()

  const dados = { data, valor, ...(comprovante ? { comprovante } : {}) }
  const { error } = existente
    ? await admin
        .from("filiacao_recebe_comprovacao")
        .update(dados)
        .eq("id", existente.id)
    : await admin.from("filiacao_recebe_comprovacao").insert({
        ...dados,
        remessa_id: remessaId,
        fonte_pg_id: fonteId,
        emp_proprietaria_id: await tenantAtual(),
      })
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }

  voltar(remessaId, fonteId, "salvo")
}

// ── Contribuições ──────────────────────────────────────────────────────────

export type ResultadoContribuicoes = {
  identificados: number
  naoEncontrados: number
  erros: { linha: number; motivo: string }[]
}

export type EstadoContribuicoes = {
  erro?: string
  ok?: string
  resultado?: ResultadoContribuicoes
}

const CABECALHOS: Record<string, string> = {
  cpf: "cpf",
  matricula: "matricula",
  matriculafonte: "matricula",
  matriculadafonte: "matricula",
  matriculadafontepagadora: "matricula",
  valor: "valor",
}

const MAX_LINHAS = 10_000

/** Importa a relação de pagamentos (CSV: cpf e/ou matrícula da fonte + valor). */
export async function importarContribuicoes(
  _prev: EstadoContribuicoes,
  formData: FormData
): Promise<EstadoContribuicoes> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  if (!ids) return { erro: "Remessa ou fonte inválida." }
  const { remessaId, fonteId } = ids

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo CSV." }
  }

  const linhasCsv = parseCsv(decodificarCsv(await arquivo.arrayBuffer()))
  if (linhasCsv.length < 2) {
    return { erro: "A planilha está vazia (só o cabeçalho ou nada)." }
  }
  if (linhasCsv.length - 1 > MAX_LINHAS) {
    return {
      erro: `A planilha tem ${(linhasCsv.length - 1).toLocaleString("pt-BR")} linhas — o limite é ${MAX_LINHAS.toLocaleString("pt-BR")}.`,
    }
  }

  const colunas = linhasCsv[0].map(
    (c) => CABECALHOS[normalizarCabecalho(c)] ?? null
  )
  if (!colunas.includes("valor") || (!colunas.includes("cpf") && !colunas.includes("matricula"))) {
    return {
      erro: "A planilha precisa da coluna “valor” e de “cpf” ou “matricula” — baixe o modelo.",
    }
  }

  const erros: { linha: number; motivo: string }[] = []
  const itens: {
    linha: number
    cpf: string | null
    matriculaFonte: string | null
    valor: number
  }[] = []

  for (let i = 1; i < linhasCsv.length; i++) {
    const numeroLinha = i + 1
    const valores: Record<string, string> = {}
    linhasCsv[i].forEach((v, j) => {
      const campo = colunas[j]
      if (campo) valores[campo] = v.trim()
    })

    const cpfBruto = valores.cpf ?? ""
    const cpf = cpfBruto ? limparCpf(cpfBruto) : ""
    if (cpfBruto && !validarCpf(cpf)) {
      erros.push({ linha: numeroLinha, motivo: `CPF inválido (“${cpfBruto}”)` })
      continue
    }
    const matricula = (valores.matricula ?? "").replace(/\D/g, "") || null
    if (!cpf && !matricula) {
      erros.push({ linha: numeroLinha, motivo: "Sem CPF nem matrícula" })
      continue
    }
    const valor = parseValor(valores.valor ?? "")
    if (valor === null) {
      erros.push({
        linha: numeroLinha,
        motivo: `Valor inválido (“${valores.valor ?? ""}”)`,
      })
      continue
    }
    itens.push({ linha: numeroLinha, cpf: cpf || null, matriculaFonte: matricula, valor })
  }

  const resolvidos = await resolverFiliadosLote(fonteId, remessaId, itens)

  const admin = await createAdminClient()
  let identificados = 0
  let naoEncontrados = 0
  const empId = await tenantAtual()
  for (let de = 0; de < itens.length; de += 300) {
    const lote = itens.slice(de, de + 300)
    const { error } = await admin.from("filiacao_recebe").insert(
      lote.map((item, j) => {
        const filiadoId = resolvidos[de + j]
        if (filiadoId) identificados++
        else naoEncontrados++
        return {
          remessa_id: remessaId,
          fonte_pg_id: fonteId,
          filiado_id: filiadoId,
          cpf: item.cpf,
          fonte_pg_matricula: item.matriculaFonte,
          valor: item.valor,
          emp_proprietaria_id: empId,
        }
      })
    )
    if (error) {
      return { erro: `Falha ao gravar os lançamentos: ${error.message}` }
    }
  }

  invalidarCacheRemessa(remessaId)
  revalidatePath(`/painel/filiados/receitas/${remessaId}`)
  revalidatePath(`/painel/filiados/receitas/${remessaId}/${fonteId}`)
  return {
    resultado: {
      identificados,
      naoEncontrados,
      erros: erros.sort((a, b) => a.linha - b.linha),
    },
  }
}

/** Inclui a contribuição de UM filiado (CPF ou matrícula da fonte). */
export async function incluirContribuicao(
  _prev: EstadoContribuicoes,
  formData: FormData
): Promise<EstadoContribuicoes> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  if (!ids) return { erro: "Remessa ou fonte inválida." }
  const { remessaId, fonteId } = ids

  const cpfBruto = String(formData.get("cpf") ?? "").trim()
  const cpf = cpfBruto ? limparCpf(cpfBruto) : ""
  if (cpfBruto && !validarCpf(cpf)) return { erro: "CPF inválido." }
  const matricula =
    String(formData.get("matricula") ?? "").replace(/\D/g, "") || null
  if (!cpf && !matricula) {
    return { erro: "Informe o CPF ou a matrícula na fonte." }
  }
  const valor = parseValor(String(formData.get("valor") ?? ""))
  if (valor === null) return { erro: "Informe o valor da contribuição." }

  const [filiadoId] = await resolverFiliadosLote(fonteId, remessaId, [
    { cpf: cpf || null, matriculaFonte: matricula },
  ])
  if (!filiadoId) {
    return {
      erro: "Filiado não encontrado pelo CPF/matrícula — confira os dados ou use a importação em massa (que aceita não encontrados).",
    }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_recebe").insert({
    remessa_id: remessaId,
    fonte_pg_id: fonteId,
    filiado_id: filiadoId,
    cpf: cpf || null,
    fonte_pg_matricula: matricula,
    valor,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível incluir: ${error.message}` }

  invalidarCacheRemessa(remessaId)
  voltar(remessaId, fonteId, "contribuicao")
}

/**
 * Move os recebimentos desta fonte (lançamentos + comprovação de depósito)
 * para outra remessa — corrige importações feitas na remessa errada.
 */
export async function trocarRemessa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  if (!ids) return { erro: "Remessa ou fonte inválida." }
  const destino = String(formData.get("remessa_destino") ?? "")
  if (!UUID.test(destino)) return { erro: "Escolha a remessa de destino." }
  if (destino === ids.remessaId) {
    return { erro: "A remessa de destino é a mesma remessa atual." }
  }

  const admin = await createAdminClient()

  const { data: remessaDestino } = await admin
    .from("filiacao_recebe_remessa")
    .select("id")
    .eq("id", destino)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!remessaDestino) return { erro: "Remessa de destino não encontrada." }

  const { error } = await admin
    .from("filiacao_recebe")
    .update({ remessa_id: destino })
    .eq("remessa_id", ids.remessaId)
    .eq("fonte_pg_id", ids.fonteId)
  if (error) return { erro: `Não foi possível mover: ${error.message}` }

  // O registro de depósito acompanha os lançamentos
  await admin
    .from("filiacao_recebe_comprovacao")
    .update({ remessa_id: destino })
    .eq("remessa_id", ids.remessaId)
    .eq("fonte_pg_id", ids.fonteId)

  invalidarCacheRemessa(ids.remessaId)
  invalidarCacheRemessa(destino)
  revalidatePath(`/painel/filiados/receitas/${ids.remessaId}`)
  revalidatePath(`/painel/filiados/receitas/${destino}`)
  redirect(`/painel/filiados/receitas/${destino}/${ids.fonteId}?salvo=1`)
}

/**
 * Muda a condição dos cadastros marcados nas listas de conferência
 * (tornar ativos os pagantes não ativos / inativar ativos não pagantes).
 */
export async function definirCondicaoMarcados(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  if (!ids) return { erro: "Remessa ou fonte inválida." }

  const condicao = String(formData.get("condicao") ?? "")
  if (!["Ativo", "Inativo"].includes(condicao)) {
    return { erro: "Condição inválida." }
  }

  const marcados = formData
    .getAll("ids")
    .map(String)
    .filter((id) => UUID.test(id))
  if (marcados.length === 0) {
    return { erro: "Nenhum cadastro marcado." }
  }
  if (marcados.length > 1000) {
    return { erro: "Marque no máximo 1.000 cadastros por vez." }
  }

  const admin = await createAdminClient()
  for (let de = 0; de < marcados.length; de += 100) {
    const { error } = await admin
      .from("filiacoes")
      .update({ filiacao_condicao: condicao })
      .in("id", marcados.slice(de, de + 100))
      .eq("emp_proprietaria_id", await tenantAtual())
    if (error) {
      return { erro: `Não foi possível atualizar: ${error.message}` }
    }
  }

  // A condição vive no snapshot de fontes — invalida para refletir já
  invalidarCacheFontes()
  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/lista")
  voltar(ids.remessaId, ids.fonteId, "condicoes")
}

/** Atualiza o valor de um lançamento. */
export async function atualizarContribuicao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  const lancamentoId = String(formData.get("lancamento_id") ?? "")
  if (!ids || !UUID.test(lancamentoId)) return { erro: "Lançamento inválido." }

  const valor = parseValor(String(formData.get("valor") ?? ""))
  if (valor === null) return { erro: "Informe o valor." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("filiacao_recebe")
    .update({ valor }, { count: "exact" })
    .eq("id", lancamentoId)
    .eq("remessa_id", ids.remessaId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Lançamento não encontrado." }

  invalidarCacheRemessa(ids.remessaId)
  voltar(ids.remessaId, ids.fonteId, "salvo")
}

/** Exclui um lançamento da remessa. */
export async function excluirContribuicao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const ids = idsDoForm(formData)
  const lancamentoId = String(formData.get("lancamento_id") ?? "")
  if (!ids || !UUID.test(lancamentoId)) return { erro: "Lançamento inválido." }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_recebe")
    .delete()
    .eq("id", lancamentoId)
    .eq("remessa_id", ids.remessaId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  invalidarCacheRemessa(ids.remessaId)
  voltar(ids.remessaId, ids.fonteId, "excluido")
}

/**
 * Exclui TODOS os lançamentos desta fonte nesta remessa (desfazer uma
 * importação errada). Não toca no depósito nem em outras fontes/remessas.
 */
export async function excluirLancamentosDaFonte(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const ids = idsDoForm(formData)
  if (!ids) return { erro: "Remessa ou fonte inválida." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("filiacao_recebe")
    .delete({ count: "exact" })
    .eq("remessa_id", ids.remessaId)
    .eq("fonte_pg_id", ids.fonteId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  invalidarCacheRemessa(ids.remessaId)
  revalidatePath(`/painel/filiados/receitas/${ids.remessaId}`)
  revalidatePath(`/painel/filiados/receitas/${ids.remessaId}/${ids.fonteId}`)
  redirect(
    `/painel/filiados/receitas/${ids.remessaId}/${ids.fonteId}?fonte_limpa=${count ?? 0}`
  )
}
