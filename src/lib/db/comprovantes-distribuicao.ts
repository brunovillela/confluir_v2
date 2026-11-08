import "server-only"

import { randomUUID } from "node:crypto"
import { PDFDocument } from "pdf-lib"
import { extractText, getDocumentProxy } from "unpdf"

import {
  sugerirOrdens,
  type ComprovanteLido,
  type OrdemCandidata,
  type Sugestao,
} from "@/lib/comprovantes-casamento"
import { FORMAS_COM_COMPROVANTE } from "@/lib/compras-constantes"
import { hojeSP, lerEmLotes, lerEmLotesPorIds } from "@/lib/db/comum"
import { registrarEvento, SITUACOES_PAGAVEIS } from "@/lib/db/ordens-ciclo"
import { favorecidosDasOrdens } from "@/lib/db/ordens-favorecido"
import { registrarPagamentoDaOrdem } from "@/lib/db/ordens-pagamento"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf, type EsquemaJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * DISTRIBUIÇÃO DE COMPROVANTES (07/11/2026). O usuário envia um ou vários
 * arquivos (um PDF pode trazer vários comprovantes, um por página); a IA lê
 * cada comprovante, o sistema sugere a ordem sem comprovante que casa com ele
 * (lib/comprovantes-casamento.ts) e, confirmado, anexa as páginas dele à ordem:
 * ordem Paga só ganha o comprovante; A pagar/Processando é paga com a data e
 * o valor do comprovante, pelas mesmas travas do pagamento da ordem.
 *
 * O arquivo enviado fica em comprovantes/pendentes/<entidade>/ até a
 * confirmação (a tela não reenvia nada); pendentes com mais de 3 dias saem.
 */

const BUCKET = "comprovantes"
export const TAMANHO_MAXIMO = 4 * 1024 * 1024
export const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png"]

const SISTEMA = `Você lê comprovantes de pagamento de bancos brasileiros (Pix, TED/DOC, transferência, pagamento de boleto ou de guia, agendamento efetivado), emitidos para um sindicato que é o PAGADOR. Um arquivo pode trazer um comprovante ou vários (em geral um por página; às vezes dois numa página ou um em duas).

Para CADA comprovante, devolva um item em "comprovantes" (use null quando o dado não aparecer — NUNCA chute):
- "paginas": números das páginas (1 = primeira) onde está esse comprovante.
- "tipo": "Pix", "TED", "DOC", "Transferência", "Boleto", "Guia" ou outro nome curto.
- "valor": valor pago, número com ponto decimal (ex.: 1234.56). No boleto, o valor efetivamente pago (com juros/multa, se houver).
- "data": data em que o pagamento foi efetivado, AAAA-MM-DD (não a data de emissão do comprovante, se forem diferentes; no agendamento, a data do débito).
- "favorecido_nome": quem RECEBEU (favorecido, recebedor, beneficiário, cedente do boleto) — nunca o pagador/sindicato.
- "favorecido_documento": CPF/CNPJ de quem recebeu, como aparece (pode estar mascarado com *).
- "chave_pix": a chave Pix do recebedor, se aparecer.
- "linha_digitavel": linha digitável ou código de barras do boleto/guia, SÓ os dígitos.
Em "avisos", liste o que ficou ilegível ou estranho (lista vazia se nada). Se o arquivo não for comprovante de pagamento, devolva "comprovantes" vazio e diga isso em "avisos".`

const ESQUEMA: EsquemaJsonIA = {
  nome: "comprovantes_pagamento",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["comprovantes", "avisos"],
    properties: {
      comprovantes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["paginas", "tipo", "valor", "data", "favorecido_nome", "favorecido_documento", "chave_pix", "linha_digitavel"],
          properties: {
            paginas: { type: "array", items: { type: "integer" } },
            tipo: { type: ["string", "null"] },
            valor: { type: ["number", "null"] },
            data: { type: ["string", "null"] },
            favorecido_nome: { type: ["string", "null"] },
            favorecido_documento: { type: ["string", "null"] },
            chave_pix: { type: ["string", "null"] },
            linha_digitavel: { type: ["string", "null"] },
          },
        },
      },
      avisos: { type: "array", items: { type: "string" } },
    },
  },
}

