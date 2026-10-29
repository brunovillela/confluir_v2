import "server-only"

import { extractText, getDocumentProxy } from "unpdf"
import * as XLSX from "xlsx"

import { CHAVES_LINHA, type LinhaBruta } from "@/lib/atualizacao-lista"
import { decodificarCsv } from "@/lib/csv"
import { type EsquemaJsonIA, gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"

/**
 * Leitura por IA de uma lista de trabalhadores (XLSX/XLS, CSV/TXT, PDF com
 * texto ou escaneado, imagem) — a mesma esteira da relação de pagamentos das
 * Receitas: planilha e texto em blocos paralelos; PDF escaneado e foto pela
 * visão. A IA só transcreve para o esquema; quem padroniza e valida é
 * lib/atualizacao-lista.ts.
 */

/** Cada trabalhador tem ~20 campos: blocos menores que os das Receitas, para a resposta caber. */
const LINHAS_POR_BLOCO = 80
const BLOCOS_EM_PARALELO = 10
export const MAX_LINHAS_LISTA = 3000

/** Linha "de dados": tem número de CPF, matrícula ou data (4+ dígitos seguidos). */
const LINHA_DE_DADOS = /\d{4,}/

const SISTEMA = `Você transcreve listas de trabalhadores enviadas por empresas (empregadores ou fundos de pensão) para um sindicato. A lista pode vir em qualquer layout.

Para CADA trabalhador, devolva um objeto com estes campos (texto; use "" quando a informação não estiver na lista — NUNCA invente nem deduza):
- nome: nome completo, como escrito.
- cpf: só os dígitos.
- matricula: matrícula do empregado na empresa (não confundir com CPF nem PIS).
- nascimento, admissao, demissao: datas em AAAA-MM-DD. demissao é a data de saída/desligamento da empresa.
- sexo: "M" ou "F".
- email: e-mail pessoal. email_corporativo: e-mail com o domínio da empresa. Se houver um só e não der para saber, use email.
- telefone_1, telefone_2: com DDD, só dígitos.
- cep, logradouro, numero, complemento, bairro, cidade, uf (sigla).
- cargo, lotacao (setor, gerência, unidade ou base): como escritos.
- regime: regime/turno de trabalho, como escrito (ex.: administrativo, turno, revezamento, offshore).
- condicao: situação na empresa, como escrita (ex.: ativo, aposentado, pensionista).

Ignore cabeçalhos, totais, rodapés e linhas que não sejam de trabalhador. Uma entrada por trabalhador, na ordem da lista.`

const CAMPO = { type: "string" }
const ESQUEMA: EsquemaJsonIA = {
  nome: "lista_trabalhadores",
  schema: {
    type: "object",
    properties: {
      trabalhadores: {
        type: "array",
        items: {
          type: "object",
          properties: Object.fromEntries(CHAVES_LINHA.map((k) => [k, CAMPO])),
          required: [...CHAVES_LINHA],
          additionalProperties: false,
        },
      },
    },
    required: ["trabalhadores"],
    additionalProperties: false,
  },
}

export type LeituraLista = {
  linhas?: Partial<LinhaBruta>[]
  avisos?: string[]
  erro?: string
}

function mimeDeImagem(tipo: string, nome: string): string | null {
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(tipo)) return tipo
  if (/\.(jpe?g|jfif)$/.test(nome)) return "image/jpeg"
  if (nome.endsWith(".png")) return "image/png"
  if (nome.endsWith(".webp")) return "image/webp"
  if (nome.endsWith(".gif")) return "image/gif"
  return null
}

async function emParalelo<T, R>(itens: T[], limite: number, tarefa: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const saida = new Array<R>(itens.length)
  let proximo = 0
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++
        saida[i] = await tarefa(itens[i], i)
      }
    })
  )
  return saida
}

const linhasDe = (dados: Record<string, unknown> | undefined) =>
  Array.isArray(dados?.trabalhadores) ? (dados.trabalhadores as Partial<LinhaBruta>[]) : []

/**
 * Texto (planilha, CSV, PDF digital) → trabalhadores, em blocos com as
 * primeiras linhas como contexto. `conferir`: uma linha do texto é uma linha
 * da lista (planilha e CSV) — no texto de um PDF, uma linha da tabela se
 * parte em várias e a contagem daria aviso falso.
 */
