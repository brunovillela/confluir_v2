"use server"

import { revalidatePath } from "next/cache"
import { extractText, getDocumentProxy } from "unpdf"
import * as XLSX from "xlsx"

import { requirePermissao } from "@/lib/auth"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { decodificarCsv } from "@/lib/csv"
import { regrasFiliacao } from "@/lib/db/organizacao"
import {
  invalidarCacheRemessa,
  registrarFormaNoCadastro,
  resolverFiliadosLoteDetalhado,
  type ViaCasamento,
} from "@/lib/db/receitas"
import { formaRecebimento } from "@/lib/filiacao"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ITENS = 20000
/** Segmento da URL dos lançamentos sem fonte pagadora (ver actions.ts). */
const SEM_FONTE = "sem-fonte"

/** uuid → a própria fonte; "sem-fonte" → null; outra coisa → undefined (inválido). */
function fonteDoSegmento(fonteId: string): string | null | undefined {
  if (fonteId === SEM_FONTE) return null
  return UUID.test(fonteId) ? fonteId : undefined
}
const MAX_TEXTO = 120000

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

export type ItemContribuicao = {
  cpf: string | null
  matriculaFonte: string | null
  nome: string | null
  valor: number
}

/** Item enriquecido só para o preview (como o filiado foi casado). */
export type PreviewContribuicao = ItemContribuicao & {
  via: ViaCasamento
}

export type EstadoExtracaoContrib = {
  itens?: PreviewContribuicao[]
  totalValor?: number
  casados?: number
  naoCasados?: number
  descartadas?: number
  erro?: string
}

const SISTEMA = `Você extrai contribuições sindicais de um relatório enviado por uma empresa (fonte pagadora). O relatório pode vir em qualquer layout, tabular ou não.
Devolva um objeto JSON no formato: { "contribuicoes": [ { "nome": "...", "cpf": "...", "matricula": "...", "valor": 0 } ] }
Os relatórios normalmente trazem NOME + MATRÍCULA na empresa + VALOR (o CPF costuma não vir).
Regras:
- Uma entrada por EMPREGADO / linha de pagamento. NÃO inclua linhas de total, subtotal, cabeçalho ou rodapé.
- "nome": nome do empregado como aparece no relatório ("" se não houver).
- "cpf": apenas os dígitos do CPF do empregado ("" se não houver).
- "matricula": matrícula do empregado na empresa/fonte ("" se não houver).
- "valor": o valor da contribuição como número (ponto decimal). NÃO invente valores.
- Inclua a linha se ela tiver ao menos NOME, CPF ou matrícula. Ignore apenas cabeçalho, total, subtotal e rodapé.
- Extraia TODAS as linhas de empregado do relatório.
- Responda APENAS com o objeto JSON.`