export type ArquivoLido = {
  caminho: string
  nome: string
  totalPaginas: number
  comprovantes: ComprovanteLido[]
  avisos: string[]
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "")
const strOuNull = (v: unknown) => str(v) || null
function dataIso(v: unknown): string | null {
  const s = str(v)
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""
  return iso && !Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) ? iso : null
}

/** Imagem (JPG/PNG) vira um PDF de uma página: o comprovante da ordem é sempre PDF. */
async function imagemParaPdf(bytes: Uint8Array, tipo: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const img = tipo === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  const largura = 595
  const escala = Math.min(1, largura / img.width)
  const page = pdf.addPage([img.width * escala, img.height * escala])
  page.drawImage(img, { x: 0, y: 0, width: img.width * escala, height: img.height * escala })
  return pdf.save()
}

/** Só as páginas pedidas (1 = primeira); todas, se a lista cobre o arquivo. */
async function separarPaginas(bytes: Uint8Array, paginas: number[]): Promise<Uint8Array> {
  const origem = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = origem.getPageCount()
  const validas = [...new Set(paginas)].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  if (validas.length === 0 || validas.length === total) return bytes
  const novo = await PDFDocument.create()
  const copiadas = await novo.copyPages(origem, validas.map((p) => p - 1))
  copiadas.forEach((p) => novo.addPage(p))
  return novo.save()
}

async function limparPendentesAntigos(emp: string): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).list(`pendentes/${emp}`, { limit: 1000 })
  const limite = Date.now() - 3 * 86_400_000
  const velhos = (data ?? [])
    .filter((f) => f.created_at && Date.parse(f.created_at) < limite)
    .map((f) => `pendentes/${emp}/${f.name}`)
  if (velhos.length) await admin.storage.from(BUCKET).remove(velhos)
}

