"use server"

import { revalidatePath } from "next/cache"
import { extractText, getDocumentProxy } from "unpdf"
import * as XLSX from "xlsx"

import { requirePermissao } from "@/lib/auth"
import { decodificarCsv } from "@/lib/csv"
import { gravarLoteAbastecimentos } from "@/lib/db/veiculos"
import {
  resolverAbastecimentos,
  type ItemAbastecimento,
  type LinhaResolvida,
} from "@/lib/db/veiculos-abastecimentos-ia"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { parseValorBR } from "@/lib/valores"
import { parseHodometro } from "@/lib/veiculos-constantes"

const MAX_ITENS = 2000
const MAX_TEXTO = 120000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IMAGENS: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
}

export type EstadoLeituraAbastecimentos = {
  linhas?: LinhaResolvida[]
  arquivoNome?: string
  descartadas?: number
  erro?: string
}

const SISTEMA = `Você extrai abastecimentos de veículos de um relatório: fatura de cartão-combustível (Ticket Log, Prime, Veloe, Sem Parar, Goodcard…), extrato de posto, planilha ou cupom fiscal. O layout varia.
Devolva um objeto JSON no formato:
{ "abastecimentos": [ { "placa": "", "data": "AAAA-MM-DD", "hora": "HH:MM", "posto": "", "cidade": "", "combustivel": "", "litros": 0, "valor": 0, "hodometro": 0, "condutor": "" } ] }
Regras:
- Uma entrada por ABASTECIMENTO (transação). NÃO inclua linhas de total, subtotal, tarifa, taxa de administração, cabeçalho ou rodapé.
- "placa": placa do veículo como aparece ("" se o relatório não trouxer).
- "data": data do abastecimento em AAAA-MM-DD. Datas brasileiras vêm como DD/MM/AAAA.
- "hora": HH:MM se houver, senão "".
- "posto": nome do posto/estabelecimento; "cidade": cidade do posto ("" se não houver).
- "combustivel": como aparece (ex.: GASOLINA COMUM, ETANOL, DIESEL S10).
- "litros": quantidade em litros, número com ponto decimal. "valor": valor TOTAL pago na transação em reais, número com ponto decimal. NÃO confunda com preço por litro.
- "hodometro": km informado na transação (número inteiro) ou null se não houver.
- "condutor": nome do motorista, se houver, senão "".
- Não invente dados; campo ausente fica "" (ou null no hodômetro).
- Extraia TODAS as transações.
- Responda APENAS com o objeto JSON.`

function textoCampo(v: unknown, max = 120): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

