import "server-only"
import OpenAI from "openai"

/**
 * Camada única de acesso ao modelo de IA (OpenAI, Responses API). Lê a chave e
 * o modelo do ambiente e faz UMA chamada. Trocar o modelo é só mudar
 * `MODELO_IA` no .env.local — vale p/ TODAS as features de IA (descrição de
 * compras, ofícios, extração de CAT de PDF, recebimento por fonte…).
 *
 * Modelo padrão: gpt-5.5. Para reduzir custo, o usuário pode apontar
 * `MODELO_IA` para um modelo mais barato (ex.: gpt-5.4-mini ou gpt-5.4-nano) —
 * o código funciona em qualquer um deles.
 */
export const MODELO_IA = process.env.MODELO_IA?.trim() || "gpt-5.5"

// Teto de tokens de saída. Texto é curto; extração de JSON pode ser grande
// (CAT com 50 campos, relatório de recebimento com muitas linhas).
const MAX_TOKENS_TEXTO = 4096
const MAX_TOKENS_JSON = 16000
// Nos modelos GPT-5 o raciocínio interno consome o mesmo teto de saída; a
// folga evita cortar a resposta visível por causa dele.
const FOLGA_RACIOCINIO = 8000

export type ResultadoIA = {
  texto?: string
  erro?: string
  /** O texto bateu no teto de tokens e veio cortado no fim. */
  truncado?: boolean
}

/** Mensagem amigável a partir de um erro do SDK da OpenAI. */
function erroIA(e: unknown): string {
  if (e instanceof OpenAI.AuthenticationError) {
    return "Chave de IA inválida — confira a OPENAI_API_KEY."
  }
  if (e instanceof OpenAI.PermissionDeniedError) {
    return "A chave de IA não tem permissão para este modelo."
  }
  if (e instanceof OpenAI.RateLimitError) {
    if (e.code === "insufficient_quota") {
      return "Sem créditos na conta OpenAI — verifique o saldo e o faturamento (platform.openai.com → Billing)."
    }
    return "Muitas solicitações de IA agora. Tente novamente em instantes."
  }
  if (e instanceof OpenAI.NotFoundError) {
    return `Modelo de IA não encontrado ("${MODELO_IA}"). Confira o MODELO_IA no .env.local.`
  }
  if (e instanceof OpenAI.BadRequestError) {
    return `Solicitação de IA inválida: ${e.message}`
  }
  const msg = e instanceof Error ? e.message : "Falha inesperada."
  return `Falha ao chamar a IA: ${msg}`
}

type Resposta = OpenAI.Responses.Response

/** A IA recusou (bloco de recusa ou filtro de conteúdo)? */
function recusou(r: Resposta): boolean {
  if (r.incomplete_details?.reason === "content_filter") return true
  return r.output.some(
    (item) =>
      item.type === "message" &&
      item.content.some((c) => c.type === "refusal")
  )
}

function cortada(r: Resposta): boolean {
  return (
    r.status === "incomplete" &&
    r.incomplete_details?.reason === "max_output_tokens"
  )
}