/** Guarda o arquivo como pendente e devolve os comprovantes que a IA leu nele. */
export async function lerArquivoDeComprovantes(arquivo: File): Promise<ArquivoLido | { erro: string }> {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return { erro: `${arquivo.name}: envie PDF, JPG ou PNG.` }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: `${arquivo.name}: o arquivo deve ter no máximo 4 MB.` }
  const emp = await tenantAtual()
  const original = new Uint8Array(await arquivo.arrayBuffer())
  const ehPdf = arquivo.type === "application/pdf"
  let pdf: Uint8Array
  try {
    pdf = ehPdf ? original : await imagemParaPdf(original, arquivo.type)
  } catch {
    return { erro: `${arquivo.name}: não foi possível abrir o arquivo.` }
  }

  // Leitura: PDF com texto vai como texto, página a página (barato); PDF
  // digitalizado e foto vão pela visão.
  let totalPaginas = 1
  let resultado
  const prompt = "Leia os comprovantes deste arquivo e devolva o JSON pedido."
  if (ehPdf) {
    let paginas: string[] = []
    try {
      const doc = await getDocumentProxy(new Uint8Array(pdf))
      const t = await extractText(doc, { mergePages: false })
      totalPaginas = t.totalPages
      paginas = t.text
    } catch {
      return { erro: `${arquivo.name}: o PDF não pôde ser lido (protegido ou corrompido?).` }
    }
    const texto = paginas.map((p, i) => `=== Página ${i + 1} ===\n${p.trim()}`).join("\n\n")
    const comTexto = paginas.filter((p) => p.trim().length >= 40).length
    resultado =
      comTexto === paginas.length && texto.length < 120_000
        ? await gerarJsonIA({ system: SISTEMA, prompt: `Texto do arquivo, separado por página:\n\n${texto}`, esquema: ESQUEMA })
        : await gerarJsonIADePdf({ system: SISTEMA, prompt, pdfBase64: Buffer.from(pdf).toString("base64"), esquema: ESQUEMA })
  } else {
    resultado = await gerarJsonIADeImagem({
      system: SISTEMA,
      prompt,
      imagemBase64: Buffer.from(original).toString("base64"),
      mimeType: arquivo.type,
      esquema: ESQUEMA,
    })
  }
  if (resultado.erro || !resultado.dados) return { erro: `${arquivo.name}: ${resultado.erro ?? "a IA não conseguiu ler o arquivo."}` }

  const brutos = Array.isArray(resultado.dados.comprovantes) ? (resultado.dados.comprovantes as Record<string, unknown>[]) : []
  const comprovantes: ComprovanteLido[] = brutos.map((c) => {
    const paginas = (Array.isArray(c.paginas) ? c.paginas : [])
      .map(Number)
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= totalPaginas)
    const valor = typeof c.valor === "number" && Number.isFinite(c.valor) && c.valor > 0 ? Math.round(c.valor * 100) / 100 : null
    return {
      paginas: paginas.length ? paginas : brutos.length === 1 ? [] : [1],
      tipo: strOuNull(c.tipo),
      valor,
      data: dataIso(c.data),
      favorecido: strOuNull(c.favorecido_nome),
      documento: strOuNull(c.favorecido_documento),
      chavePix: strOuNull(c.chave_pix),
      linhaDigitavel: str(c.linha_digitavel).replace(/\D/g, "") || null,
    }
  })

  const caminho = `pendentes/${emp}/${randomUUID()}.pdf`
  const admin = await createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf" })
  if (error) return { erro: `${arquivo.name}: falha ao guardar o arquivo (${error.message}).` }
  void limparPendentesAntigos(emp).catch(() => undefined)

  const avisos = Array.isArray(resultado.dados.avisos) ? resultado.dados.avisos.map(str).filter(Boolean) : []
  return { caminho, nome: arquivo.name, totalPaginas, comprovantes, avisos }
}

/** Resumo da ordem para a tela de conferência. */
export type OrdemResumo = {
  id: string
  codigo: string | null
  situacao: string | null
  descricao: string | null
  favorecido: string | null
  forma: string | null
  valor: number | null
  vencimento: string | null
  dataPagamento: string | null
}

type LinhaCandidata = {
  id: string
  codigo: string | null
  situacao: string | null
  descricao: string | null
  forma_pagamento: string | null
  valor_inicial_cobranca: number | null
  valor_pago: number | null
  vencimento: string | null
  data_pagamento: string | null
  boleto_linha_digitavel: string | null
  dados_bancarios_id: string | null
  fornecedor_id: string | null
  beneficiario_fornecedor_id: string | null
  beneficiario_usuario_id: string | null
  beneficiario_nome_avulso: string | null
  beneficiario_doc_avulso: string | null
  custeio_id: string | null
}

const SELECT_CANDIDATA =
  "id, codigo, situacao, descricao, forma_pagamento, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, boleto_linha_digitavel, dados_bancarios_id, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, beneficiario_doc_avulso, custeio_id"

/** Situações em que a ordem pode receber o comprovante. */
const SITUACOES_ALVO = ["Paga", ...SITUACOES_PAGAVEIS]