export async function extrairContribuicoesIa(
  _prev: EstadoExtracaoContrib,
  formData: FormData
): Promise<EstadoExtracaoContrib> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const remessaId = String(formData.get("remessa_id") ?? "")
  const fonteDb = fonteDoSegmento(String(formData.get("fonte_id") ?? ""))
  if (!UUID.test(remessaId) || fonteDb === undefined) {
    return { erro: "Remessa ou fonte inválida." }
  }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo (CSV, TXT, Excel, PDF ou imagem)." }
  }

  const nomeArq = arquivo.name.toLowerCase()
  const mimeImagem = mimeDeImagem(arquivo.type, nomeArq)
  if (mimeImagem) {
    // Foto/print da relação → VISÃO direto sobre a imagem.
    if (arquivo.size > 20 * 1024 * 1024) {
      return { erro: "Imagem grande demais — máximo de 20 MB." }
    }
    const extracao = await gerarJsonIADeImagem({
      system: SISTEMA,
      prompt:
        "Leia o relatório de contribuições desta empresa (foto ou print) e extraia as linhas de empregado.",
      imagemBase64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
      mimeType: mimeImagem,
    })
    return montarPreview(extracao, fonteDb, remessaId)
  }
  if (/\.(heic|heif|tiff?|bmp)$/.test(nomeArq)) {
    return {
      erro: "Formato de imagem não suportado — use JPG, PNG, WebP ou GIF.",
    }
  }

  const ehPdf = arquivo.type === "application/pdf" || nomeArq.endsWith(".pdf")
  const ehExcel =
    nomeArq.endsWith(".xlsx") ||
    nomeArq.endsWith(".xls") ||
    arquivo.type.includes("spreadsheet") ||
    arquivo.type.includes("ms-excel")
  let texto = ""
  let pdfBuffer: Uint8Array | null = null
  try {
    if (ehPdf) {
      pdfBuffer = new Uint8Array(await arquivo.arrayBuffer())
      const pdf = await getDocumentProxy(pdfBuffer)
      const extraido = await extractText(pdf, { mergePages: true })
      texto = extraido.text.trim()
    } else if (ehExcel) {
      const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), {
        type: "array",
      })
      texto = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n]))
        .join("\n\n")
        .trim()
    } else {
      texto = decodificarCsv(await arquivo.arrayBuffer()).trim()
    }
  } catch {
    // PDF só-imagem pode falhar na extração de texto; se temos o buffer, a
    // visão ainda tenta. Fora isso, é arquivo mesmo ilegível.
    if (!ehPdf || !pdfBuffer) return { erro: "Não consegui ler o arquivo." }
  }

  // Digital/planilha → extrai do texto. PDF escaneado (sem texto) → VISÃO
  // nativa do modelo sobre o próprio PDF.
  let extracao
  if (texto.length >= 20) {
    const conteudo = texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO) : texto
    extracao = await gerarJsonIA({
      system: SISTEMA,
      prompt: `Relatório da empresa:\n\n${conteudo}`,
    })
  } else if (ehPdf && pdfBuffer) {
    if (arquivo.size > 20 * 1024 * 1024) {
      return { erro: "PDF escaneado grande demais — máximo de 20 MB." }
    }
    extracao = await gerarJsonIADePdf({
      system: SISTEMA,
      prompt:
        "Leia o relatório de contribuições desta empresa (o PDF pode ser escaneado/imagem) e extraia as linhas de empregado.",
      pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
    })
  } else {
    return { erro: "O arquivo está vazio ou não tem dados legíveis." }
  }

  return montarPreview(extracao, fonteDb, remessaId)
}

/** jpg/png/webp/gif (pelo tipo ou pela extensão) → mime aceito pela visão. */
function mimeDeImagem(tipo: string, nomeArq: string): string | null {
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(tipo)) {
    return tipo
  }
  if (/\.(jpe?g|jfif)$/.test(nomeArq)) return "image/jpeg"
  if (nomeArq.endsWith(".png")) return "image/png"
  if (nomeArq.endsWith(".webp")) return "image/webp"
  if (nomeArq.endsWith(".gif")) return "image/gif"
  return null
}

/** Higieniza o JSON da IA e casa cada linha com o filiado (preview). */
async function montarPreview(
  extracao: Awaited<ReturnType<typeof gerarJsonIA>>,
  fonteDb: string | null,
  remessaId: string
): Promise<EstadoExtracaoContrib> {
  const { dados, erro } = extracao
  if (erro || !dados) return { erro: erro ?? "Falha na extração." }

  const bruto = Array.isArray(dados.contribuicoes)
    ? (dados.contribuicoes as unknown[])
    : []
  if (bruto.length === 0) {
    return { erro: "A IA não encontrou contribuições neste arquivo." }
  }

  const base: ItemContribuicao[] = []
  let descartadas = 0
  for (const cru of bruto.slice(0, MAX_ITENS)) {
    const c = cru as Record<string, unknown>
    const nome = typeof c.nome === "string" ? c.nome.trim() : ""
    const cpfTxt =
      typeof c.cpf === "string" || typeof c.cpf === "number"
        ? limparCpf(String(c.cpf))
        : ""
    const cpf = cpfTxt && validarCpf(cpfTxt) ? cpfTxt : ""
    const matricula =
      typeof c.matricula === "string" || typeof c.matricula === "number"
        ? String(c.matricula).replace(/\D/g, "")
        : ""
    const valor =
      typeof c.valor === "number" ? c.valor : parseValor(String(c.valor ?? ""))

    if ((!cpf && !matricula && !nome) || valor === null || !(valor > 0)) {
      descartadas++
      continue
    }
    base.push({
      cpf: cpf || null,
      matriculaFonte: matricula || null,
      nome: nome || null,
      valor,
    })
  }

  if (base.length === 0) {
    return {
      erro: "Nenhuma contribuição válida (linhas sem nome/matrícula/CPF ou sem valor).",
    }
  }

  const resolvidos = await resolverFiliadosLoteDetalhado(fonteDb, remessaId, base)
  const itens: PreviewContribuicao[] = base.map((b, i) => ({
    ...b,
    via: resolvidos[i]?.via ?? null,
  }))
  const casados = itens.filter((i) => i.via !== null).length
  const totalValor = itens.reduce((s, i) => s + i.valor, 0)

  return {
    itens,
    totalValor,
    casados,
    naoCasados: itens.length - casados,
    descartadas,
  }
}

