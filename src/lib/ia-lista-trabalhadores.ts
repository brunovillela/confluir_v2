import "server-only"

import { CHAVES_LINHA, type LinhaBruta } from "@/lib/atualizacao-lista"
import { type EsquemaJsonIA, gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { imagemNaoSuportada, mimeDeImagem, textoDoArquivo } from "@/lib/ia-arquivo"
import { emParalelo } from "@/lib/paralelo"

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

const linhasDe = (dados: Record<string, unknown> | undefined) =>
  Array.isArray(dados?.trabalhadores) ? (dados.trabalhadores as Partial<LinhaBruta>[]) : []

/**
 * Texto (planilha, CSV, PDF digital) → trabalhadores, em blocos com as
 * primeiras linhas como contexto. `conferir`: uma linha do texto é uma linha
 * da lista (planilha e CSV) — no texto de um PDF, uma linha da tabela se
 * parte em várias e a contagem daria aviso falso.
 */
async function lerTexto(texto: string, conferir: boolean, aoAvancar?: AoAvancar): Promise<LeituraLista> {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() && l.replace(/[,;\t|"]/g, "").trim())
  if (linhas.length > MAX_LINHAS_LISTA + 20) {
    return { erro: `Lista grande demais (${linhas.length} linhas). Divida em arquivos de até ${MAX_LINHAS_LISTA} trabalhadores.` }
  }
  const blocos: string[][] = []
  for (let de = 0; de < linhas.length; de += LINHAS_POR_BLOCO) blocos.push(linhas.slice(de, de + LINHAS_POR_BLOCO))
  const contexto = linhas.slice(0, 3).join("\n")

  let lidos = 0
  aoAvancar?.(0, blocos.length)

  const resultados = await emParalelo(blocos, BLOCOS_EM_PARALELO, async (bloco, i) => {
    const r = await gerarJsonIA({
      system: SISTEMA,
      esquema: ESQUEMA,
      prompt:
        blocos.length === 1
          ? `Lista enviada pela empresa:\n\n${bloco.join("\n")}`
          : i === 0
            ? `Trecho 1 de ${blocos.length} de uma lista maior. Transcreva todos os trabalhadores DESTE trecho:\n\n${bloco.join("\n")}`
            : `Trecho ${i + 1} de ${blocos.length} de uma lista maior.\n\nPRIMEIRAS LINHAS DO ARQUIVO — só para entender as colunas; NÃO transcreva nada daqui:\n${contexto}\n\nLINHAS DESTE TRECHO — transcreva todos os trabalhadores:\n${bloco.join("\n")}`,
    })
    aoAvancar?.(++lidos, blocos.length)
    return r
  })

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

/** Trechos lidos de quantos — para a tela mostrar o andamento. */
export type AoAvancar = (lidos: number, total: number) => void

/** A visão do modelo recebe o arquivo inteiro: foto e PDF escaneado até este tamanho. */
const MAX_VISAO = 20 * 1024 * 1024

export async function lerListaTrabalhadores(arquivo: File, aoAvancar?: AoAvancar): Promise<LeituraLista> {
  const imagem = mimeDeImagem(arquivo.type, arquivo.name)
  if (imagem) {
    if (arquivo.size > MAX_VISAO) return { erro: "Imagem grande demais para a leitura — até 20 MB." }
    aoAvancar?.(0, 1)
    const r = await gerarJsonIADeImagem({
      system: SISTEMA,
      esquema: ESQUEMA,
      prompt: "Transcreva os trabalhadores desta lista (foto ou print).",
      imagemBase64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
      mimeType: imagem,
    })
    return r.erro || !r.dados ? { erro: r.erro ?? "Falha na leitura." } : { linhas: linhasDe(r.dados), avisos: [] }
  }
  if (imagemNaoSuportada(arquivo.name)) return { erro: "Formato de imagem não suportado — use JPG, PNG, WebP ou GIF." }

  const { texto, ehPdf, pdf, erro } = await textoDoArquivo(arquivo)
  if (erro) return { erro }

  if (texto.length >= 20) return lerTexto(texto, !ehPdf, aoAvancar)
  if (ehPdf && pdf) {
    if (arquivo.size > MAX_VISAO) return { erro: "PDF escaneado grande demais para a leitura — até 20 MB. Divida o arquivo." }
    aoAvancar?.(0, 1)
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
