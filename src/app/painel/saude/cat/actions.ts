"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { decodificarCsv, parseCsv } from "@/lib/csv"
import {
  atualizarCat,
  criarCat,
  importarCats,
  numerosCatExistentes,
  vincularFiliadoCat,
  type RegistroCat,
} from "@/lib/db/saude"
import {
  acharCampo,
  CAMPOS_CAT,
  CAMPOS_COM_CODIGO_OFICIAL,
  nomeCampo,
  valorParaColunas,
  type CampoCat,
} from "@/lib/saude-campos"
import { nz } from "@/lib/saude-normalizacao"

const PERMISSAO = "saude_cat"
const ALTERNATIVAS = ["saude_gestao"]

/**
 * Marca a fila de revisão: registro cujos campos 31/32/34/45 vieram com
 * descrição mas sem o código oficial de 9 dígitos. Mesma regra da carga
 * inicial (supabase/saude-cat-carga.sql), para o indicador do painel
 * continuar significando a mesma coisa.
 */
function marcarTruncada(registro: RegistroCat): RegistroCat {
  const truncada = CAMPOS_COM_CODIGO_OFICIAL.some((numero) => {
    const campo = CAMPOS_CAT.find((c) => c.n === numero)
    if (!campo?.colunaCodigo) return false
    return (
      registro[campo.coluna] != null && registro[campo.colunaCodigo] == null
    )
  })
  return { ...registro, descricao_truncada: truncada }
}

/** Lê os 50 campos do FormData do formulário individual. */
function registroDoFormulario(formData: FormData): RegistroCat {
  let registro: RegistroCat = {}
  for (const campo of CAMPOS_CAT) {
    const bruto = String(formData.get(nomeCampo(campo)) ?? "")
    registro = { ...registro, ...valorParaColunas(campo, bruto) }
  }
  return marcarTruncada(registro)
}

export async function criarCatAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const registro = registroDoFormulario(formData)
  if (!registro.trabalhador_nome) {
    return { erro: "Informe o nome do acidentado (campo 11)." }
  }
  if (!registro.data_acidente) {
    return { erro: "Informe a data do acidente (campo 19) em DD/MM/AAAA." }
  }

  const numero = registro.numero_cat
  if (typeof numero === "string" && numero) {
    const existentes = await numerosCatExistentes([numero])
    if (existentes.has(numero)) {
      return { erro: `Já existe uma CAT com o número ${numero}.` }
    }
  }

  const { id, erro } = await criarCat(registro)
  if (erro || !id) return { erro: erro ?? "Não foi possível gravar a CAT." }

  revalidatePath("/painel/saude/cat")
  revalidatePath("/painel/saude")
  redirect(`/painel/saude/cat/${id}?salvo=1`)
}

export async function atualizarCatAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Registro não identificado." }

  const registro = registroDoFormulario(formData)
  if (!registro.trabalhador_nome) {
    return { erro: "Informe o nome do acidentado (campo 11)." }
  }

  const { erro } = await atualizarCat(id, registro)
  if (erro) return { erro }

  revalidatePath("/painel/saude/cat")
  revalidatePath(`/painel/saude/cat/${id}`)
  revalidatePath("/painel/saude")
  redirect(`/painel/saude/cat/${id}?salvo=1`)
}

/** Liga/desliga o vínculo da CAT com um filiado (campo vazio = desvincular). */
export async function vincularFiliadoCatAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Registro não identificado." }
  const filiadoId = String(formData.get("filiado_id") ?? "").trim() || null

  const { erro } = await vincularFiliadoCat(id, filiadoId)
  if (erro) return { erro }

  revalidatePath(`/painel/saude/cat/${id}`)
  return { ok: filiadoId ? "Filiado vinculado." : "Vínculo removido." }
}

/**
 * Importação em massa por CSV.
 *
 * Recusa o arquivo inteiro em qualquer problema, em vez de gravar o que deu
 * certo: carga parcial de CAT é pior que carga nenhuma, porque não há como
 * saber depois o que entrou sem conferir linha a linha.
 */
