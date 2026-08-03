import "server-only"
import Anthropic from "@anthropic-ai/sdk"

/**
 * Camada única de acesso ao modelo de IA (Anthropic / Claude). Lê a chave e o
 * modelo do ambiente e faz UMA chamada. Trocar o modelo é só mudar `MODELO_IA`
 * no .env.local — vale p/ TODAS as features de IA (descrição de compras,
 * ofícios, extração de CAT de PDF, recebimento por fonte…).
 *
 * Modelo padrão: claude-opus-5. Para reduzir custo, o usuário pode apontar
 * `MODELO_IA` para um modelo Claude mais barato (ex.: claude-haiku-4-5 ou
 * claude-sonnet-5) — o código funciona em qualquer um deles.
 */
export const MODELO_IA = process.env.MODELO_IA?.trim() || "claude-opus-5"

// Teto de tokens de saída. Texto é curto; extração de JSON pode ser grande
// (CAT com 50 campos, relatório de recebimento com muitas linhas).
const MAX_TOKENS_TEXTO = 4096
const MAX_TOKENS_JSON = 16000

export type ResultadoIA = { texto?: string; erro?: string }

/** Mensagem amigável a partir de um erro do SDK da Anthropic. */
function erroIA(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "Chave de IA inválida — confira a ANTHROPIC_API_KEY."
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return "A chave de IA não tem permissão para este modelo."
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Muitas solicitações de IA agora. Tente novamente em instantes."
  }
  if (e instanceof Anthropic.NotFoundError) {
    return `Modelo de IA não encontrado ("${MODELO_IA}"). Confira o MODELO_IA no .env.local.`
  }
  if (e instanceof Anthropic.BadRequestError) {
    const m = e.message.toLowerCase()
    if (m.includes("credit") || m.includes("balance") || m.includes("billing")) {
      return "Sem créditos na conta Anthropic — verifique o saldo e o faturamento (console.anthropic.com → Billing)."
    }
    return `Solicitação de IA inválida: ${e.message}`
  }
  const msg = e instanceof Error ? e.message : "Falha inesperada."
  return `Falha ao chamar a IA: ${msg}`
}

/** Junta os blocos de texto da resposta em uma string. */
function textoDaResposta(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
}

export async function gerarTextoIA({
  system,
  prompt,
}: {
  system: string
  prompt: string
}): Promise<ResultadoIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { erro: "IA não configurada — falta a ANTHROPIC_API_KEY no servidor." }
  }

  try {
    const client = new Anthropic({ apiKey })
    const resposta = await client.messages.create({
      model: MODELO_IA,
      max_tokens: MAX_TOKENS_TEXTO,
      system,
      messages: [{ role: "user", content: prompt }],
    })

    if (resposta.stop_reason === "refusal") {
      return {
        erro: "A IA recusou a solicitação. Ajuste o texto e tente de novo.",
      }
    }
    const texto = textoDaResposta(resposta)
    if (!texto) return { erro: "A IA não retornou texto." }
    return { texto }
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
 * Núcleo da extração JSON: monta a chamada com o `content` dado (texto puro ou
 * blocos, ex.: um documento PDF para visão) e parseia a resposta de forma
 * tolerante. Claude não tem "json mode" → instruímos e extraímos o objeto.
 */
async function chamarJsonIA(
  system: string,
  content: Anthropic.MessageParam["content"]
): Promise<ResultadoJsonIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { erro: "IA não configurada — falta a ANTHROPIC_API_KEY no servidor." }
  }

  try {
    const client = new Anthropic({ apiKey })
    const resposta = await client.messages.create({
      model: MODELO_IA,
      max_tokens: MAX_TOKENS_JSON,
      system: `${system}\n\nResponda SOMENTE com um objeto JSON válido. Não inclua texto, comentários, cercas de código nem tags fora do JSON.`,
      messages: [{ role: "user", content }],
    })

    if (resposta.stop_reason === "refusal") {
      return { erro: "A IA recusou a solicitação." }
    }
    if (resposta.stop_reason === "max_tokens") {
      return {
        erro: "A resposta da IA ficou grande demais e foi cortada. Tente um arquivo/lote menor.",
      }
    }
    const bruto = textoDaResposta(resposta)
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
  return chamarJsonIA(system, prompt)
}

/**
 * Extração estruturada a partir de um PDF (visão nativa do Claude): serve para
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
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdfBase64,
      },
    },
    { type: "text", text: prompt },
  ])
}
