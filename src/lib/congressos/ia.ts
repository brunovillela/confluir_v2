/**
 * Congressos — IA na relatoria (Fase 5): regras puras.
 *
 * Monta o que vai à IA (propostas identificadas só pelo número, sem nomes,
 * CPF, e-mail ou telefone), confere o que volta (só aceita números de
 * propostas enviadas, eixos e abrangências que existem, ajustes do catálogo)
 * e aponta, sem IA, quando uma redação nova parece mudar o sentido.
 *
 * Sem "server-only": testado em tests/unidade/congressos.spec.ts.
 */

import { AJUSTES, AJUSTE_POR_CHAVE, ajusteVisivel, normalizarValor, valoresPadrao, type ValorAjuste } from "@/lib/congressos/config"

export type FuncaoIA =
  | "refino"
  | "mesclagem"
  | "eixo"
  | "abrangencia"
  | "competencia"
  | "correlacao"
  | "sintese"
  | "triagem_mocao"
  | "caderno"
  | "regimento"

export const ROTULO_FUNCAO_IA: Record<FuncaoIA, string> = {
  refino: "Redação",
  mesclagem: "Fusão de parecidas",
  eixo: "Outro eixo",
  abrangencia: "Abrangência",
  competencia: "Fora de competência",
  correlacao: "Correlação entre grupos",
  sintese: "Síntese do grupo",
  triagem_mocao: "Triagem de moção",
  caderno: "Leitura do caderno",
  regimento: "Leitura do regimento",
}

export type SituacaoSugestao = "pendente" | "aceita" | "ajustada" | "recusada" | "obsoleta"

// ── Proteção dos dados pessoais ─────────────────────────────────────────────

/** Mascara CPF, e-mail e telefone antes de mandar um texto à IA. */
export function semDadosPessoais(texto: string): string {
  return texto
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]")
    .replace(/(\(?\b\d{2}\)?\s?)?\b9?\d{4}-?\d{4}\b/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[telefone]" : m))
}

export type PropostaParaIA = { numero: number; texto: string; eixo?: string | null; grupo?: string | null; abrangencia?: string | null }

/** Lista numerada que vai no prompt: "P12 [eixo · grupo]: texto". Sem autoria. */
export function listaParaIA(ps: PropostaParaIA[], { comGrupo = false, comEixo = false } = {}): string {
  return ps
    .map((p) => {
      const marcas = [comEixo ? p.eixo : null, comGrupo ? p.grupo : null, p.abrangencia ? `abrangência: ${p.abrangencia}` : null].filter(Boolean)
      return `P${p.numero}${marcas.length ? ` [${marcas.join(" · ")}]` : ""}: ${semDadosPessoais(p.texto.replace(/\s+/g, " ").trim())}`
    })
    .join("\n")
}

/** Divide em blocos de no máximo `max` itens, sem separar um eixo quando ele cabe inteiro. */
export function blocos<T>(porChave: [string, T[]][], max: number): T[][] {
  const saida: T[][] = []
  let atual: T[] = []
  for (const [, itens] of porChave) {
    if (itens.length > max) {
      if (atual.length) saida.push(atual)
      atual = []
      for (let i = 0; i < itens.length; i += max) saida.push(itens.slice(i, i + max))
      continue
    }
    if (atual.length + itens.length > max) {
      saida.push(atual)
      atual = []
    }
    atual.push(...itens)
  }
  if (atual.length) saida.push(atual)
  return saida
}

// ── Mudança de sentido (sem IA) ─────────────────────────────────────────────

const NEGACOES = ["não", "nunca", "nenhum", "nenhuma", "jamais", "sem", "vedado", "vedada", "proibido", "proibida", "contra", "fim", "extinção", "revogação", "revogar", "impedir"]
const MODAIS = ["deve", "devem", "deverá", "deverão", "pode", "podem", "poderá", "poderão", "exigir", "garantir", "assegurar", "lutar", "defender", "reivindicar", "obrigatório", "obrigatória", "facultativo", "facultativa"]

function palavras(t: string): string[] {
  return t
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}%,.]+/u)
    .map((w) => w.replace(/[.,]+$/, ""))
    .filter(Boolean)
}

function contar(ws: string[], lista: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const w of ws) if (lista.includes(w)) m.set(w, (m.get(w) ?? 0) + 1)
  return m
}