export async function importarCatsAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo CSV." }
  }
  if (arquivo.size > 10 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 10 MB." }
  }

  const linhas = parseCsv(decodificarCsv(await arquivo.arrayBuffer()))
  if (linhas.length < 2) {
    return { erro: "O arquivo está vazio (esperava cabeçalho + registros)." }
  }

  // --- Cabeçalhos -----------------------------------------------------
  const cabecalhos = linhas[0]
  const mapa = new Map<number, CampoCat>()
  const ignorados: string[] = []
  for (const [i, bruto] of cabecalhos.entries()) {
    const campo = acharCampo(bruto)
    if (campo && ![...mapa.values()].some((c) => c.n === campo.n)) {
      mapa.set(i, campo)
    } else if (nz(bruto)) {
      ignorados.push(bruto.trim())
    }
  }
  if (mapa.size === 0) {
    return {
      erro:
        "Nenhuma coluna reconhecida. O cabeçalho deve usar a numeração do formulário da CAT (ex.: “19 - Data do acidente”) ou os nomes do modelo. Baixe o modelo para conferir.",
    }
  }
  const temNome = [...mapa.values()].some((c) => c.n === 11)
  const temData = [...mapa.values()].some((c) => c.n === 19)
  if (!temNome || !temData) {
    return {
      erro: `Faltam colunas obrigatórias: ${!temNome ? "11 (nome do acidentado)" : ""}${!temNome && !temData ? " e " : ""}${!temData ? "19 (data do acidente)" : ""}.`,
    }
  }

  // --- Linhas ---------------------------------------------------------
  const registros: RegistroCat[] = []
  const problemas: string[] = []
  const numerosNoArquivo = new Map<string, number>()

  for (let l = 1; l < linhas.length; l++) {
    const valores = linhas[l]
    // +1 porque a linha 1 da planilha é o cabeçalho.
    const naPlanilha = l + 1

    let registro: RegistroCat = {}
    for (const [i, campo] of mapa) {
      registro = { ...registro, ...valorParaColunas(campo, valores[i] ?? "") }
    }

    if (!registro.trabalhador_nome) {
      problemas.push(`Linha ${naPlanilha}: sem o nome do acidentado.`)
      continue
    }
    if (!registro.data_acidente) {
      const bruto = valores[[...mapa].find(([, c]) => c.n === 19)![0]] ?? ""
      problemas.push(
        `Linha ${naPlanilha}: data do acidente inválida${nz(bruto) ? ` (“${bruto.trim()}”)` : " (vazia)"} — use DD/MM/AAAA.`
      )
      continue
    }

    const numero = registro.numero_cat
    if (typeof numero === "string" && numero) {
      const antes = numerosNoArquivo.get(numero)
      if (antes) {
        problemas.push(
          `Linha ${naPlanilha}: número de CAT ${numero} repetido (já aparece na linha ${antes}).`
        )
        continue
      }
      numerosNoArquivo.set(numero, naPlanilha)
    }

    registros.push(marcarTruncada(registro))
  }

  if (problemas.length > 0) {
    const amostra = problemas.slice(0, 8).join(" ")
    const resto =
      problemas.length > 8 ? ` (+${problemas.length - 8} outros problemas)` : ""
    return { erro: `Nada foi importado. ${amostra}${resto}` }
  }
  if (registros.length === 0) {
    return { erro: "Nenhum registro válido no arquivo." }
  }

  // --- Duplicatas contra o que já está no banco ------------------------
  const numeros = registros
    .map((r) => r.numero_cat)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
  const jaExistem = await numerosCatExistentes(numeros)
  if (jaExistem.size > 0) {
    const lista = [...jaExistem].slice(0, 5).join(", ")
    const resto = jaExistem.size > 5 ? ` (+${jaExistem.size - 5})` : ""
    return {
      erro: `Nada foi importado: ${jaExistem.size} ${jaExistem.size === 1 ? "CAT já existe" : "CATs já existem"} na base — ${lista}${resto}. Remova essas linhas ou apague os registros antigos antes de importar.`,
    }
  }

  const { gravados, erro } = await importarCats(registros)
  if (erro) return { erro }

  revalidatePath("/painel/saude/cat")
  revalidatePath("/painel/saude")
  const aviso = ignorados.length > 0 ? `&ignoradas=${ignorados.length}` : ""
  redirect(`/painel/saude/cat?importadas=${gravados}${aviso}`)
}