async function montarCandidatas(linhas: LinhaCandidata[]): Promise<OrdemCandidata[]> {
  const admin = await createAdminClient()
  const dbIds = [...new Set(linhas.map((l) => l.dados_bancarios_id).filter((v): v is string => !!v))]
  const [favorecidos, dados] = await Promise.all([
    favorecidosDasOrdens(linhas),
    lerEmLotesPorIds(dbIds, (fatia, de, ate) =>
      admin.from("dados_bancarios").select("id, pix").in("id", fatia).order("id").range(de, ate)
    ),
  ])
  const pix = new Map(dados.map((d) => [String(d.id), str(d.pix)]))
  return linhas.map((l) => {
    const f = favorecidos.get(l.id)
    return {
      id: l.id,
      codigo: l.codigo,
      situacao: l.situacao,
      descricao: l.descricao,
      forma: l.forma_pagamento,
      valor: l.valor_inicial_cobranca === null ? null : Number(l.valor_inicial_cobranca),
      valorPago: l.valor_pago === null ? null : Number(l.valor_pago),
      vencimento: l.vencimento,
      dataPagamento: l.data_pagamento,
      favorecido: f?.nome ?? l.beneficiario_nome_avulso,
      documento: f?.documento ?? l.beneficiario_doc_avulso,
      linhaDigitavel: l.boleto_linha_digitavel,
      chavesPix: [pix.get(l.dados_bancarios_id ?? "")].filter((v): v is string => !!v),
    }
  })
}

/**
 * Ordens que podem receber comprovante: sem comprovante, Paga (pagamento no
 * último ano) ou ainda a pagar. Dinheiro fica de fora (pago no caixa, sem
 * comprovante bancário).
 */