function numeros(t: string): string[] {
  return (t.match(/\d+(?:[.,]\d+)*\s*%?/g) ?? []).map((n) => n.replace(/\s+/g, "")).sort()
}

/**
 * Alertas de que a redação nova pode ter mudado o sentido: negação que
 * entrou ou saiu, número ou percentual diferente, verbo de obrigação trocado,
 * texto muito mais curto. Complementa o alerta da própria IA.
 */
export function alertasDeSentido(antes: string, depois: string): string[] {
  const a = palavras(antes)
  const d = palavras(depois)
  const alertas: string[] = []
  const na = contar(a, NEGACOES)
  const nd = contar(d, NEGACOES)
  const negMudou = [...new Set([...na.keys(), ...nd.keys()])].filter((w) => (na.get(w) ?? 0) !== (nd.get(w) ?? 0))
  if (negMudou.length) alertas.push(`Negação ou oposição mudou (${negMudou.map((w) => `"${w}"`).join(", ")}).`)
  const xa = numeros(antes)
  const xd = numeros(depois)
  if (xa.join("|") !== xd.join("|")) alertas.push(`Números diferentes: ${xa.join(", ") || "nenhum"} → ${xd.join(", ") || "nenhum"}.`)
  const ma = contar(a, MODAIS)
  const md = contar(d, MODAIS)
  const sairam = [...ma.keys()].filter((w) => !md.has(w))
  const entraram = [...md.keys()].filter((w) => !ma.has(w))
  if (sairam.length && entraram.length) alertas.push(`Força do pedido mudou: ${sairam.join(", ")} → ${entraram.join(", ")}.`)
  if (a.length >= 12 && d.length < a.length * 0.6) alertas.push("O texto novo ficou bem mais curto: confira se algo foi suprimido.")
  return alertas
}

// ── Leitura das respostas ───────────────────────────────────────────────────

const str = (v: unknown, max = 4000) => String(v ?? "").trim().slice(0, max)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** "P12", "12", 12 → 12, só se o número foi enviado. */
export function numeroValido(v: unknown, validos: Set<number>): number | null {
  const n = Number(String(v ?? "").replace(/^\s*P/i, "").trim())
  return Number.isInteger(n) && validos.has(n) ? n : null
}

/** Tira o rótulo "P12:" que a IA às vezes copia para o começo do texto. */
export function semRotulo(texto: string): string {
  return texto.replace(/^\s*(?:proposta\s+)?P?\d+\s*[:.)\-–—]\s+/i, "").trim()
}

export type Refino = { texto: string; mudaSentido: boolean; alerta: string }

export function lerRefino(d: Record<string, unknown> | undefined, original: string): Refino | null {
  const texto = semRotulo(str(d?.texto))
  if (texto.length < 5 || texto === original.trim()) return null
  return { texto, mudaSentido: d?.muda_sentido === true, alerta: str(d?.alerta, 500) }
}

export type Mesclagem = { numeros: number[]; texto: string; motivo: string }

/** Grupos de 2+ propostas; um número não aparece em dois grupos. */
export function lerMesclagem(d: Record<string, unknown> | undefined, validos: Set<number>): Mesclagem[] {
  const usados = new Set<number>()
  const saida: Mesclagem[] = []
  for (const g of arr(d?.grupos)) {
    const o = (g ?? {}) as Record<string, unknown>
    const ns = [...new Set(arr(o.propostas).map((v) => numeroValido(v, validos)).filter((n): n is number => n !== null))].filter((n) => !usados.has(n))
    const texto = semRotulo(str(o.texto))
    if (ns.length < 2 || texto.length < 5) continue
    ns.forEach((n) => usados.add(n))
    saida.push({ numeros: ns.sort((a, b) => a - b), texto, motivo: str(o.motivo, 500) })
  }
  return saida
}

export type Triagem = { numero: number; eixo: string | null; motivoEixo: string; abrangencia: string | null; foraCompetencia: string | null }

/**
 * Triagem por proposta: eixo e abrangência sugeridos só quando existem na
 * configuração e diferem do atual; fora de competência com motivo.
 */