export async function registrarContribuicoesIa(
  remessaId: string,
  fonteId: string,
  itens: ItemContribuicao[],
  formaEscolhida: string
): Promise<{ identificados?: number; naoEncontrados?: number; erro?: string }> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const fonteDb = fonteDoSegmento(fonteId)
  if (!UUID.test(remessaId) || fonteDb === undefined) {
    return { erro: "Remessa ou fonte inválida." }
  }
  const forma = formaRecebimento(formaEscolhida)
  if (!forma) return { erro: "Escolha a forma de recebimento desta lista." }
  if (!fonteDb && (await regrasFiliacao()).exigeFonte) {
    return {
      erro: "Pela regra da entidade, todo recebimento fica vinculado a uma fonte pagadora — envie a lista pela fonte.",
    }
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: "Nada para registrar." }
  }

  // Re-higieniza o que veio do cliente antes de gravar.
  const limpos: ItemContribuicao[] = []
  for (const i of itens.slice(0, MAX_ITENS)) {
    const cpf = i.cpf ? limparCpf(String(i.cpf)) || null : null
    const matriculaFonte = i.matriculaFonte
      ? String(i.matriculaFonte).replace(/\D/g, "") || null
      : null
    const nome =
      typeof i.nome === "string" && i.nome.trim() ? i.nome.trim() : null
    const valor = typeof i.valor === "number" ? i.valor : NaN
    if ((!cpf && !matriculaFonte && !nome) || !(valor > 0)) continue
    limpos.push({ cpf, matriculaFonte, nome, valor })
  }
  if (limpos.length === 0) return { erro: "Nada válido para registrar." }

  const resolvidos = await resolverFiliadosLoteDetalhado(fonteDb, remessaId, limpos)

  const admin = await createAdminClient()
  const empId = await tenantAtual()
  let identificados = 0
  let naoEncontrados = 0
  for (let de = 0; de < limpos.length; de += 300) {
    const lote = limpos.slice(de, de + 300)
    const { error } = await admin.from("filiacao_recebe").insert(
      lote.map((item, j) => {
        const filiadoId = resolvidos[de + j]?.filiadoId ?? null
        if (filiadoId) identificados++
        else naoEncontrados++
        return {
          remessa_id: remessaId,
          fonte_pg_id: fonteDb,
          filiado_id: filiadoId,
          cpf: item.cpf,
          fonte_pg_matricula: item.matriculaFonte,
          valor: item.valor,
          forma_recebimento: forma,
          emp_proprietaria_id: empId,
        }
      })
    )
    if (error) return { erro: `Falha ao gravar os lançamentos: ${error.message}` }
  }
  await registrarFormaNoCadastro(
    remessaId,
    resolvidos.map((r) => r?.filiadoId ?? null),
    forma
  )

  invalidarCacheRemessa(remessaId)
  revalidatePath(`/painel/filiados/receitas/${remessaId}`)
  revalidatePath(`/painel/filiados/receitas/${remessaId}/${fonteId}`)
  return { identificados, naoEncontrados }
}