export async function ordensSemComprovante(): Promise<OrdemCandidata[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const desde = new Date(Date.parse(`${hojeSP()}T12:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10)
  const linhas = await lerEmLotes<LinhaCandidata>((de, ate) =>
    admin
      .from("ordens_pagamento")
      .select(SELECT_CANDIDATA)
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true)
      .is("arquivo_pagamento", null)
      .in("situacao", SITUACOES_ALVO)
      .or(`situacao.neq.Paga,data_pagamento.gte.${desde}`)
      .or("forma_pagamento.is.null,forma_pagamento.not.in.(Dinheiro,Cartão)")
      .order("id")
      .range(de, ate)
  )
  return montarCandidatas(linhas)
}

/**
 * Ordens ainda a pagar (A pagar/Processando) com vencimento perto do período
 * dado — candidatas para os débitos do extrato bancário (conciliacao-pagar.ts).
 */
export async function ordensAPagar(de: string, ate: string): Promise<OrdemCandidata[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<LinhaCandidata>((a, b) =>
    admin
      .from("ordens_pagamento")
      .select(SELECT_CANDIDATA)
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true)
      .in("situacao", SITUACOES_PAGAVEIS)
      .or(`vencimento.is.null,and(vencimento.gte.${de},vencimento.lte.${ate})`)
      .order("id")
      .range(a, b)
  )
  return montarCandidatas(linhas)
}

/** Uma ordem pelo código (busca manual na conferência), se ainda pode receber comprovante. */
export async function candidataPorCodigo(codigo: string): Promise<OrdemCandidata | { erro: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select(`${SELECT_CANDIDATA}, arquivo_pagamento`)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("excluido", "is", true)
    .eq("codigo", codigo.trim())
    .maybeSingle()
  if (!data) return { erro: `Ordem ${codigo} não encontrada.` }
  if (data.arquivo_pagamento) return { erro: `A ordem ${codigo} já tem comprovante.` }
  if (!SITUACOES_ALVO.includes(String(data.situacao))) return { erro: `A ordem ${codigo} está "${data.situacao}".` }
  const [c] = await montarCandidatas([data as unknown as LinhaCandidata])
  return c
}

export function resumoDaOrdem(o: OrdemCandidata): OrdemResumo {
  return {
    id: o.id,
    codigo: o.codigo,
    situacao: o.situacao,
    descricao: o.descricao,
    favorecido: o.favorecido,
    forma: o.forma,
    valor: o.situacao === "Paga" ? (o.valorPago ?? o.valor) : o.valor,
    vencimento: o.vencimento,
    dataPagamento: o.dataPagamento,
  }
}

export function sugestoesPara(comprovantes: ComprovanteLido[], candidatas: OrdemCandidata[]): Sugestao[][] {
  return comprovantes.map((c) => sugerirOrdens(c, candidatas))
}

export type Vinculo = {
  caminho: string
  paginas: number[]
  nomeArquivo: string
  ordemId: string
  valor: number | null
  data: string | null
}

/** Anexa o comprovante à ordem; a ordem a pagar é paga com a data e o valor dele. */
export async function vincularComprovante(
  v: Vinculo,
  { centroReceitaId, usuarioId }: { centroReceitaId: string | null; usuarioId: string }
): Promise<{ erro?: string; pagou?: boolean }> {
  const emp = await tenantAtual()
  if (!v.caminho.startsWith(`pendentes/${emp}/`) || v.caminho.includes("..")) return { erro: "Arquivo inválido." }
  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao, arquivo_pagamento, valor_inicial_cobranca")
    .eq("id", v.ordemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.arquivo_pagamento) return { erro: "a ordem já tem comprovante." }
  const situacao = String(ordem.situacao)
  if (!SITUACOES_ALVO.includes(situacao)) return { erro: `a ordem está "${situacao}".` }

  const { data: blob, error: erroDown } = await admin.storage.from(BUCKET).download(v.caminho)
  if (erroDown || !blob) return { erro: "o arquivo enviado expirou — envie de novo." }
  let bytes: Uint8Array
  try {
    bytes = await separarPaginas(new Uint8Array(await blob.arrayBuffer()), v.paginas)
  } catch {
    return { erro: "não foi possível separar as páginas do arquivo." }
  }
  const paginasTexto = v.paginas.length ? ` (pág. ${v.paginas.join(", ")})` : ""

  if (situacao === "Paga") {
    const caminho = `ordens/${v.ordemId}/${Date.now()}.pdf`
    const { error: erroUp } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: "application/pdf" })
    if (erroUp) return { erro: `falha ao subir o comprovante: ${erroUp.message}` }
    // Só grava se continua sem comprovante (dois cliques ao mesmo tempo).
    const { data: atualizada, error } = await admin
      .from("ordens_pagamento")
      .update({ arquivo_pagamento: caminho })
      .eq("id", v.ordemId)
      .is("arquivo_pagamento", null)
      .select("id")
    if (error || !atualizada?.length) {
      await admin.storage.from(BUCKET).remove([caminho])
      return { erro: error ? error.message : "a ordem já tem comprovante." }
    }
    await registrarEvento(v.ordemId, "comprovante_anexado", usuarioId, `Comprovante distribuído do arquivo ${v.nomeArquivo}${paginasTexto}.`, {
      arquivo: v.nomeArquivo,
      paginas: v.paginas,
    })
    const { enviarComprovanteAutomatico } = await import("@/lib/db/comprovante-fornecedor")
    await enviarComprovanteAutomatico(v.ordemId, usuarioId)
    return {}
  }

  if (!centroReceitaId) return { erro: "escolha a conta de onde o dinheiro saiu (a ordem ainda não estava paga)." }
  const valor = v.valor ?? Number(ordem.valor_inicial_cobranca ?? 0)
  if (!(valor > 0)) return { erro: "o comprovante não tem valor e a ordem também não." }
  const r = await registrarPagamentoDaOrdem({
    id: v.ordemId,
    valor,
    dataPagamento: v.data ?? hojeSP(),
    centroReceitaId,
    usuarioId,
    arquivo: new File([bytes as BlobPart], "comprovante.pdf", { type: "application/pdf" }),
  })
  if (r.erro) return { erro: r.erro }
  await registrarEvento(v.ordemId, "comprovante_anexado", usuarioId, `Paga pela distribuição de comprovantes: arquivo ${v.nomeArquivo}${paginasTexto}.`, {
    arquivo: v.nomeArquivo,
    paginas: v.paginas,
  })
  return { pagou: true }
}

export type PagaSemComprovante = {
  id: string
  codigo: string | null
  descricao: string | null
  favorecido: string | null
  forma: string | null
  valor: number | null
  dataPagamento: string | null
}

/**
 * Ordens pagas por Pix, Pix QR Code ou TED ainda sem comprovante — a lista da
 * tela de distribuição (FORMAS_COM_COMPROVANTE). `mes` ("AAAA-MM") filtra pela data do pagamento;
 * sem ele, o último ano. Dinheiro fica de fora (pago no caixa).
 */
export async function pagasSemComprovante(mes: string | null): Promise<PagaSemComprovante[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let de: string
  let ate: string | null = null
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    const [a, m] = mes.split("-").map(Number)
    de = `${mes}-01`
    ate = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  } else {
    de = new Date(Date.parse(`${hojeSP()}T12:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10)
  }
  const linhas = await lerEmLotes<LinhaCandidata>((a, b) => {
    let q = admin
      .from("ordens_pagamento")
      .select(SELECT_CANDIDATA)
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true)
      .eq("situacao", "Paga")
      .is("arquivo_pagamento", null)
      .in("forma_pagamento", FORMAS_COM_COMPROVANTE)
      .gte("data_pagamento", de)
    if (ate) q = q.lte("data_pagamento", ate)
    return q.order("id").range(a, b)
  })
  const favorecidos = await favorecidosDasOrdens(linhas)
  return linhas
    .map((l) => ({
      id: l.id,
      codigo: l.codigo,
      descricao: l.descricao,
      favorecido: favorecidos.get(l.id)?.nome ?? l.beneficiario_nome_avulso,
      forma: l.forma_pagamento,
      valor: l.valor_pago === null ? (l.valor_inicial_cobranca === null ? null : Number(l.valor_inicial_cobranca)) : Number(l.valor_pago),
      dataPagamento: l.data_pagamento,
    }))
    .sort((a, b) => (b.dataPagamento ?? "").localeCompare(a.dataPagamento ?? ""))
}

