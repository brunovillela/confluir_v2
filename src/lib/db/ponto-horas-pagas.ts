import "server-only"

import { getDocumentProxy } from "unpdf"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { competenciaDaRemessa } from "@/lib/db/ponto-analise"
import { recalcularPosteriores } from "@/lib/db/ponto-cascata"
import { competenciaDoNome } from "@/lib/contracheque-leitura"
import { duasCasas } from "@/lib/horas"
import { gerarJsonIA, gerarJsonIADePdf, type EsquemaJsonIA } from "@/lib/ia"
import {
  chaveDaConfig,
  lerLinhas,
  linhaParaIA,
  normalizarRubricas,
  rotuloRubrica,
  rubricaCandidata,
  totaisDasLinhas,
  type LeituraHE,
  type LinhaHE,
  type ReferenciaHoras,
  type RubricaHE,
  type SituacaoLeitura,
  type TotaisHE,
} from "@/lib/ponto-horas-pagas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * HORAS EXTRAS PAGAS LIDAS DO CONTRACHEQUE (Ponto, Fase 2 — 28/11/2026).
 *
 * A remessa de ponto indica uma remessa de contracheques (em geral a do mês
 * seguinte, quando as horas do mês são pagas). Para cada registro de ponto,
 * o contracheque da pessoa naquela remessa é lido AQUI, no servidor, pelo
 * texto do PDF: só as linhas das rubricas de hora extra configuradas pela
 * entidade (pessoal_contracheques_config.he_*). Nada vai à IA por padrão.
 *
 * - Linha que o texto não resolve ("ambígua"): a IA pode interpretá-la se a
 *   entidade deixar (he_ia_linhas) — recebe só a linha, sem nome nem CPF, e
 *   só quando o gestor pede.
 * - Contracheque escaneado (sem texto): só com he_ler_imagem ligado, que
 *   manda a página INTEIRA (nome, CPF, salário) — desligado por padrão.
 *
 * O que foi lido fica em pessoal_contracheques.he_lidas (cache, refeito quando
 * as rubricas mudam). Gravar na remessa é outro passo, com prévia: horas e
 * valor (R$) pagos por faixa, saldo remanescente refeito e, se o gestor
 * pedir, a cadeia das remessas seguintes.
 */

export type ConfigHE = {
  disponivel: boolean
  rubricas: RubricaHE[]
  referencia: ReferenciaHoras
  iaLinhas: boolean
  lerImagem: boolean
}

export async function configHE(): Promise<ConfigHE> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_contracheques_config")
    .select("he_rubricas, he_referencia, he_ia_linhas, he_ler_imagem")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error && !esquemaAusente(error) && error.code !== "42703") {
    throw new Error(`Falha ao ler a configuração das horas extras: ${error.message}`)
  }
  return {
    disponivel: !error,
    rubricas: normalizarRubricas(data?.he_rubricas),
    referencia: data?.he_referencia === "hhmm" ? "hhmm" : "decimal",
    iaLinhas: error ? false : data?.he_ia_linhas !== false,
    lerImagem: data?.he_ler_imagem === true,
  }
}

export async function salvarConfigHE(
  dados: { rubricas: RubricaHE[]; referencia: ReferenciaHoras; iaLinhas: boolean; lerImagem: boolean },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_contracheques_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      he_rubricas: dados.rubricas,
      he_referencia: dados.referencia,
      he_ia_linhas: dados.iaLinhas,
      he_ler_imagem: dados.lerImagem,
      atualizada_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  return error ? { erro: `Não foi possível salvar: ${error.message}` } : {}
}

// ── Texto do PDF em linhas (pela posição na página) ──────────────────────────

type ItemTexto = { str: string; x: number; y: number; w: number }

/**
 * Linhas do PDF montadas pela posição dos trechos de texto: o que está na
 * mesma altura vira uma linha, da esquerda para a direita. Sem texto → [].
 */
