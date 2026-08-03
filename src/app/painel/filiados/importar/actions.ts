"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  decodificarCsv,
  normalizarCabecalho,
  normalizarDataCsv,
  parseCsv,
} from "@/lib/csv"
import {
  importarFiliadosDaFonte,
  type LinhaImportacao,
  type ResultadoImportacao,
} from "@/lib/db/fontes"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

export type EstadoImportacao = {
  erro?: string
  resultado?: ResultadoImportacao
}

/** Sinônimos aceitos nos cabeçalhos da planilha (já normalizados). */
const CABECALHOS: Record<string, string> = {
  nome: "nome_completo",
  nomecompleto: "nome_completo",
  cpf: "cpf",
  matriculasindical: "matricula_sindical",
  sexo: "sexo",
  nascimento: "nascimento",
  datanascimento: "nascimento",
  nascimentodata: "nascimento",
  email: "email",
  emailpessoal: "email",
  telefone: "telefone",
  telefone1: "telefone",
  celular: "telefone",
  cargo: "cargo",
  lotacao: "lotacao",
  matricula: "matricula_fonte",
  matriculafonte: "matricula_fonte",
  matriculanafonte: "matricula_fonte",
  admissao: "admissao",
  dataadmissao: "admissao",
  dataentradaadmissao: "admissao",
  filiacao: "filiacao",
  datafiliacao: "filiacao",
  datadefiliacao: "filiacao",
  condicao: "condicao",
  condicaofiliacao: "condicao",
  filiacaocondicao: "condicao",
}

const MAX_LINHAS = 10_000

export async function importarFiliadosCsv(
  _prev: EstadoImportacao,
  formData: FormData
): Promise<EstadoImportacao> {
  await requirePermissao("filiacao_gestao")

  const fonteId = String(formData.get("fonte_id") ?? "")
  if (!fonteId) return { erro: "Selecione a fonte pagadora." }

  const admin = await createAdminClient()
  const { data: fonte } = await admin
    .from("empresa")
    .select("id")
    .eq("id", fonteId)
    .maybeSingle()
  if (!fonte) return { erro: "Fonte pagadora não encontrada." }

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
      erro: `A planilha tem ${(linhasCsv.length - 1).toLocaleString("pt-BR")} linhas — o limite por importação é ${MAX_LINHAS.toLocaleString("pt-BR")}.`,
    }
  }

  // Mapeia as colunas pelo cabeçalho (ordem livre, sinônimos aceitos)
  const colunas = linhasCsv[0].map(
    (c) => CABECALHOS[normalizarCabecalho(c)] ?? null
  )
  if (!colunas.includes("nome_completo") || !colunas.includes("cpf")) {
    return {
      erro: "A planilha precisa das colunas “nome_completo” e “cpf” — baixe o modelo e confira o cabeçalho.",
    }
  }

  const erros: { linha: number; motivo: string }[] = []
  const linhas: LinhaImportacao[] = []

  for (let i = 1; i < linhasCsv.length; i++) {
    const numeroLinha = i + 1 // 1-based contando o cabeçalho
    const valores: Record<string, string> = {}
    linhasCsv[i].forEach((v, j) => {
      const campo = colunas[j]
      if (campo) valores[campo] = v.trim()
    })

    const nome = valores.nome_completo ?? ""
    const cpf = limparCpf(valores.cpf ?? "")
    if (!nome) {
      erros.push({ linha: numeroLinha, motivo: "Nome vazio" })
      continue
    }
    if (!validarCpf(cpf)) {
      erros.push({
        linha: numeroLinha,
        motivo: `CPF inválido (“${valores.cpf ?? ""}”)`,
      })
      continue
    }

    const condicaoBruta = valores.condicao ?? ""
    let condicao: string | null = null
    if (condicaoBruta) {
      condicao =
        FILIACAO_CONDICOES.find(
          (c) => normalizarCabecalho(c) === normalizarCabecalho(condicaoBruta)
        ) ?? null
      if (!condicao) {
        erros.push({
          linha: numeroLinha,
          motivo: `Condição desconhecida (“${condicaoBruta}”)`,
        })
        continue
      }
    }

    const data = (campo: string, rotulo: string): string | null | false => {
      const bruto = valores[campo] ?? ""
      if (!bruto) return null
      const normalizada = normalizarDataCsv(bruto)
      if (!normalizada) {
        erros.push({
          linha: numeroLinha,
          motivo: `${rotulo} inválida (“${bruto}”) — use DD/MM/AAAA`,
        })
        return false
      }
      return normalizada
    }
    const nascimento = data("nascimento", "Data de nascimento")
    const admissao = data("admissao", "Data de admissão")
    const filiacao = data("filiacao", "Data de filiação")
    if (nascimento === false || admissao === false || filiacao === false) {
      continue
    }

    const sexoBruto = (valores.sexo ?? "").toLowerCase()
    const sexo =
      ["Masculino", "Feminino", "Outro"].find(
        (s) => s.toLowerCase() === sexoBruto
      ) ?? null

    linhas.push({
      linha: numeroLinha,
      nome_completo: nome,
      cpf,
      matricula_sindical: valores.matricula_sindical || null,
      sexo,
      nascimento_data: nascimento,
      email_pessoal: valores.email || null,
      telefone_1: valores.telefone ? valores.telefone.replace(/\D/g, "") : null,
      cargo: valores.cargo || null,
      lotacao: valores.lotacao || null,
      matricula_fonte: valores.matricula_fonte || null,
      data_admissao: admissao,
      data_filiacao: filiacao,
      condicao,
    })
  }

  try {
    const resultado = await importarFiliadosDaFonte(fonteId, linhas, erros)
    revalidatePath(`/painel/representacao/empregadores/${fonteId}`)
    revalidatePath("/painel/filiados/lista")
    revalidatePath("/painel/filiados")
    return { resultado }
  } catch (e) {
    return {
      erro: e instanceof Error ? e.message : "Falha inesperada na importação.",
    }
  }
}