async function lerTexto(texto: string, conferir: boolean): Promise<LeituraLista> {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() && l.replace(/[,;\t|"]/g, "").trim())
  if (linhas.length > MAX_LINHAS_LISTA + 20) {
    return { erro: `Lista grande demais (${linhas.length} linhas). Divida em arquivos de até ${MAX_LINHAS_LISTA} trabalhadores.` }
  }
  const blocos: string[][] = []
  for (let de = 0; de < linhas.length; de += LINHAS_POR_BLOCO) blocos.push(linhas.slice(de, de + LINHAS_POR_BLOCO))
  const contexto = linhas.slice(0, 3).join("\n")

  const resultados = await emParalelo(blocos, BLOCOS_EM_PARALELO, (bloco, i) =>
    gerarJsonIA({
      system: SISTEMA,
      esquema: ESQUEMA,
      prompt:
        blocos.length === 1
          ? `Lista enviada pela empresa:\n\n${bloco.join("\n")}`
          : i === 0
            ? `Trecho 1 de ${blocos.length} de uma lista maior. Transcreva todos os trabalhadores DESTE trecho:\n\n${bloco.join("\n")}`
            : `Trecho ${i + 1} de ${blocos.length} de uma lista maior.\n\nPRIMEIRAS LINHAS DO ARQUIVO — só para entender as colunas; NÃO transcreva nada daqui:\n${contexto}\n\nLINHAS DESTE TRECHO — transcreva todos os trabalhadores:\n${bloco.join("\n")}`,
    })
  )

  const saida: Partial<LinhaBruta>[] = []
  const avisos: string[] = []
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i]
    if (r.erro || !r.dados) {
      // Um trecho que falha derruba a leitura: melhor do que atualizar meia lista.
      return { erro: `${blocos.length > 1 ? `Trecho ${i + 1} de ${blocos.length}: ` : ""}${r.erro ?? "Falha na leitura."}` }
    }
    const lidas = linhasDe(r.dados)
    saida.push(...lidas)
    const deDados = blocos[i].filter((l) => LINHA_DE_DADOS.test(l)).length
    if (conferir && deDados >= 10 && lidas.length < deDados * 0.9) {
      const primeira = i * LINHAS_POR_BLOCO + 1
      avisos.push(
        `Linhas ${primeira} a ${primeira + blocos[i].length - 1} do arquivo: a IA leu ${lidas.length} de cerca de ${deDados} linhas com dados.`
      )
    }
  }
  return { linhas: saida, avisos }
}

export async function lerListaTrabalhadores(arquivo: File): Promise<LeituraLista> {
  const nome = arquivo.name.toLowerCase()
  const imagem = mimeDeImagem(arquivo.type, nome)
  if (imagem) {
    const r = await gerarJsonIADeImagem({
      system: SISTEMA,
      esquema: ESQUEMA,
      prompt: "Transcreva os trabalhadores desta lista (foto ou print).",
      imagemBase64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
      mimeType: imagem,
    })
    return r.erro || !r.dados ? { erro: r.erro ?? "Falha na leitura." } : { linhas: linhasDe(r.dados), avisos: [] }
  }
  if (/\.(heic|heif|tiff?|bmp)$/.test(nome)) return { erro: "Formato de imagem não suportado — use JPG, PNG, WebP ou GIF." }

  const ehPdf = arquivo.type === "application/pdf" || nome.endsWith(".pdf")
  const ehPlanilha = /\.(xlsx|xls|ods)$/.test(nome) || arquivo.type.includes("spreadsheet") || arquivo.type.includes("ms-excel")
  let texto = ""
  let pdf: Uint8Array | null = null
  try {
    if (ehPdf) {
      pdf = new Uint8Array(await arquivo.arrayBuffer())
      texto = (await extractText(await getDocumentProxy(pdf), { mergePages: true })).text.trim()
    } else if (ehPlanilha) {
      const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" })
      texto = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { dateNF: "yyyy-mm-dd" })).join("\n\n").trim()
    } else {
      texto = decodificarCsv(await arquivo.arrayBuffer()).trim()
    }
  } catch {
    // PDF só-imagem pode falhar na extração de texto: a visão ainda tenta.
    if (!ehPdf || !pdf) return { erro: "Não consegui ler o arquivo." }
  }

  if (texto.length >= 20) return lerTexto(texto, !ehPdf)
  if (ehPdf && pdf) {
    const r = await gerarJsonIADePdf({
      system: SISTEMA,
      esquema: ESQUEMA,
      prompt: "Transcreva os trabalhadores desta lista (o PDF pode ser escaneado).",
      pdfBase64: Buffer.from(pdf).toString("base64"),
    })
    return r.erro || !r.dados ? { erro: r.erro ?? "Falha na leitura." } : { linhas: linhasDe(r.dados), avisos: [] }
  }
  return { erro: "O arquivo está vazio ou não tem dados legíveis." }
}