export async function linhasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes.slice())
  const saida: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n)
    const conteudo = await pagina.getTextContent()
    const itens: ItemTexto[] = []
    for (const it of conteudo.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str || !it.transform || !it.str.trim()) continue
      itens.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 })
    }
    itens.sort((a, b) => b.y - a.y || a.x - b.x)
    const grupos: ItemTexto[][] = []
    for (const it of itens) {
      const g = grupos[grupos.length - 1]
      if (g && Math.abs(g[0].y - it.y) <= 2.5) g.push(it)
      else grupos.push([it])
    }
    for (const g of grupos) {
      g.sort((a, b) => a.x - b.x)
      let linha = ""
      let fim = -Infinity
      for (const it of g) {
        linha += (linha && it.x - fim > 1 ? " " : "") + it.str
        fim = it.x + it.w
      }
      const l = linha.replace(/\s+/g, " ").trim()
      if (l) saida.push(l)
    }
  }
  return saida
}

async function baixar(caminho: string): Promise<Uint8Array | null> {
  if (/^(https?:)?\/\//.test(caminho)) {
    const url = caminho.startsWith("//") ? `https:${caminho}` : caminho
    try {
      const r = await fetch(url)
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
    } catch {
      return null
    }
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage.from("pessoal").download(caminho)
  return data ? new Uint8Array(await data.arrayBuffer()) : null
}

function situacaoDas(linhas: LinhaHE[]): SituacaoLeitura {
  return linhas.some((l) => l.ambigua) ? "ambigua" : "lido"
}

type Contracheque = { id: string; funcionario_id: string | null; arquivo: string | null; he_lidas: unknown }

function leituraValida(c: Contracheque, chave: string): LeituraHE | null {
  const l = c.he_lidas as LeituraHE | null
  return l && typeof l === "object" && l.chave === chave && Array.isArray(l.linhas) ? l : null
}

async function guardarLeitura(id: string, leitura: LeituraHE) {
  const admin = await createAdminClient()
  await admin.from("pessoal_contracheques").update({ he_lidas: leitura, he_lidas_em: new Date().toISOString() }).eq("id", id)
}

/** Lê (ou tira do cache) as linhas de hora extra de um contracheque, só pelo texto. */
async function leituraDoContracheque(c: Contracheque, cfg: ConfigHE, chave: string): Promise<LeituraHE> {
  const cache = leituraValida(c, chave)
  if (cache) return cache
  if (!c.arquivo) return { chave, situacao: "sem_arquivo", linhas: [] }
  const bytes = await baixar(c.arquivo)
  if (!bytes) return { chave, situacao: "erro", linhas: [], erro: "Não foi possível baixar o PDF." }
  let linhasPdf: string[]
  try {
    linhasPdf = await linhasDoPdf(bytes)
  } catch {
    return { chave, situacao: "erro", linhas: [], erro: "Não foi possível abrir o PDF." }
  }
  const leitura: LeituraHE =
    linhasPdf.join("").length < 80
      ? { chave, situacao: "sem_texto", linhas: [] }
      : (() => {
          const linhas = lerLinhas(linhasPdf, cfg.rubricas, cfg.referencia)
          return { chave, situacao: situacaoDas(linhas), linhas }
        })()
  await guardarLeitura(c.id, leitura)
  return leitura
}

// ── Remessas e prévia ────────────────────────────────────────────────────────

export type RemessaCC = { id: string; nome: string; competencia: string | null; natureza: string; itens: number; sugerida: boolean }

const proximoMes = (c: string) => {
  const [a, m] = c.split("-").map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`
}

/** Remessas de contracheques para escolher; sugere a mensal do mês seguinte ao do ponto (senão a do mesmo mês). */
export async function remessasCCParaPonto(competenciaPonto: string | null): Promise<RemessaCC[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_contracheques_remessas")
    .select("id, nome_remessa, decimo_terceiro, ferias, adiantamento, complementar_mensal")
    .eq("emp_proprietaria_id", await tenantAtual())
  const ids = (data ?? []).map((r) => r.id as string)
  const contagem = new Map<string, number>()
  if (ids.length) {
    const { data: cs } = await admin.from("pessoal_contracheques").select("remessa_id").in("remessa_id", ids).limit(10000)
    for (const c of cs ?? []) contagem.set(String(c.remessa_id), (contagem.get(String(c.remessa_id)) ?? 0) + 1)
  }
  const lista = (data ?? []).map((r) => {
    const natureza = r.decimo_terceiro ? "13º" : r.ferias ? "Férias" : r.adiantamento ? "Adiantamento" : r.complementar_mensal ? "Complementar" : "Mensal"
    return {
      id: String(r.id),
      nome: texto(r.nome_remessa) ?? "(sem nome)",
      competencia: competenciaDoNome(r.nome_remessa as string | null),
      natureza,
      itens: contagem.get(String(r.id)) ?? 0,
      sugerida: false,
    }
  })
  lista.sort((a, b) => (b.competencia ?? "").localeCompare(a.competencia ?? "") || a.nome.localeCompare(b.nome))
  if (competenciaPonto) {
    const mensal = (c: string) => lista.find((r) => r.competencia === c && r.natureza === "Mensal")
    const s = mensal(proximoMes(competenciaPonto)) ?? mensal(competenciaPonto)
    if (s) s.sugerida = true
  }
  return lista
}

export type LinhaPreviaHP = {
  registroId: string
  funcionarioId: string | null
  nome: string
  contrachequeId: string | null
  leitura: LeituraHE
  totais: TotaisHE
  atual: { horas1: number | null; horas2: number | null; valor1: number | null; valor2: number | null; doContracheque: string | null }
  /** Horas e valores a gravar por faixa (só as faixas com rubrica configurada). */
  novo: { horas1: number | null; horas2: number | null; valor1: number | null; valor2: number | null }
  diferente: boolean
  podeAplicar: boolean
}

export type PreviaHP = {
  remessa: { id: string; nome: string; finalizada: boolean; competencia: string | null; ccRemessaId: string | null }
  cc: RemessaCC | null
  config: ConfigHE
  faixasConfiguradas: { horas1: boolean; horas2: boolean; valor1: boolean; valor2: boolean }
  linhas: LinhaPreviaHP[]
  /** Contracheques da remessa sem registro de ponto nesta remessa (não entram). */
  semRegistro: number
}

async function remessaPonto(id: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa, finalizada, mes_referencia_os, ano_referencia_os, contracheques_remessa_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    nome: texto(data.nome_remessa) ?? "(sem nome)",
    finalizada: data.finalizada === true,
    competencia: competenciaDaRemessa(data),
    ccRemessaId: texto(data.contracheques_remessa_id),
  }
}

/** Remessa de contracheques indicada na remessa de ponto (e quando as horas foram lidas). */
export async function horasPagasDaRemessa(remessaPontoId: string): Promise<{ ccRemessa: string | null; ccRemessaId: string | null; lidos: number } | null> {
  const r = await remessaPonto(remessaPontoId).catch(() => null)
  if (!r) return null
  const admin = await createAdminClient()
  const [{ data: cc }, { count }] = await Promise.all([
    r.ccRemessaId
      ? admin.from("pessoal_contracheques_remessas").select("nome_remessa").eq("id", r.ccRemessaId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("pessoal_registro_ponto")
      .select("id", { count: "exact", head: true })
      .eq("remessa_id", remessaPontoId)
      .not("pagas_contracheque_id", "is", null),
  ])
  return { ccRemessa: texto(cc?.nome_remessa), ccRemessaId: r.ccRemessaId, lidos: count ?? 0 }
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const igual = (a: number | null, b: number | null) => (a ?? 0).toFixed(2) === (b ?? 0).toFixed(2)

async function contrachequesDaRemessaCC(ccId: string): Promise<Contracheque[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_contracheques")
    .select("id, funcionario_id, arquivo, he_lidas")
    .eq("remessa_id", ccId)
  if (error) throw new Error(`Falha ao ler os contracheques: ${error.message}`)
  return (data ?? []) as Contracheque[]
}

/** Prévia: o que cada contracheque diz e o que mudaria em cada registro da remessa de ponto. */
export async function previaHorasPagas(remessaPontoId: string, ccId: string | null): Promise<PreviaHP | null> {
  const remessa = await remessaPonto(remessaPontoId)
  if (!remessa) return null
  const config = await configHE()
  const faixasConfiguradas = {
    horas1: config.rubricas.some((r) => r.faixa === 1 && r.tipo === "horas"),
    horas2: config.rubricas.some((r) => r.faixa === 2 && r.tipo === "horas"),
    valor1: config.rubricas.some((r) => r.faixa === 1),
    valor2: config.rubricas.some((r) => r.faixa === 2),
  }
  const lista = await remessasCCParaPonto(remessa.competencia)
  const cc = ccId ? (lista.find((r) => r.id === ccId) ?? null) : null
  if (!cc || !config.rubricas.length) return { remessa, cc, config, faixasConfiguradas, linhas: [], semRegistro: 0 }

  const admin = await createAdminClient()
  const [{ data: regs }, ccs] = await Promise.all([
    admin
      .from("pessoal_registro_ponto")
      .select("id, funcionario_id, horas_pagas_70, horas_pagas_100, valor_pago_70, valor_pago_100, pagas_contracheque_id")
      .eq("remessa_id", remessaPontoId),
    contrachequesDaRemessaCC(cc.id),
  ])
  const nomes = await nomesDosUsuarios([...new Set((regs ?? []).map((r) => r.funcionario_id).filter((v): v is string => !!v))])
  const porFuncionario = new Map<string, Contracheque>()
  for (const c of ccs) if (c.funcionario_id && !porFuncionario.has(c.funcionario_id)) porFuncionario.set(c.funcionario_id, c)
  const chave = chaveDaConfig(config.rubricas, config.referencia)
  const comRegistro = new Set((regs ?? []).map((r) => r.funcionario_id))

  const linhas: LinhaPreviaHP[] = []
  // Poucos de cada vez: cada leitura baixa e abre um PDF.
  const fila = [...(regs ?? [])]
  while (fila.length) {
    const lote = fila.splice(0, 6)
    const lidas = await Promise.all(
      lote.map(async (r) => {
        const c = r.funcionario_id ? porFuncionario.get(r.funcionario_id) : undefined
        const leitura: LeituraHE = c ? await leituraDoContracheque(c, config, chave) : { chave, situacao: "sem_contracheque", linhas: [] }
        const totais = totaisDasLinhas(leitura.linhas)
        const atual = {
          horas1: num(r.horas_pagas_70),
          horas2: num(r.horas_pagas_100),
          valor1: num(r.valor_pago_70),
          valor2: num(r.valor_pago_100),
          doContracheque: texto(r.pagas_contracheque_id),
        }
        const podeAplicar = leitura.situacao === "lido"
        const novo = {
          horas1: faixasConfiguradas.horas1 ? totais.horas1 : atual.horas1,
          horas2: faixasConfiguradas.horas2 ? totais.horas2 : atual.horas2,
          valor1: faixasConfiguradas.valor1 ? totais.valor1 : atual.valor1,
          valor2: faixasConfiguradas.valor2 ? totais.valor2 : atual.valor2,
        }
        const diferente =
          !igual(novo.horas1, atual.horas1) || !igual(novo.horas2, atual.horas2) || !igual(novo.valor1, atual.valor1) || !igual(novo.valor2, atual.valor2) || atual.doContracheque !== (c?.id ?? null)
        return {
          registroId: String(r.id),
          funcionarioId: r.funcionario_id,
          nome: (r.funcionario_id && nomes.get(r.funcionario_id)) || "(sem funcionário)",
          contrachequeId: c?.id ?? null,
          leitura,
          totais,
          atual,
          novo,
          diferente,
          podeAplicar,
        }
      })
    )
    linhas.push(...lidas)
  }
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const semRegistro = ccs.filter((c) => c.funcionario_id && !comRegistro.has(c.funcionario_id)).length
  return { remessa, cc, config, faixasConfiguradas, linhas, semRegistro }
}

// ── IA: linhas ambíguas (só as linhas) e escaneados (página inteira) ────────

const NUM_OU_NULO = { type: ["number", "null"] }

const ESQUEMA_LINHAS: EsquemaJsonIA = {
  nome: "linhas_hora_extra",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["linhas"],
    properties: {
      linhas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "horas", "valor"],
          properties: { id: { type: "integer" }, horas: NUM_OU_NULO, valor: NUM_OU_NULO },
        },
      },
    },
  },
}

const SISTEMA_LINHAS = (formato: ReferenciaHoras) => `Você recebe linhas soltas de rubricas de hora extra de contracheques brasileiros, sem identificação de pessoa.
Cada linha tem um número (id). Para cada uma, devolva:
- "horas": a quantidade de horas (a referência) em horas decimais (10h30 = 10.5). ${
  formato === "hhmm" ? 'Nesta entidade, "10,30" significa 10 horas e 30 minutos.' : 'Nesta entidade, "10,50" significa 10,5 horas.'
} Sem referência de horas na linha: null.
- "valor": o valor em reais da rubrica (ex.: 1.234,56 → 1234.56). Sem valor: null.
Percentuais (50%, 100%) fazem parte do nome da rubrica, não são horas nem valor. Não invente números.`

/** Manda à IA só as linhas ambíguas da remessa (sem nome nem CPF) e guarda a interpretação. */
export async function interpretarAmbiguas(remessaPontoId: string, ccId: string, usuarioId: string): Promise<{ erro?: string; resolvidas?: number }> {
  const config = await configHE()
  if (!config.iaLinhas) return { erro: "A configuração não deixa a IA interpretar as linhas." }
  const previa = await previaHorasPagas(remessaPontoId, ccId)
  if (!previa) return { erro: "Remessa não encontrada." }
  const alvo = previa.linhas.filter((l) => l.contrachequeId && l.leitura.situacao === "ambigua")
  const enviadas: { id: number; contracheque: string; indice: number; texto: string }[] = []
  for (const l of alvo) {
    l.leitura.linhas.forEach((x, i) => {
      if (x.ambigua) enviadas.push({ id: enviadas.length + 1, contracheque: l.contrachequeId!, indice: i, texto: linhaParaIA(x) })
    })
  }
  if (!enviadas.length) return { resolvidas: 0 }
  const { dados, erro } = await gerarJsonIA({
    processo: "pessoal.ponto_horas_pagas",
    usuarioId,
    system: SISTEMA_LINHAS(config.referencia),
    prompt: enviadas.map((e) => `${e.id}: ${e.texto}`).join("\n"),
    esquema: ESQUEMA_LINHAS,
  })
  if (erro || !dados) return { erro: erro ?? "A IA não devolveu a leitura." }
  const resp = new Map(((dados.linhas as { id: number; horas: number | null; valor: number | null }[]) ?? []).map((x) => [x.id, x]))
  let resolvidas = 0
  for (const l of alvo) {
    const linhas = l.leitura.linhas.map((x, i) => {
      const e = enviadas.find((y) => y.contracheque === l.contrachequeId && y.indice === i)
      const r = e ? resp.get(e.id) : undefined
      if (!x.ambigua || !r) return x
      const horas = x.tipo === "horas" ? (typeof r.horas === "number" ? duasCasas(r.horas) : null) : null
      const valor = typeof r.valor === "number" ? duasCasas(r.valor) : null
      const ok = valor !== null && (x.tipo === "valor" || horas !== null)
      if (ok) resolvidas++
      return { ...x, horas, valor, ambigua: !ok, origem: "ia" as const }
    })
    await guardarLeitura(l.contrachequeId!, { ...l.leitura, linhas, situacao: situacaoDas(linhas) })
  }
  return { resolvidas }
}

const ESQUEMA_IMAGEM: EsquemaJsonIA = {
  nome: "horas_extras_contracheque",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["linhas"],
    properties: {
      linhas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rubrica", "texto", "horas", "valor"],
          properties: { rubrica: { type: "integer" }, texto: { type: "string" }, horas: NUM_OU_NULO, valor: NUM_OU_NULO },
        },
      },
    },
  },
}

/**
 * Contracheques escaneados (sem texto): a IA lê a página inteira e devolve só
 * as linhas das rubricas configuradas. Só com he_ler_imagem ligado.
 */
export async function lerEscaneados(remessaPontoId: string, ccId: string, usuarioId: string): Promise<{ erro?: string; lidos?: number; falhas?: number }> {
  const config = await configHE()
  if (!config.lerImagem) return { erro: "A leitura por imagem está desligada na configuração dos contracheques." }
  const previa = await previaHorasPagas(remessaPontoId, ccId)
  if (!previa) return { erro: "Remessa não encontrada." }
  const alvo = previa.linhas.filter((l) => l.contrachequeId && l.leitura.situacao === "sem_texto")
  const ccs = new Map((await contrachequesDaRemessaCC(ccId)).map((c) => [c.id, c]))
  const lista = config.rubricas.map((r, i) => `${i + 1}. ${rotuloRubrica(r)}${r.tipo === "valor" ? " (só valor)" : ""}`).join("\n")
  let lidos = 0
  let falhas = 0
  for (const l of alvo) {
    const c = ccs.get(l.contrachequeId!)
    const bytes = c?.arquivo ? await baixar(c.arquivo) : null
    if (!bytes) {
      falhas++
      continue
    }
    const { dados, erro } = await gerarJsonIADePdf({
      processo: "pessoal.ponto_horas_pagas",
      usuarioId,
      system: `${SISTEMA_LINHAS(config.referencia)}\nAqui você recebe o contracheque inteiro: devolva SÓ as linhas destas rubricas (pelo número da lista), em "texto" só o código e a descrição da rubrica, sem nome nem CPF:\n${lista}`,
      prompt: "Leia as linhas de hora extra deste contracheque. Linha repetida em outra via conta uma vez. Nenhuma: lista vazia.",
      pdfBase64: Buffer.from(bytes).toString("base64"),
      esquema: ESQUEMA_IMAGEM,
    })
    if (erro || !dados) {
      falhas++
      continue
    }
    const linhas: LinhaHE[] = []
    for (const x of (dados.linhas as { rubrica: number; texto: string; horas: number | null; valor: number | null }[]) ?? []) {
      const r = config.rubricas[x.rubrica - 1]
      if (!r) continue
      const horas = r.tipo === "horas" && typeof x.horas === "number" ? duasCasas(x.horas) : null
      const valor = typeof x.valor === "number" ? duasCasas(x.valor) : null
      linhas.push({
        rubrica: rotuloRubrica(r),
        faixa: r.faixa,
        tipo: r.tipo,
        horas,
        valor,
        texto: String(x.texto ?? "").slice(0, 80),
        ambigua: valor === null || (r.tipo === "horas" && horas === null),
        origem: "imagem",
      })
    }
    await guardarLeitura(c!.id, { chave: l.leitura.chave, situacao: situacaoDas(linhas), linhas })
    lidos++
  }
  return { lidos, falhas }
}

/** Descarta o que foi lido dos contracheques da remessa (para ler de novo). */
export async function esquecerLeituras(ccId: string): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("pessoal_contracheques").update({ he_lidas: null, he_lidas_em: null }).eq("remessa_id", ccId)
}

// ── Gravar na remessa de ponto ───────────────────────────────────────────────

export async function aplicarHorasPagas(
  remessaPontoId: string,
  ccId: string,
  registroIds: string[],
  recalcular: boolean
): Promise<{ erro?: string; aplicados?: number; recalculadas?: string[]; paradas?: string[] }> {
  const previa = await previaHorasPagas(remessaPontoId, ccId)
  if (!previa?.cc) return { erro: "Remessa não encontrada." }
  if (previa.remessa.finalizada) return { erro: "A remessa de ponto está finalizada: reabra para gravar as horas pagas." }
  const escolhidos = new Set(registroIds)
  const alvo = previa.linhas.filter((l) => escolhidos.has(l.registroId) && l.podeAplicar)
  if (!alvo.length) return { erro: "Nenhum registro marcado com leitura completa." }

  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const recalculadas = new Set<string>()
  const paradas = new Set<string>()
  const { data: regs } = await admin
    .from("pessoal_registro_ponto")
    .select("id, saldo_remessa_anterior_70, horas_realizadas_70, saldo_remessa_anterior_100, horas_realizadas_100")
    .in("id", alvo.map((l) => l.registroId))
  const porId = new Map((regs ?? []).map((r) => [String(r.id), r]))
  const conta = (ant: unknown, real: unknown, pag: number | null) => {
    const partes = [num(ant), num(real), pag]
    return partes.every((v) => v === null) ? null : duasCasas((partes[0] ?? 0) + (partes[1] ?? 0) - (partes[2] ?? 0))
  }
  for (const l of alvo) {
    const r = porId.get(l.registroId)
    if (!r) continue
    const { error } = await admin
      .from("pessoal_registro_ponto")
      .update({
        horas_pagas_70: l.novo.horas1,
        horas_pagas_100: l.novo.horas2,
        valor_pago_70: l.novo.valor1,
        valor_pago_100: l.novo.valor2,
        saldo_remanescente_70: conta(r.saldo_remessa_anterior_70, r.horas_realizadas_70, l.novo.horas1),
        saldo_remanescente_100: conta(r.saldo_remessa_anterior_100, r.horas_realizadas_100, l.novo.horas2),
        pagas_contracheque_id: l.contrachequeId,
        pagas_lidas_em: agora,
      })
      .eq("id", l.registroId)
      .eq("remessa_id", remessaPontoId)
    if (error) return { erro: `Falha ao gravar ${l.nome}: ${error.message}` }
    if (recalcular && l.funcionarioId) {
      const c = await recalcularPosteriores(remessaPontoId, l.funcionarioId)
      c.recalculadas.forEach((x) => recalculadas.add(x))
      if (c.paradaEm) paradas.add(c.paradaEm)
    }
  }
  await admin.from("pessoal_registro_ponto_remessas").update({ contracheques_remessa_id: ccId }).eq("id", remessaPontoId)
  return { aplicados: alvo.length, recalculadas: [...recalculadas], paradas: [...paradas] }
}

// ── Sugestão de rubricas (configuração) ──────────────────────────────────────

export type RubricaSugerida = { codigo: string | null; descricao: string; contracheques: number }

/**
 * Lê o texto dos contracheques de uma remessa e lista as rubricas que parecem
 * ser de hora extra — só código e descrição, sem valores nem nomes. Sem IA.
 */
export async function sugerirRubricas(ccId: string): Promise<{ sugestoes: RubricaSugerida[]; lidos: number; semTexto: number }> {
  const ccs = (await contrachequesDaRemessaCC(ccId)).filter((c) => c.arquivo).slice(0, 40)
  const conta = new Map<string, RubricaSugerida>()
  let lidos = 0
  let semTexto = 0
  for (const c of ccs) {
    const bytes = await baixar(c.arquivo!)
    if (!bytes) continue
    let linhas: string[] = []
    try {
      linhas = await linhasDoPdf(bytes)
    } catch {
      continue
    }
    if (linhas.join("").length < 80) {
      semTexto++
      continue
    }
    lidos++
    const vistas = new Set<string>()
    for (const l of linhas) {
      const r = rubricaCandidata(l)
      if (!r) continue
      const k = `${r.codigo ?? ""}|${r.descricao}`
      if (vistas.has(k)) continue
      vistas.add(k)
      const atual = conta.get(k) ?? { ...r, contracheques: 0 }
      atual.contracheques++
      conta.set(k, atual)
    }
  }
  return { sugestoes: [...conta.values()].sort((a, b) => b.contracheques - a.contracheques), lidos, semTexto }
}