export function lerTriagem(
  d: Record<string, unknown> | undefined,
  atuais: Map<number, { eixo: string | null; abrangencia: string | null }>,
  eixos: string[],
  abrangencias: string[]
): Triagem[] {
  const casar = (v: unknown, lista: string[]) => {
    const s = str(v, 200).toLowerCase()
    return s ? (lista.find((x) => x.toLowerCase() === s) ?? null) : null
  }
  const validos = new Set(atuais.keys())
  const saida: Triagem[] = []
  const vistos = new Set<number>()
  for (const item of arr(d?.propostas)) {
    const o = (item ?? {}) as Record<string, unknown>
    const n = numeroValido(o.proposta, validos)
    if (n === null || vistos.has(n)) continue
    vistos.add(n)
    const atual = atuais.get(n)!
    const eixo = casar(o.eixo, eixos)
    const abr = casar(o.abrangencia, abrangencias)
    const fora = str(o.fora_competencia, 500)
    const t: Triagem = {
      numero: n,
      eixo: eixo && eixo !== atual.eixo ? eixo : null,
      motivoEixo: str(o.motivo_eixo, 500),
      abrangencia: abr && abr !== atual.abrangencia ? abr : null,
      foraCompetencia: fora || null,
    }
    if (t.eixo || t.abrangencia || t.foraCompetencia) saida.push(t)
  }
  return saida
}

export type Relacao = "igual" | "complementar" | "contraditoria"
export const ROTULO_RELACAO: Record<Relacao, string> = { igual: "Iguais", complementar: "Complementares", contraditoria: "Contraditórias" }
export type Correlacao = { a: number; b: number; relacao: Relacao; motivo: string }

/** Pares de propostas de grupos diferentes; descarta par repetido ou do mesmo grupo. */
export function lerCorrelacao(d: Record<string, unknown> | undefined, grupoDe: Map<number, string | null>): Correlacao[] {
  const validos = new Set(grupoDe.keys())
  const vistos = new Set<string>()
  const saida: Correlacao[] = []
  for (const item of arr(d?.pares)) {
    const o = (item ?? {}) as Record<string, unknown>
    const a = numeroValido(o.a, validos)
    const b = numeroValido(o.b, validos)
    const relacao = str(o.relacao, 30) as Relacao
    if (a === null || b === null || a === b || !(relacao in ROTULO_RELACAO)) continue
    const ga = grupoDe.get(a)
    const gb = grupoDe.get(b)
    if (ga && gb && ga === gb) continue
    const k = [Math.min(a, b), Math.max(a, b)].join("-")
    if (vistos.has(k)) continue
    vistos.add(k)
    saida.push({ a: Math.min(a, b), b: Math.max(a, b), relacao, motivo: str(o.motivo, 500) })
  }
  const ordem: Record<Relacao, number> = { contraditoria: 0, igual: 1, complementar: 2 }
  return saida.sort((x, y) => ordem[x.relacao] - ordem[y.relacao] || x.a - y.a)
}

export type TriagemMocao = { tipo: string | null; destinatario: string; alertaConteudo: string | null; observacao: string }

export function lerTriagemMocao(d: Record<string, unknown> | undefined, tipos: string[]): TriagemMocao {
  const t = str(d?.tipo, 100).toLowerCase()
  const alerta = str(d?.alerta_conteudo, 500)
  return {
    tipo: tipos.find((x) => x.toLowerCase() === t) ?? null,
    destinatario: str(d?.destinatario, 300),
    alertaConteudo: alerta || null,
    observacao: str(d?.observacao, 500),
  }
}

export type ItemCaderno = { texto: string; eixo: string | null; origem: string }

/** Propostas lidas do caderno de teses, com o eixo casado aos eixos do congresso. */
export function lerCaderno(d: Record<string, unknown> | undefined, eixos: string[]): ItemCaderno[] {
  const saida: ItemCaderno[] = []
  const vistos = new Set<string>()
  for (const item of arr(d?.propostas)) {
    const o = (item ?? {}) as Record<string, unknown>
    const texto = str(o.texto).replace(/\s+/g, " ")
    if (texto.length < 5) continue
    const chave = texto.toLowerCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const e = str(o.eixo, 200).toLowerCase()
    saida.push({ texto, eixo: e ? (eixos.find((x) => x.toLowerCase() === e) ?? null) : null, origem: str(o.origem, 200) })
  }
  return saida
}

