"use server"

import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { TIPOS_COMPROVANTE_COMPRAS } from "@/lib/db/compras"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"

/**
 * Leitura da GUIA do tributo pela IA (fase 4 de docs/plano-tributos.md): ao
 * anexar a guia no "Lançar guia", valor, vencimento, competência e código de
 * barras vêm preenchidos para conferir. Mesmo caminho da nota da compra: PDF
 * com texto vai como texto (barato); digitalizado ou foto, pela visão.
 */

const SISTEMA_GUIA = `Você lê guias de recolhimento de tributos brasileiros pagas por um sindicato: DARF (Receita Federal), DCTFWeb/DARF previdenciário, GPS (INSS), guia do FGTS (FGTS Digital / GRF), DAM e guias municipais de IPTU, ISS, taxas e alvará, DUDA/GRT do Detran, DAE estadual, boletos de órgãos públicos — muitas vezes digitalizadas ou fotografadas.

Devolva um JSON com estas chaves (use null quando o dado não aparecer ou estiver ilegível — NUNCA chute):
- "tipo_guia": nome curto da guia (ex.: "DARF", "GPS", "FGTS Digital", "DAM", "DUDA").
- "orgao": órgão arrecadador como aparece (ex.: "Receita Federal", "Caixa Econômica Federal", "Prefeitura de Macaé").
- "competencia": o MÊS DE REFERÊNCIA no formato AAAA-MM — o "período de apuração", a "competência" ou o mês a que o tributo se refere (NÃO o mês do vencimento, que costuma ser o seguinte). No DARF, o período de apuração é uma data: devolva o mês dela.
- "vencimento": data de vencimento / "pagar até" / "data limite", no formato AAAA-MM-DD.
- "valor_total": valor TOTAL a recolher (principal + multa + juros + encargos), número com ponto decimal.
- "valor_principal": valor principal, se a guia separar; senão null.
- "codigo_barras": a linha digitável ou o código de barras, SÓ OS DÍGITOS, na ordem em que aparecem (guias de arrecadação têm 48 dígitos na linha digitável, começando com 8; boletos bancários têm 47).
- "codigo_receita": código da receita/tributo (DARF/GPS), se houver.
- "contribuinte_documento": CNPJ/CPF do contribuinte (só dígitos), se houver.
- "avisos": lista de strings com o que ficou ilegível, ambíguo ou incoerente (ex.: total diferente da soma, vencimento já passado, código de barras incompleto). Lista vazia se nada.`

export type LeituraGuia = {
  erro?: string
  /** "1234,56", no formato do campo. */
  valor?: string
  vencimento?: string
  /** "AAAA-MM", no formato do campo de mês. */
  competencia?: string
  linhaDigitavel?: string
  /** "DARF — Receita Federal · código 1082". */
  resumo?: string
  avisos?: string[]
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
}
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = str(v)
  if (!s) return null
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)
  return Number.isFinite(n) ? n : null
}
function dataIso(v: unknown): string {
  const s = str(v)
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ""
  return iso && !Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) ? iso : ""
}
function mes(v: unknown): string {
  const s = str(v)
  const iso = s.match(/^(\d{4})-(\d{2})/)
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}`
  const br = s.match(/^(\d{2})\/(\d{4})$/)
  if (br && Number(br[1]) >= 1 && Number(br[1]) <= 12) return `${br[2]}-${br[1]}`
  return ""
}

/** Lê a guia anexada e devolve os campos para pré-preencher o lançamento. */
export async function lerGuiaTributo(formData: FormData): Promise<LeituraGuia> {
  await requirePermissao("financeiro_tributos")
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo da guia." }
  if (!TIPOS_COMPROVANTE_COMPRAS[arquivo.type]) return { erro: "Envie um PDF ou uma imagem (JPG, PNG ou WEBP)." }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "O arquivo deve ter no máximo 4 MB." }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())
  const base64 = Buffer.from(buffer).toString("base64")
  const prompt = "Leia esta guia de recolhimento e devolva o JSON pedido."
  let resultado
  if (arquivo.type === "application/pdf") {
    let texto = ""
    try {
      // getDocumentProxy esvazia o buffer (transfere): o base64 já foi tirado antes.
      const pdf = await getDocumentProxy(buffer)
      texto = (await extractText(pdf, { mergePages: true })).text.trim()
    } catch {
      // PDF só-imagem: segue para a visão.
    }
    resultado =
      texto.length >= 60
        ? await gerarJsonIA({ system: SISTEMA_GUIA, prompt: `Texto da guia:\n\n${texto.slice(0, 40000)}` })
        : await gerarJsonIADePdf({ system: SISTEMA_GUIA, prompt, pdfBase64: base64 })
  } else {
    resultado = await gerarJsonIADeImagem({ system: SISTEMA_GUIA, prompt, imagemBase64: base64, mimeType: arquivo.type })
  }
  const { dados, erro } = resultado
  if (erro || !dados) return { erro: erro ?? "A IA não conseguiu ler a guia." }

  const avisos = Array.isArray(dados.avisos) ? dados.avisos.map(str).filter(Boolean) : []
  const valor = num(dados.valor_total) ?? num(dados.valor_principal)
  const vencimento = dataIso(dados.vencimento)
  const competencia = mes(dados.competencia)
  const codigo = str(dados.codigo_barras).replace(/\D/g, "")
  // Linha digitável de arrecadação: 48 (ou código de barras de 44); boleto: 47.
  if (codigo && ![44, 47, 48].includes(codigo.length)) {
    avisos.push(`O código de barras lido tem ${codigo.length} dígitos (o esperado é 47 ou 48) — confira na guia.`)
  }
  if (!valor) avisos.push("O valor não foi encontrado — preencha à mão.")
  if (!vencimento) avisos.push("O vencimento não foi encontrado — preencha à mão.")
  if (!competencia) avisos.push("A competência não foi encontrada — confira o mês de referência.")

  const tipo = str(dados.tipo_guia)
  const orgao = str(dados.orgao)
  const receita = str(dados.codigo_receita)
  return {
    valor: valor ? valor.toFixed(2).replace(".", ",") : "",
    vencimento,
    competencia,
    linhaDigitavel: codigo,
    resumo: [tipo, orgao].filter(Boolean).join(" — ") + (receita ? ` · código ${receita}` : ""),
    avisos,
  }
}
