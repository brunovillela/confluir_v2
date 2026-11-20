import "server-only"
import OpenAI from "openai"
import { cache } from "react"

import { avisarChaveRecusada, conferirTetoIA } from "@/lib/db/ia-avisos"
import { configIAParaChamada, custoDoMes, precosDoModelo, type ConfigIAPublica } from "@/lib/db/ia-config"
import { PROCESSO_NAO_IDENTIFICADO, processoIA } from "@/lib/ia-processos"
import { usuarioIdAtual } from "@/lib/sessao-atual"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { comTenant, contextoFixado } from "@/lib/tenant-contexto"

/**
 * Camada única de acesso ao modelo de IA (OpenAI, Responses API). Lê a chave e
 * o modelo do ambiente e faz UMA chamada. Trocar o modelo é só mudar
 * `MODELO_IA` no .env.local — vale p/ TODAS as features de IA (descrição de
 * compras, ofícios, extração de CAT de PDF, recebimento por fonte…).
 *
 * Modelo padrão: gpt-5.5. Para reduzir custo, o usuário pode apontar
 * `MODELO_IA` para um modelo mais barato (ex.: gpt-5.4-mini ou gpt-5.4-nano) —
 * o código funciona em qualquer um deles.
 *
 * GESTÃO (19/11/2026): a entidade pode cadastrar a própria chave e o próprio
 * modelo em Gestão › Inteligência Artificial (tabela ia_config, chave cifrada
 * por lib/segredos.ts). Sem chave própria, vale a da plataforma
 * (OPENAI_API_KEY). Antes de chamar, respeita a IA desligada (toda ou por
 * módulo) e o teto mensal; depois, registra a chamada em ia_uso (quem,
 * processo, módulo, departamento, tokens, custo estimado) — nunca o conteúdo.
 * Cada chamada passa `processo` com uma chave de lib/ia-processos.ts.
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

type OrigemChave = "entidade" | "plataforma" | "bloqueada"
type TipoChamada = "texto" | "json" | "pdf" | "imagem"

/** Quem e de onde: o que toda função pública aceita além do conteúdo. */
export type ContextoIA = {
  /** Chave do processo em lib/ia-processos.ts (ex.: "compras.descricao"). */
  processo?: string
  /** Quem pediu, quando não há sessão (bot do Telegram, tarefa agendada). */
  usuarioId?: string | null
  /**
   * Entidade, quando o código roda fora de uma requisição dela (o webhook do
   * Telegram atende todas): a chamada usa a configuração e o registro dela.
   */
  entidadeId?: string | null
}

/** Roda `fn` fixando a entidade do contexto, quando informada. */
function naEntidade<T>(ctx: ContextoIA, fn: () => Promise<T>): Promise<T> {
  if (!ctx.entidadeId) return fn()
  return comTenant({ tenantId: ctx.entidadeId, origem: contextoFixado()?.origem ?? "" }, fn)
}

/** Mensagem amigável a partir de um erro do SDK da OpenAI. */
function erroIA(e: unknown, origem: OrigemChave, modelo: string): string {
  if (e instanceof OpenAI.AuthenticationError) {
    return origem === "entidade"
      ? "A chave de IA da entidade foi recusada — confira em Gestão › Inteligência Artificial."
      : "Chave de IA inválida — confira a OPENAI_API_KEY."
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
    return origem === "entidade" || modelo !== MODELO_IA
      ? `Modelo de IA não encontrado ("${modelo}"). Confira o modelo em Gestão › Inteligência Artificial.`
      : `Modelo de IA não encontrado ("${modelo}"). Confira o MODELO_IA no .env.local.`
  }
  if (e instanceof OpenAI.BadRequestError) {
    return `Solicitação de IA inválida: ${e.message}`
  }
  const msg = e instanceof Error ? e.message : "Falha inesperada."
  return `Falha ao chamar a IA: ${msg}`
}