function cliente(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

const SEM_CHAVE = "IA não configurada — falta a OPENAI_API_KEY no servidor."

export async function gerarTextoIA({
  system,
  prompt,
  maxTokens = MAX_TOKENS_TEXTO,
}: {
  system: string
  prompt: string
  /** Documentos longos (minuta de contrato) pedem mais que o padrão de 4096. */
  maxTokens?: number
}): Promise<ResultadoIA> {
  const client = cliente()
  if (!client) return { erro: SEM_CHAVE }

  try {
    const resposta = await client.responses.create({
      model: MODELO_IA,
      max_output_tokens: maxTokens + FOLGA_RACIOCINIO,
      instructions: system,
      input: prompt,
      store: false,
    })

    if (recusou(resposta)) {
      return {
        erro: "A IA recusou a solicitação. Ajuste o texto e tente de novo.",
      }
    }
    const texto = resposta.output_text.trim()
    if (!texto) return { erro: "A IA não retornou texto." }
    return { texto, truncado: cortada(resposta) }
  } catch (e) {
    return { erro: erroIA(e) }
  }
}

export type ResultadoJsonIA = {
  dados?: Record<string, unknown>
  erro?: string
}

/** Isola o objeto JSON de uma resposta (tolera cercas ```json e texto ao redor). */
function extrairJson(bruto: string): Record<string, unknown> | null {
  let t = bruto.trim()
  if (t.startsWith("```")) {
    // remove ```json … ``` (ou ``` … ```)
    t = t.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim()
  }
  const tentar = (s: string): Record<string, unknown> | null => {
    try {
      const d = JSON.parse(s)
      return d && typeof d === "object" && !Array.isArray(d)
        ? (d as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  const direto = tentar(t)
  if (direto) return direto
  // fallback: do primeiro "{" ao último "}"
  const ini = t.indexOf("{")
  const fim = t.lastIndexOf("}")
  if (ini !== -1 && fim > ini) return tentar(t.slice(ini, fim + 1))
  return null
}

/**
 * Núcleo da extração JSON: monta a chamada com o `content` dado (texto e,
 * opcionalmente, um arquivo PDF para visão) e usa o modo JSON da OpenAI. O
 * parse continua tolerante por segurança.
 */
async function chamarJsonIA(
  system: string,
  content: OpenAI.Responses.ResponseInputMessageContentList
): Promise<ResultadoJsonIA> {
  const client = cliente()
  if (!client) return { erro: SEM_CHAVE }

  try {
    const resposta = await client.responses.create({
      model: MODELO_IA,
      max_output_tokens: MAX_TOKENS_JSON + FOLGA_RACIOCINIO,
      instructions: `${system}\n\nResponda SOMENTE com um objeto JSON válido. Não inclua texto, comentários, cercas de código nem tags fora do JSON.`,
      // O modo JSON exige a palavra "JSON" na mensagem do usuário (as
      // instruções não contam).
      input: [
        {
          role: "user",
          content: [
            ...content,
            { type: "input_text", text: "Responda com o objeto JSON." },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
      store: false,
    })

    if (recusou(resposta)) {
      return { erro: "A IA recusou a solicitação." }
    }
    if (cortada(resposta)) {
      return {
        erro: "A resposta da IA ficou grande demais e foi cortada. Tente um arquivo/lote menor.",
      }
    }
    const bruto = resposta.output_text.trim()
    if (!bruto) return { erro: "A IA não retornou dados." }

    const dados = extrairJson(bruto)
    if (!dados) return { erro: "A IA retornou um JSON inválido." }
    return { dados }
  } catch (e) {
    return { erro: erroIA(e) }
  }
}

/** Extração estruturada a partir de TEXTO: pede um JSON e o devolve parseado. */
export async function gerarJsonIA({
  system,
  prompt,
}: {
  system: string
  prompt: string
}): Promise<ResultadoJsonIA> {
  return chamarJsonIA(system, [{ type: "input_text", text: prompt }])
}

/**
 * Extração estruturada a partir de um PDF (visão nativa do modelo): serve para
 * documentos ESCANEADOS/imagem, onde não há texto selecionável. `pdfBase64` é o
 * conteúdo do PDF em base64. Custa mais tokens que o texto — use como fallback.
 */
export async function gerarJsonIADePdf({
  system,
  prompt,
  pdfBase64,
}: {
  system: string
  prompt: string
  pdfBase64: string
}): Promise<ResultadoJsonIA> {
  return chamarJsonIA(system, [
    {
      type: "input_file",
      filename: "documento.pdf",
      file_data: `data:application/pdf;base64,${pdfBase64}`,
    },
    { type: "input_text", text: prompt },
  ])
}

/**
 * Extração estruturada a partir de uma IMAGEM (foto ou digitalização de um
 * cupom, recibo…). `mimeType` é image/jpeg, image/png ou image/webp.
 */
export async function gerarJsonIADeImagem({
  system,
  prompt,
  imagemBase64,
  mimeType,
}: {
  system: string
  prompt: string
  imagemBase64: string
  mimeType: string
}): Promise<ResultadoJsonIA> {
  return chamarJsonIA(system, [
    {
      type: "input_image",
      image_url: `data:${mimeType};base64,${imagemBase64}`,
      detail: "high",
    },
    { type: "input_text", text: prompt },
  ])
}