export type AjusteLido = {
  chave: string
  rotulo: string
  valor: ValorAjuste
  artigo: string
  trecho: string
  /** Valor como a tela de configuração o mostra. */
  descricao?: string
  /** O congresso já está configurado assim. */
  igualAtual?: boolean
}

/**
 * Ajustes lidos do regimento: só chaves do catálogo, valor normalizado pelo
 * tipo do ajuste (escolha fora da lista é descartada, não vira padrão).
 */
export function lerRegimento(d: Record<string, unknown> | undefined): AjusteLido[] {
  const saida: AjusteLido[] = []
  const vistos = new Set<string>()
  for (const item of arr(d?.ajustes)) {
    const o = (item ?? {}) as Record<string, unknown>
    const chave = str(o.chave, 100)
    const a = AJUSTE_POR_CHAVE.get(chave)
    if (!a || vistos.has(chave)) continue
    const bruto = o.valor
    if (bruto === null || bruto === undefined || bruto === "") continue
    if (a.tipo === "escolha" && !a.opcoes?.some((op) => op.valor === String(bruto))) continue
    if (a.tipo === "numero" && !Number.isFinite(Number(String(bruto).replace(",", ".")))) continue
    vistos.add(chave)
    saida.push({ chave, rotulo: a.rotulo, valor: normalizarValor(a, bruto), artigo: str(o.artigo, 60), trecho: str(o.trecho, 400) })
  }
  const ordem = new Map(AJUSTES.map((a, i) => [a.chave, i]))
  return saida.sort((x, y) => (ordem.get(x.chave) ?? 0) - (ordem.get(y.chave) ?? 0))
}

/** O catálogo em linhas curtas, para a IA saber que chaves e valores existem. */
export function catalogoParaIA(): string {
  const padrao = valoresPadrao()
  return AJUSTES.map((a) => {
      const tipo =
        a.tipo === "escolha"
          ? `escolha: ${a.opcoes!.map((o) => `"${o.valor}" (${o.rotulo})`).join(" | ")}`
          : a.tipo === "numero"
            ? `número${a.unidade ? ` em ${a.unidade}` : ""}`
            : a.tipo === "booleano"
              ? "true/false"
              : a.tipo === "datahora"
                ? "data e hora AAAA-MM-DDTHH:MM"
                : "texto"
      const cond = ajusteVisivel(a, padrao) ? "" : " (só se aplica conforme outros ajustes)"
      return `${a.chave} — ${a.rotulo}${a.ajuda ? `. ${a.ajuda}` : ""} [${tipo}]${cond}`
    })
    .join("\n")
}

// ── Utilidade medida ────────────────────────────────────────────────────────

export type UsoIA = { funcao: FuncaoIA; total: number; aceitas: number; recusadas: number; pendentes: number }

/** Quantas sugestões de cada função foram aceitas (com ou sem ajuste) ou recusadas. */
export function usoPorFuncao(sugestoes: { funcao: FuncaoIA; situacao: SituacaoSugestao }[]): UsoIA[] {
  const m = new Map<FuncaoIA, UsoIA>()
  for (const s of sugestoes) {
    const u = m.get(s.funcao) ?? { funcao: s.funcao, total: 0, aceitas: 0, recusadas: 0, pendentes: 0 }
    u.total++
    if (s.situacao === "aceita" || s.situacao === "ajustada") u.aceitas++
    else if (s.situacao === "recusada") u.recusadas++
    else if (s.situacao === "pendente") u.pendentes++
    m.set(s.funcao, u)
  }
  const ordem = Object.keys(ROTULO_FUNCAO_IA)
  return [...m.values()].sort((a, b) => ordem.indexOf(a.funcao) - ordem.indexOf(b.funcao))
}

/**
 * A sugestão ficou velha? Vale se alguma proposta envolvida mudou de texto
 * (versão) ou já saiu da consolidação depois que a IA a leu.
 */
export function sugestaoObsoleta(
  versoesLidas: Record<string, number> | undefined,
  atuais: Map<string, { versao: number; situacao: string }>
): boolean {
  if (!versoesLidas) return false
  return Object.entries(versoesLidas).some(([id, v]) => {
    const a = atuais.get(id)
    return !a || a.versao !== v || ["fundida", "retirada", "aprovada", "rejeitada"].includes(a.situacao)
  })
}