/** A OpenAI recusou a chave (inválida, sem permissão ou sem créditos): a Gestão precisa agir. */
function chaveRecusada(e: unknown): boolean {
  return (
    e instanceof OpenAI.AuthenticationError ||
    e instanceof OpenAI.PermissionDeniedError ||
    (e instanceof OpenAI.RateLimitError && e.code === "insufficient_quota")
  )
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

const SEM_CHAVE = "IA não configurada — falta a OPENAI_API_KEY no servidor."

type RegistroBase = {
  emp: string
  config: ConfigIAPublica | null
  processo: string
  modulo: string
  tipo: TipoChamada
  usuarioId: string | null
}

type Preparo =
  | { erro: string; registro: RegistroBase | null }
  | { client: OpenAI; modelo: string; origem: OrigemChave; registro: RegistroBase | null }

/** Departamento da pessoa: o que coordena; sem isso, o primeiro que integra. */
const departamentoDe = cache(async (usuarioId: string): Promise<string | null> => {
  try {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    const { data: coord } = await admin
      .from("empresa_departamentos")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("coordenador_id", usuarioId)
      .limit(1)
    if (coord?.[0]?.id) return String(coord[0].id)
    const { data: integ } = await admin
      .from("empresa_departamentos_integrantes")
      .select("departamento_id")
      .eq("usuario_id", usuarioId)
      .limit(1)
    return integ?.[0]?.departamento_id ? String(integ[0].departamento_id) : null
  } catch {
    return null
  }
})

/**
 * Escolhe a chave e o modelo e confere as travas da Gestão. Sem entidade
 * resolvível (script), segue com a chave da plataforma e sem registro.
 */
async function preparar(ctx: ContextoIA, tipo: TipoChamada): Promise<Preparo> {
  const proc = processoIA(ctx.processo ?? PROCESSO_NAO_IDENTIFICADO)
  let registro: RegistroBase | null = null
  let config: ConfigIAPublica | null = null
  let chaveEntidade: string | null = null
  try {
    const emp = await tenantAtual()
    const lida = await configIAParaChamada(emp)
    config = lida.config.disponivel ? lida.config : null
    chaveEntidade = lida.chave
    const usuarioId = ctx.usuarioId !== undefined ? ctx.usuarioId : await usuarioIdAtual()
    registro = { emp, config, processo: proc.chave, modulo: proc.modulo, tipo, usuarioId }
  } catch {
    // Fora de uma entidade: chave da plataforma, sem registro.
  }

  if (config && !config.iaAtiva) {
    return { erro: "A IA está desligada nesta entidade (Gestão › Inteligência Artificial).", registro }
  }
  if (config && config.modulosDesligados.includes(proc.modulo)) {
    return { erro: "A IA está desligada neste módulo (Gestão › Inteligência Artificial).", registro }
  }
  if (registro && config?.limiteMensalUsd && config.bloquearNoLimite) {
    const gasto = await custoDoMes(registro.emp)
    if (gasto >= config.limiteMensalUsd) {
      await conferirTetoIA(registro.emp, config.limiteMensalUsd, true)
      return {
        erro: "O teto mensal de IA da entidade foi atingido. A IA volta no dia 1º ou quando a Gestão aumentar o teto.",
        registro,
      }
    }
  }

  const modelo = modeloDaChamada(config, proc.chave)
  if (chaveEntidade) {
    return { client: new OpenAI({ apiKey: chaveEntidade }), modelo, origem: "entidade", registro }
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { erro: SEM_CHAVE, registro }
  return { client: new OpenAI({ apiKey }), modelo, origem: "plataforma", registro }
}

/**
 * Modelo de uma chamada: o do processo (Gestão › IA › Modelo por processo),
 * senão o geral da entidade, senão o padrão da plataforma.
 */
export function modeloDaChamada(config: ConfigIAPublica | null, processo: string): string {
  return config?.modelosProcesso?.[processo] || config?.modelo || MODELO_IA
}

/** Custo estimado em US$ pelos preços da Gestão para o modelo usado; null sem preços. */
function custoEstimado(config: ConfigIAPublica | null, modelo: string, entrada: number, cacheados: number, saida: number): number | null {
  if (!config) return null
  const p = precosDoModelo(config, modelo, config.modelo || MODELO_IA)
  if (!p || p.entrada === null || p.saida === null) return null
  const precoCache = p.cache ?? p.entrada
  return ((entrada - cacheados) * p.entrada + cacheados * precoCache + saida * p.saida) / 1_000_000
}

/** Grava a chamada em ia_uso. Nunca derruba a chamada de IA. */
async function registrar(
  base: RegistroBase | null,
  r: { modelo: string; origem: OrigemChave; inicio: number; resposta?: Resposta; erro?: string; recusaChave?: boolean }
): Promise<void> {
  if (!base) return
  // Avisos aos administradores (depois da resposta, sem atrasar a chamada).
  if (r.resposta && base.config?.limiteMensalUsd) {
    await conferirTetoIA(base.emp, base.config.limiteMensalUsd, base.config.bloquearNoLimite)
  }
  if (r.recusaChave && r.erro) await avisarChaveRecusada(base.emp, r.erro)
  try {
    const u = r.resposta?.usage
    const entrada = u?.input_tokens ?? 0
    const cacheados = u?.input_tokens_details?.cached_tokens ?? 0
    const saida = u?.output_tokens ?? 0
    const departamentoId = base.usuarioId ? await departamentoDe(base.usuarioId) : null
    const admin = await createAdminClient()
    await admin.from("ia_uso").insert({
      emp_proprietaria_id: base.emp,
      usuario_id: base.usuarioId,
      departamento_id: departamentoId,
      processo: base.processo,
      modulo: base.modulo,
      tipo: base.tipo,
      modelo: r.modelo,
      origem_chave: r.origem,
      tokens_entrada: entrada,
      tokens_entrada_cache: cacheados,
      tokens_saida: saida,
      tokens_raciocinio: u?.output_tokens_details?.reasoning_tokens ?? 0,
      custo_estimado_usd: u ? custoEstimado(base.config, r.modelo, entrada, cacheados, saida) : null,
      duracao_ms: Date.now() - r.inicio,
      sucesso: !r.erro,
      erro: r.erro ? r.erro.slice(0, 300) : null,
    })
  } catch {
    // Registro é acessório: sem a tabela (migração pendente) ou com falha de rede, segue.
  }
}

/** Registra a recusa da Gestão (IA desligada, teto, sem chave) e devolve a mensagem. */
async function recusarPreparo(p: { erro: string; registro: RegistroBase | null }): Promise<string> {
  await registrar(p.registro, {
    modelo: p.registro ? modeloDaChamada(p.registro.config, p.registro.processo) : MODELO_IA,
    origem: "bloqueada",
    inicio: Date.now(),
    erro: p.erro,
  })
  return p.erro
}

export async function gerarTextoIA({
  system,
  prompt,
  maxTokens = MAX_TOKENS_TEXTO,
  processo,
  usuarioId,
  entidadeId,
}: {
  system: string
  prompt: string
  /** Documentos longos (minuta de contrato) pedem mais que o padrão de 4096. */
  maxTokens?: number
} & ContextoIA): Promise<ResultadoIA> {
  const ctx = { processo, usuarioId, entidadeId }
  return naEntidade(ctx, () => chamarTextoIA(system, prompt, maxTokens, ctx))
}

async function chamarTextoIA(system: string, prompt: string, maxTokens: number, ctx: ContextoIA): Promise<ResultadoIA> {
  const p = await preparar(ctx, "texto")
  if ("erro" in p) return { erro: await recusarPreparo(p) }
  const { client, modelo, origem } = p
  const inicio = Date.now()

  try {
    const resposta = await client.responses.create({
      model: modelo,
      max_output_tokens: maxTokens + FOLGA_RACIOCINIO,
      instructions: system,
      input: prompt,
      store: false,
    })

    const texto = resposta.output_text.trim()
    const erro = recusou(resposta)
      ? "A IA recusou a solicitação. Ajuste o texto e tente de novo."
      : !texto
        ? "A IA não retornou texto."
        : undefined
    await registrar(p.registro, { modelo, origem, inicio, resposta, erro })
    if (erro) return { erro }
    return { texto, truncado: cortada(resposta) }
  } catch (e) {
    const erro = erroIA(e, origem, modelo)
    await registrar(p.registro, { modelo, origem, inicio, erro, recusaChave: origem === "entidade" && chaveRecusada(e) })
    return { erro }
  }
}

export type ResultadoJsonIA = {
  dados?: Record<string, unknown>
  erro?: string
}

/**
 * Esquema JSON para Structured Outputs (modo estrito): a resposta sai com
 * TODAS as chaves, no tipo e na lista de opções declarados. Sem esquema, vale
 * o modo JSON livre, em que o modelo pode trocar string por número ou
 * devolver um valor fora da lista.
 */
export type EsquemaJsonIA = { nome: string; schema: Record<string, unknown> }

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
  content: OpenAI.Responses.ResponseInputMessageContentList,
  esquema: EsquemaJsonIA | undefined,
  ctx: ContextoIA,
  tipo: TipoChamada
): Promise<ResultadoJsonIA> {
  return naEntidade(ctx, () => chamarJsonIANaEntidade(system, content, esquema, ctx, tipo))
}

async function chamarJsonIANaEntidade(
  system: string,
  content: OpenAI.Responses.ResponseInputMessageContentList,
  esquema: EsquemaJsonIA | undefined,
  ctx: ContextoIA,
  tipo: TipoChamada
): Promise<ResultadoJsonIA> {
  const p = await preparar(ctx, tipo)
  if ("erro" in p) return { erro: await recusarPreparo(p) }
  const { client, modelo, origem } = p
  const inicio = Date.now()

  try {
    const resposta = await client.responses.create({
      model: modelo,
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
      text: {
        format: esquema
          ? { type: "json_schema", name: esquema.nome, schema: esquema.schema, strict: true }
          : { type: "json_object" },
      },
      store: false,
    })

    const bruto = resposta.output_text.trim()
    const dados = bruto ? extrairJson(bruto) : null
    const erro = recusou(resposta)
      ? "A IA recusou a solicitação."
      : cortada(resposta)
        ? "A resposta da IA ficou grande demais e foi cortada. Tente um arquivo/lote menor."
        : !bruto
          ? "A IA não retornou dados."
          : !dados
            ? "A IA retornou um JSON inválido."
            : undefined
    await registrar(p.registro, { modelo, origem, inicio, resposta, erro })
    if (erro || !dados) return { erro: erro ?? "A IA retornou um JSON inválido." }
    return { dados }
  } catch (e) {
    const erro = erroIA(e, origem, modelo)
    await registrar(p.registro, { modelo, origem, inicio, erro, recusaChave: origem === "entidade" && chaveRecusada(e) })
    return { erro }
  }
}

/** Extração estruturada a partir de TEXTO: pede um JSON e o devolve parseado. */
export async function gerarJsonIA({
  system,
  prompt,
  esquema,
  processo,
  usuarioId,
  entidadeId,
}: {
  system: string
  prompt: string
  esquema?: EsquemaJsonIA
} & ContextoIA): Promise<ResultadoJsonIA> {
  return chamarJsonIA(system, [{ type: "input_text", text: prompt }], esquema, { processo, usuarioId, entidadeId }, "json")
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
  esquema,
  processo,
  usuarioId,
  entidadeId,
}: {
  system: string
  prompt: string
  pdfBase64: string
  esquema?: EsquemaJsonIA
} & ContextoIA): Promise<ResultadoJsonIA> {
  return chamarJsonIA(
    system,
    [
      {
        type: "input_file",
        filename: "documento.pdf",
        file_data: `data:application/pdf;base64,${pdfBase64}`,
      },
      { type: "input_text", text: prompt },
    ],
    esquema,
    { processo, usuarioId, entidadeId },
    "pdf"
  )
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
  esquema,
  processo,
  usuarioId,
  entidadeId,
}: {
  system: string
  prompt: string
  imagemBase64: string
  mimeType: string
  esquema?: EsquemaJsonIA
} & ContextoIA): Promise<ResultadoJsonIA> {
  return chamarJsonIA(
    system,
    [
      {
        type: "input_image",
        image_url: `data:${mimeType};base64,${imagemBase64}`,
        detail: "high",
      },
      { type: "input_text", text: prompt },
    ],
    esquema,
    { processo, usuarioId, entidadeId },
    "imagem"
  )
}

/**
 * Teste da chave da entidade (Gestão): uma chamada mínima com a chave dada,
 * sem passar pelas travas. Devolve null quando deu certo ou a mensagem do erro.
 * Fica aqui porque toda chamada à OpenAI passa por este arquivo.
 */
export async function testarChaveIA(chave: string, modelo: string | null): Promise<string | null> {
  const m = modelo || MODELO_IA
  const inicio = Date.now()
  let base: RegistroBase | null = null
  try {
    base = {
      emp: await tenantAtual(),
      config: null,
      processo: "gestao.teste_chave",
      modulo: "outros",
      tipo: "texto",
      usuarioId: await usuarioIdAtual(),
    }
  } catch {
    base = null
  }
  try {
    const resposta = await new OpenAI({ apiKey: chave }).responses.create({
      model: m,
      max_output_tokens: 64,
      input: "Responda apenas: ok",
      store: false,
    })
    await registrar(base, { modelo: m, origem: "entidade", inicio, resposta })
    return null
  } catch (e) {
    const erro = erroIA(e, "entidade", m)
    await registrar(base, { modelo: m, origem: "entidade", inicio, erro })
    return erro
  }
}