function numeroCampo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string" || !v.trim()) return null
  // Com vírgula é formato brasileiro ("1.234,56"); sem, ponto é decimal ("41.01").
  if (v.includes(",")) return parseValorBR(v)
  const n = Number(v.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

function dataCampo(v: unknown): string | null {
  const s = textoCampo(v, 20)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

/** Higieniza uma linha (da IA ou devolvida pelo navegador). */
function higienizar(c: Record<string, unknown>): ItemAbastecimento | null {
  const data = dataCampo(c.data)
  const litros = numeroCampo(c.litros)
  const valor = numeroCampo(c.valor)
  if (!data || litros === null || !(litros > 0) || valor === null || !(valor > 0)) return null
  const horaTxt = textoCampo(c.hora, 8)
  const hora = horaTxt && /^\d{1,2}:\d{2}/.test(horaTxt) ? horaTxt.slice(0, 5).padStart(5, "0") : null
  const km =
    typeof c.hodometro === "number"
      ? Math.round(c.hodometro)
      : typeof c.hodometro === "string"
        ? parseHodometro(c.hodometro)
        : null
  const placa = textoCampo(c.placa, 12)?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null
  return {
    placa,
    data,
    hora,
    posto: textoCampo(c.posto)?.toUpperCase() ?? null,
    cidade: textoCampo(c.cidade, 80)?.toUpperCase() ?? null,
    combustivel: textoCampo(c.combustivel, 60)?.toUpperCase() ?? null,
    litros: Math.round(litros * 1000) / 1000,
    valor: Math.round(valor * 100) / 100,
    hodometro: km !== null && km > 0 ? km : null,
    condutor: textoCampo(c.condutor),
  }
}

export async function lerRelatorioAbastecimentosIa(
  _prev: EstadoLeituraAbastecimentos,
  formData: FormData
): Promise<EstadoLeituraAbastecimentos> {
  await requirePermissao("veiculos_gestao")
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o relatório (PDF, Excel, CSV ou foto)." }
  }
  if (arquivo.size > 20 * 1024 * 1024) return { erro: "Arquivo grande demais — máximo de 20 MB." }
  const veiculoPadrao = String(formData.get("veiculo_padrao") ?? "")
  const veiculoPadraoId = UUID.test(veiculoPadrao) ? veiculoPadrao : null

  const nome = arquivo.name.toLowerCase()
  const ehPdf = arquivo.type === "application/pdf" || nome.endsWith(".pdf")
  const ehExcel =
    nome.endsWith(".xlsx") || nome.endsWith(".xls") || arquivo.type.includes("spreadsheet") || arquivo.type.includes("ms-excel")
  const ehImagem = Boolean(IMAGENS[arquivo.type])

  let texto = ""
  let buffer: Uint8Array | null = null
  try {
    if (ehImagem) {
      buffer = new Uint8Array(await arquivo.arrayBuffer())
    } else if (ehPdf) {
      buffer = new Uint8Array(await arquivo.arrayBuffer())
      const pdf = await getDocumentProxy(buffer)
      texto = (await extractText(pdf, { mergePages: true })).text.trim()
    } else if (ehExcel) {
      const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array" })
      texto = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n").trim()
    } else {
      texto = decodificarCsv(await arquivo.arrayBuffer()).trim()
    }
  } catch {
    // PDF só-imagem pode falhar na extração de texto: a visão ainda tenta.
    if (!ehPdf || !buffer) return { erro: "Não consegui ler o arquivo." }
  }

  let extracao
  if (ehImagem && buffer) {
    extracao = await gerarJsonIADeImagem({
      system: SISTEMA,
      prompt: "Leia os abastecimentos desta imagem (cupom, fatura ou relatório fotografado).",
      imagemBase64: Buffer.from(buffer).toString("base64"),
      mimeType: arquivo.type,
    })
  } else if (texto.length >= 20) {
    extracao = await gerarJsonIA({
      system: SISTEMA,
      prompt: `Relatório de abastecimentos:\n\n${texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO) : texto}`,
    })
  } else if (ehPdf && buffer) {
    extracao = await gerarJsonIADePdf({
      system: SISTEMA,
      prompt: "Leia os abastecimentos deste relatório (o PDF pode ser escaneado).",
      pdfBase64: Buffer.from(buffer).toString("base64"),
    })
  } else {
    return { erro: "O arquivo está vazio ou não tem dados legíveis." }
  }

  const { dados, erro } = extracao
  if (erro || !dados) return { erro: erro ?? "Falha na leitura." }
  const bruto = Array.isArray(dados.abastecimentos) ? (dados.abastecimentos as unknown[]) : []
  if (bruto.length === 0) return { erro: "A IA não encontrou abastecimentos neste arquivo." }

  const itens: ItemAbastecimento[] = []
  let descartadas = 0
  for (const cru of bruto.slice(0, MAX_ITENS)) {
    const item = cru && typeof cru === "object" ? higienizar(cru as Record<string, unknown>) : null
    if (item) itens.push(item)
    else descartadas++
  }
  if (itens.length === 0) {
    return { erro: "Nenhum abastecimento válido (linhas sem data, litros ou valor)." }
  }

  return {
    linhas: await resolverAbastecimentos(itens, veiculoPadraoId),
    arquivoNome: arquivo.name.slice(0, 200),
    descartadas,
  }
}

/**
 * Grava as linhas conferidas. Tudo é resolvido de novo no servidor (placa,
 * condutor, duplicidade) — entram todas menos as já lançadas e as repetidas
 * no arquivo. Devolve quantas ficaram sem veículo, para vincular depois.
 */
export async function registrarAbastecimentosIa(
  itens: ItemAbastecimento[],
  veiculoPadraoId: string | null,
  arquivoNome: string
): Promise<{
  importados?: number
  ignorados?: number
  semVeiculo?: number
  semCondutor?: number
  erro?: string
}> {
  const sessao = await requirePermissao("veiculos_gestao")
  if (!Array.isArray(itens) || itens.length === 0) return { erro: "Nada para registrar." }
  const limpos = itens
    .slice(0, MAX_ITENS)
    .map((i) => (i && typeof i === "object" ? higienizar(i as unknown as Record<string, unknown>) : null))
    .filter((i): i is ItemAbastecimento => i !== null)
  const resolvidas = await resolverAbastecimentos(
    limpos,
    veiculoPadraoId && UUID.test(veiculoPadraoId) ? veiculoPadraoId : null
  )
  // Placa fora da frota também entra — sem veículo, com a placa guardada.
  const ok = resolvidas.filter((l) => l.situacao === "ok" || l.situacao === "sem_veiculo")
  if (ok.length === 0) return { erro: "Nenhuma linha para lançar — todas já estão lançadas." }

  const { importados, erro } = await gravarLoteAbastecimentos(
    ok.map((l) => ({
      veiculo_id: l.veiculoId,
      condutor_usuario_id: l.condutorId,
      placa_informada: l.placa,
      condutor_informado: l.condutorId ? null : l.condutor,
      posto: l.posto ?? "(sem posto)",
      cidade: l.cidade,
      combustivel: l.combustivel ?? "(sem combustível)",
      volume: l.litros,
      valor: l.valor,
      hodometro: l.hodometro,
      // Hora local de São Paulo; sem hora no relatório, meio-dia.
      data_hora: `${l.data}T${l.hora ?? "12:00"}:00-03:00`,
    })),
    `IA: ${arquivoNome || "relatório"}`,
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/abastecimentos")
  revalidatePath("/painel/veiculos")
  return {
    importados,
    ignorados: resolvidas.length - ok.length,
    semVeiculo: ok.filter((l) => !l.veiculoId).length,
    semCondutor: ok.filter((l) => !l.condutorId && l.condutor).length,
  }
}
