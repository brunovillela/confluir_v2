import "server-only"
import { revalidatePath } from "next/cache"

import { lerCatDoPdf } from "@/lib/cat-leitura-ia"
import type { ClassificacaoCat } from "@/lib/cat-classificacao"
import { classificarCat, type EntradaCat } from "@/lib/db/cat-duplicidades"
import { buscarCat, criarCat, gravarPdfCat, numerosCatExistentes } from "@/lib/db/saude"
import { CAMPOS_CAT, nomeCampo, registroDosValores, valoresDoRegistro } from "@/lib/saude-campos"

/**
 * Leitura de CAT em PDF e gravação sem conferência — a parte comum à
 * server action (um PDF, formulário na tela) e à rota do lote
 * (/api/painel/saude/cat-pdf). O lote não usa server action porque o Next
 * despacha as actions de um cliente uma de cada vez: as leituras viravam
 * uma fila, e uma leitura presa segurava todas as outras.
 */

export type EstadoExtracaoCat = {
  valores?: Record<string, string>
  avisos?: string[]
  erro?: string
  /** Nova, já lançada, atualização ou possível duplicidade. */
  classificacao?: ClassificacaoCat
  /**
   * CAT já lançada: os valores dela completados pelo PDF, para atualizar a
   * existente em vez de lançar de novo — e os campos em que o PDF difere.
   */
  existente?: { id: string; numero: string | null; valores: Record<string, string>; diferentes: string[] }
}

export type GravacaoSemConferencia = {
  /** A CAT foi gravada sem conferência: o id dela. */
  gravadaId?: string
  /** Por que não foi gravada (já lançada, possível duplicidade, sem nome…). */
  naoGravada?: string
  /** A CAT foi gravada, mas o PDF não foi guardado. */
  avisoPdf?: string
}

export type ResultadoLoteCat = EstadoExtracaoCat & GravacaoSemConferencia

export const PERMISSAO_CAT = "saude_cat"
export const ALTERNATIVAS_CAT = ["saude_gestao"]

export function validarPdf(arquivo: FormDataEntryValue | null): File | string {
  if (!(arquivo instanceof File) || arquivo.size === 0) return "Selecione um arquivo PDF."
  if (arquivo.type && arquivo.type !== "application/pdf") return "Envie um arquivo PDF."
  return arquivo
}

/** Lê o PDF com a IA e compara com a base (nova, já lançada, atualização…). */
export async function lerEClassificar(arquivo: File): Promise<EstadoExtracaoCat> {
  const leitura = await lerCatDoPdf(new Uint8Array(await arquivo.arrayBuffer()))
  if (leitura.erro !== undefined) return { erro: leitura.erro }
  const { valores, avisos } = leitura

  const { disponivel, ...classificacao } = await classificarCat(registroDosValores(valores) as EntradaCat)

  let existente: EstadoExtracaoCat["existente"]
  if (disponivel && classificacao.classe === "duplicada" && classificacao.relacionadas.length === 1) {
    const alvo = classificacao.relacionadas[0]
    const cat = (await buscarCat(alvo.id)) as Record<string, unknown> | null
    if (cat) {
      const naBase = valoresDoRegistro(cat)
      const juntos: Record<string, string> = { ...naBase }
      const diferentes: string[] = []
      for (const campo of CAMPOS_CAT) {
        const nome = nomeCampo(campo)
        const doPdf = valores[nome]
        if (!doPdf) continue
        if (naBase[nome] && naBase[nome] !== doPdf) diferentes.push(`${campo.n} — ${campo.rotulo}`)
        juntos[nome] = doPdf
      }
      existente = { id: alvo.id, numero: alvo.numero, valores: juntos, diferentes }
    }
  }

  return {
    valores,
    avisos: avisos.length ? avisos : undefined,
    classificacao: disponivel ? classificacao : undefined,
    existente,
  }
}

/**
 * Grava o que a IA leu, sem conferência humana, quando é seguro gravar sem
 * olhar: CAT nova ou atualização de uma CAT da base. Já lançada não entra; a
 * possível duplicidade e a leitura sem nome ou data ficam para conferir.
 */
export async function gravarSemConferencia(
  valores: Record<string, string>,
  avisos: string[],
  arquivo: File
): Promise<GravacaoSemConferencia> {
  const registro = registroDosValores(valores)
  if (!registro.trabalhador_nome) return { naoGravada: "A IA não leu o nome do acidentado — confira e salve pelo formulário." }
  if (!registro.data_acidente) return { naoGravada: "A IA não leu a data do acidente — confira e salve pelo formulário." }

  const numero = registro.numero_cat
  if (typeof numero === "string" && numero && (await numerosCatExistentes([numero])).has(numero)) {
    return { naoGravada: `Já existe uma CAT com o número ${numero}.` }
  }
  const { disponivel, ...c } = await classificarCat(registro as EntradaCat)
  if (!disponivel) return { naoGravada: "Não foi possível comparar com a base agora — confira e salve pelo formulário." }
  if (c.classe === "duplicada") return { naoGravada: c.motivo }
  if (c.classe === "possivel_duplicada") return { naoGravada: `${c.motivo} Confira antes de gravar.` }

  const { id, erro } = await criarCat({
    ...registro,
    ...(c.classe === "atualizacao" && c.origemId ? { cat_origem_id: c.origemId } : {}),
    sem_conferencia: true,
    leitura_avisos: avisos.length ? avisos : null,
  })
  if (erro || !id) return { naoGravada: erro ?? "Não foi possível gravar a CAT." }

  const { erro: erroPdf } = await gravarPdfCat(id, arquivo)
  revalidatePath("/painel/saude/cat")
  revalidatePath("/painel/saude")
  return { gravadaId: id, avisoPdf: erroPdf }
}

/** Um PDF do lote: lê e, com `registrar` ligado, já grava sem conferência. */
export async function lerDoLote(arquivo: File, registrar: boolean): Promise<ResultadoLoteCat> {
  const lido = await lerEClassificar(arquivo)
  if (!lido.valores || !registrar) return lido
  return { ...lido, ...(await gravarSemConferencia(lido.valores, lido.avisos ?? [], arquivo)) }
}

/** Grava sem conferência uma CAT do lote que já foi lida (botão da linha). */
export async function gravarLidaSemConferencia(
  arquivo: File,
  valoresJson: string,
  avisosJson: string
): Promise<GravacaoSemConferencia & { erro?: string }> {
  let valores: Record<string, string> = {}
  let avisos: string[] = []
  try {
    const v = JSON.parse(valoresJson || "{}") as unknown
    const a = JSON.parse(avisosJson || "[]") as unknown
    // Só os campos do formulário, só texto.
    const nomes = new Set(CAMPOS_CAT.map(nomeCampo))
    if (v && typeof v === "object") {
      valores = Object.fromEntries(
        Object.entries(v).filter(([k, x]) => nomes.has(k) && typeof x === "string")
      ) as Record<string, string>
    }
    if (Array.isArray(a)) avisos = a.filter((x): x is string => typeof x === "string").slice(0, 60)
  } catch {
    return { erro: "Leitura inválida — leia o PDF de novo." }
  }
  return gravarSemConferencia(valores, avisos, arquivo)
}