/** Anexa o PDF escolhido direto à ordem paga (sem leitura pela IA). */
export async function anexarComprovanteDireto(
  ordemId: string,
  arquivo: File,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (arquivo.type !== "application/pdf" && !["image/jpeg", "image/png"].includes(arquivo.type)) {
    return { erro: "Envie PDF, JPG ou PNG." }
  }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo deve ter no máximo 4 MB." }
  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, arquivo_pagamento")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.situacao !== "Paga") return { erro: "Só ordem paga recebe o comprovante por aqui." }
  if (ordem.arquivo_pagamento) return { erro: "A ordem já tem comprovante." }
  const original = new Uint8Array(await arquivo.arrayBuffer())
  let pdf: Uint8Array
  try {
    pdf = arquivo.type === "application/pdf" ? original : await imagemParaPdf(original, arquivo.type)
  } catch {
    return { erro: "Não foi possível abrir o arquivo." }
  }
  const caminho = `ordens/${ordemId}/${Date.now()}.pdf`
  const { error: erroUp } = await admin.storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf" })
  if (erroUp) return { erro: `Falha ao subir o comprovante: ${erroUp.message}` }
  const { data: atualizada, error } = await admin
    .from("ordens_pagamento")
    .update({ arquivo_pagamento: caminho })
    .eq("id", ordemId)
    .is("arquivo_pagamento", null)
    .select("id")
  if (error || !atualizada?.length) {
    await admin.storage.from(BUCKET).remove([caminho])
    return { erro: error ? error.message : "A ordem já tem comprovante." }
  }
  await registrarEvento(ordemId, "comprovante_anexado", usuarioId, `Comprovante anexado pela lista da distribuição (${arquivo.name}).`, {
    arquivo: arquivo.name,
  })
  const { enviarComprovanteAutomatico } = await import("@/lib/db/comprovante-fornecedor")
  await enviarComprovanteAutomatico(ordemId, usuarioId)
  return {}
}
