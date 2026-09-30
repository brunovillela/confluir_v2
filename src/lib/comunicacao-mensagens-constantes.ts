import { COR, escaparHtml } from "@/lib/email-layout"
import { FILIACAO_CONDICOES, FORMAS_RECEBIMENTO } from "@/lib/filiacao"
import { lerCorpo, linkSeguro, type Bloco, type Trecho } from "@/lib/oficio-formatacao"
import { semAcento } from "@/lib/texto"

/**
 * Comunicação › Mensagens aos filiados — constantes e utilitários puros,
 * compartilhados entre client (prévia, botão do WhatsApp) e server (envio).
 */

export const PADRAO_ANIVERSARIO = {
  assunto: "Feliz aniversário, {primeiro_nome}!",
  mensagem:
    "Olá, {primeiro_nome}!\n\nHoje é o seu dia, e a {entidade} não podia deixar de lembrar. Desejamos um aniversário cheio de saúde, alegria e conquistas, ao lado de quem você gosta.\n\nConte sempre com a gente.\n\nUm abraço,\n{entidade}",
  textoWhatsapp:
    "Olá, {primeiro_nome}! A {entidade} deseja um feliz aniversário, com muita saúde e alegria. Conte sempre com a gente!",
}

export const VARIAVEIS_MENSAGEM = [
  { chave: "{primeiro_nome}", rotulo: "primeiro nome" },
  { chave: "{nome}", rotulo: "nome completo" },
  { chave: "{entidade}", rotulo: "nome da entidade" },
] as const

/** Hora padrão do envio automático (hora de Brasília). O agendador roda a cada 15 min. */
export const HORA_ENVIO_PADRAO = 9

/** "9h", "14h". */
export const rotuloHora = (h: number) => `${h}h`

export const HORAS_DO_DIA = Array.from({ length: 24 }, (_, h) => h)

export type SituacaoEmail = "pendente" | "processando" | "enviado" | "sem_email" | "descadastrado" | "duplicado" | "falha"

export const ROTULO_SITUACAO_EMAIL: Record<SituacaoEmail, string> = {
  pendente: "Na fila",
  processando: "Enviando",
  enviado: "Enviado",
  sem_email: "Sem e-mail",
  descadastrado: "Descadastrado",
  duplicado: "E-mail repetido",
  falha: "Falhou",
}

const MINUSCULAS = new Set(["da", "das", "de", "do", "dos", "e"])

/** "MARIA DA SILVA" → "Maria da Silva" (o cadastro traz muito nome em caixa alta). */
export function nomeProprio(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
}

export function primeiroNome(nome: string): string {
  return nomeProprio(nome).split(" ")[0] ?? ""
}

/** Troca {primeiro_nome}, {nome} e {entidade} no texto. */
export function aplicarVariaveis(texto: string, v: { nome: string; entidade: string }): string {
  return texto
    .replaceAll("{primeiro_nome}", primeiroNome(v.nome))
    .replaceAll("{nome}", nomeProprio(v.nome))
    .replaceAll("{entidade}", v.entidade)
}

/**
 * Número no formato do wa.me (55 + DDD + número), ou null. Aceita o que o
 * cadastro tiver: "(22) 99876-5432", "22998765432", "+55 22 99876-5432".
 */
export function numeroWhatsapp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "").replace(/^0+/, "")
  if (d.length === 10 || d.length === 11) return `55${d}`
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d
  return null
}

/** Celular brasileiro: DDD + 9 + 8 dígitos. */
export function pareceCelular(telefone: string | null | undefined): boolean {
  const n = numeroWhatsapp(telefone)
  return !!n && n.length === 13 && n.charAt(4) === "9"
}

export function linkWhatsapp(telefone: string, texto: string): string | null {
  const n = numeroWhatsapp(telefone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null
}

export function formatarTelefone(telefone: string | null | undefined): string {
  const n = numeroWhatsapp(telefone)
  if (!n) return telefone ?? ""
  const d = n.slice(2)
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
}

export const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// ── Mala direta ────────────────────────────────────────────────────────────

export type SituacaoMensagem = "rascunho" | "agendada" | "enviando" | "enviada" | "cancelada"

export const ROTULO_SITUACAO_MENSAGEM: Record<SituacaoMensagem, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  enviando: "Enviando",
  enviada: "Enviada",
  cancelada: "Cancelada",
}

/** Condição "sem condição informada" no filtro (cadastros antigos com null). */
export const CONDICAO_SEM_INFORMACAO = "sem_condicao"

export const CONDICOES_MALA_DIRETA = [
  ...FILIACAO_CONDICOES.filter((c) => c !== "Falecido" && c !== "Excluído(a) do quadro associativo").map((c) => ({
    valor: c as string,
    rotulo: c as string,
  })),
  { valor: CONDICAO_SEM_INFORMACAO, rotulo: "Sem condição informada" },
]

/** O recorte de uma mala direta — os filtros dos relatórios de filiados. */
export type FiltrosMalaDireta = {
  condicoes: string[]
  fonte?: string
  condicaoFonte?: string
  uf?: string
  cidade?: string
  lotacao?: string
  formaRecebimento?: string
  inadimplente?: "sim" | "nao"
  idadeMin?: string
  idadeMax?: string
}

const umTexto = (v: unknown) => (typeof v === "string" && v.trim() && v !== "todas" && v !== "todos" ? v.trim() : undefined)
const inteiroTexto = (v: unknown) => {
  const t = umTexto(v)
  return t && /^\d{1,3}$/.test(t) ? t : undefined
}

/** Filtros vindos do banco (jsonb) ou do formulário, só com valores válidos. */
export function normalizarFiltros(o: Record<string, unknown> | null | undefined): FiltrosMalaDireta {
  const validas = new Set(CONDICOES_MALA_DIRETA.map((c) => c.valor))
  const brutas = Array.isArray(o?.condicoes) ? o.condicoes : []
  const condicoes = brutas.filter((c): c is string => typeof c === "string" && validas.has(c))
  const forma = umTexto(o?.formaRecebimento)
  const inad = umTexto(o?.inadimplente)
  return {
    condicoes: condicoes.length ? condicoes : ["Ativo"],
    fonte: umTexto(o?.fonte),
    condicaoFonte: umTexto(o?.condicaoFonte),
    uf: umTexto(o?.uf),
    cidade: umTexto(o?.cidade),
    lotacao: umTexto(o?.lotacao),
    formaRecebimento:
      forma && (forma === "nao_informado" || (FORMAS_RECEBIMENTO as readonly string[]).includes(forma)) ? forma : undefined,
    inadimplente: inad === "sim" || inad === "nao" ? inad : undefined,
    idadeMin: inteiroTexto(o?.idadeMin),
    idadeMax: inteiroTexto(o?.idadeMax),
  }
}

// ── Corpo formatado (editor dos ofícios) → HTML do e-mail ──────────────────

const ALINHAR = (a: string | null) => (a && a !== "left" ? `text-align:${a};` : "")

function trechosEmail(ts: Trecho[], v: { nome: string; entidade: string }): string {
  return ts
    .map((t) => {
      let h = escaparHtml(aplicarVariaveis(t.texto, v))
      if (t.s) h = `<s>${h}</s>`
      if (t.u) h = `<u>${h}</u>`
      if (t.i) h = `<em>${h}</em>`
      if (t.b) h = `<strong>${h}</strong>`
      const link = linkSeguro(t.link)
      if (link) h = `<a href="${escaparHtml(link)}" target="_blank" style="color:${COR.laranjaAcao};">${h}</a>`
      return h
    })
    .join("")
}

const vazio = (b: Bloco) => b.tipo !== "lista" && b.trechos.every((t) => !t.texto.trim())

/**
 * O corpo gravado pelo editor (BBCode) como HTML de e-mail, com estilo inline
 * e as variáveis trocadas pelo nome de cada pessoa. Linhas em branco não viram
 * espaço extra: cada parágrafo já tem a sua margem.
 */
export function corpoParaEmailHtml(bb: string | null | undefined, v: { nome: string; entidade: string }): string {
  return lerCorpo(bb)
    .filter((b) => !vazio(b))
    .map((b) => {
      if (b.tipo === "titulo") {
        return `<h3 style="margin:8px 0 12px;font-size:17px;line-height:1.35;color:${COR.navy};${ALINHAR(b.alinhamento)}">${trechosEmail(b.trechos, v)}</h3>`
      }
      if (b.tipo === "lista") {
        const tag = b.ordenada ? "ol" : "ul"
        const itens = b.itens
          .map((it) => `<li style="margin:0 0 6px;${it.nivel ? `margin-left:${it.nivel * 24}px;` : ""}">${trechosEmail(it.trechos, v)}</li>`)
          .join("")
        return `<${tag} style="margin:0 0 16px;padding-left:24px;">${itens}</${tag}>`
      }
      const recuo = b.recuo ? `margin-left:${b.recuo * 32}px;` : ""
      return `<p style="margin:0 0 16px;${ALINHAR(b.alinhamento)}${recuo}">${trechosEmail(b.trechos, v)}</p>`
    })
    .join("\n")
}

// ── Mensagens específicas de aniversário ───────────────────────────────────

/**
 * O que a pessoa precisa atender para receber uma mensagem específica. Tudo
 * opcional; o que estiver preenchido precisa valer ao mesmo tempo.
 */
export type CriteriosAniversario = {
  /** Idade que a pessoa completa no dia. */
  idadeDe?: number
  idadeAte?: number
  /** Só idades redondas: 30, 40, 50… */
  idadeRedonda?: boolean
  /** Anos desde a primeira filiação. */
  filiadoHaDe?: number
  filiadoHaAte?: number
  /** Fonte pagadora do vínculo corrente (qualquer uma das marcadas). */
  fontes?: string[]
  /** Condição na fonte do vínculo corrente (qualquer uma das marcadas). */
  condicoesFonte?: string[]
  uf?: string
  cidade?: string
}

/** O que se sabe da pessoa no dia do aniversário, para escolher a mensagem. */
export type PerfilAniversario = {
  idade: number | null
  filiadoHa: number | null
  fonteId: string | null
  condicaoFonte: string | null
  uf: string | null
  cidade: string | null
}

const inteiroOuNada = (v: unknown, max = 150): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined
}
const listaDeTextos = (v: unknown): string[] | undefined => {
  const l = (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim())
  return l.length ? l : undefined
}

export function normalizarCriterios(o: Record<string, unknown> | null | undefined): CriteriosAniversario {
  const c: CriteriosAniversario = {
    idadeDe: inteiroOuNada(o?.idadeDe),
    idadeAte: inteiroOuNada(o?.idadeAte),
    idadeRedonda: o?.idadeRedonda === true || o?.idadeRedonda === "on" || undefined,
    filiadoHaDe: inteiroOuNada(o?.filiadoHaDe, 100),
    filiadoHaAte: inteiroOuNada(o?.filiadoHaAte, 100),
    fontes: listaDeTextos(o?.fontes),
    condicoesFonte: listaDeTextos(o?.condicoesFonte),
    uf: umTexto(o?.uf),
    cidade: umTexto(o?.cidade),
  }
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as CriteriosAniversario
}

export const semCriterios = (c: CriteriosAniversario) => Object.keys(c).length === 0

const semAcentoMinusculo = (t: string) => semAcento(t).toLowerCase()

/** A pessoa atende a todos os critérios preenchidos? */
export function atendeCriterios(c: CriteriosAniversario, p: PerfilAniversario): boolean {
  if (c.idadeDe !== undefined || c.idadeAte !== undefined || c.idadeRedonda) {
    if (p.idade === null) return false
    if (c.idadeDe !== undefined && p.idade < c.idadeDe) return false
    if (c.idadeAte !== undefined && p.idade > c.idadeAte) return false
    if (c.idadeRedonda && (p.idade === 0 || p.idade % 10 !== 0)) return false
  }
  if (c.filiadoHaDe !== undefined || c.filiadoHaAte !== undefined) {
    if (p.filiadoHa === null) return false
    if (c.filiadoHaDe !== undefined && p.filiadoHa < c.filiadoHaDe) return false
    if (c.filiadoHaAte !== undefined && p.filiadoHa > c.filiadoHaAte) return false
  }
  if (c.fontes && (!p.fonteId || !c.fontes.includes(p.fonteId))) return false
  if (c.condicoesFonte && (!p.condicaoFonte || !c.condicoesFonte.includes(p.condicaoFonte))) return false
  if (c.uf && (p.uf ?? "").toUpperCase() !== c.uf.toUpperCase()) return false
  if (c.cidade && !semAcentoMinusculo(p.cidade ?? "").includes(semAcentoMinusculo(c.cidade))) return false
  return true
}

export type ModeloAniversario = {
  id: string
  nome: string
  ativo: boolean
  ordem: number
  criterios: CriteriosAniversario
  assunto: string
  mensagem: string
  textoWhatsapp: string
}

/** A primeira mensagem específica (ativa, na ordem da lista) que a pessoa atende. */
export function escolherModelo<M extends Pick<ModeloAniversario, "ativo" | "criterios">>(
  modelos: M[],
  p: PerfilAniversario
): M | null {
  return modelos.find((m) => m.ativo && !semCriterios(m.criterios) && atendeCriterios(m.criterios, p)) ?? null
}

const faixa = (de: number | undefined, ate: number | undefined, unidade: string) =>
  de !== undefined && ate !== undefined
    ? de === ate
      ? `${de} ${unidade}`
      : `de ${de} a ${ate} ${unidade}`
    : de !== undefined
      ? `${de} ${unidade} ou mais`
      : `até ${ate} ${unidade}`

/** "Completa 60 anos · Aposentado(a)" — para a lista e para a IA. */
export function descreverCriterios(c: CriteriosAniversario, fontes: { id: string; nome: string }[] = []): string {
  const partes: string[] = []
  if (c.idadeDe !== undefined || c.idadeAte !== undefined) partes.push(`Completa ${faixa(c.idadeDe, c.idadeAte, "anos")}`)
  if (c.idadeRedonda) partes.push("Idade redonda (30, 40, 50…)")
  if (c.filiadoHaDe !== undefined || c.filiadoHaAte !== undefined) {
    partes.push(`Filiado(a) há ${faixa(c.filiadoHaDe, c.filiadoHaAte, "anos")}`)
  }
  if (c.fontes) partes.push(`Fonte: ${c.fontes.map((id) => fontes.find((f) => f.id === id)?.nome ?? "?").join(" ou ")}`)
  if (c.condicoesFonte) partes.push(c.condicoesFonte.join(" ou "))
  if (c.uf) partes.push(`UF: ${c.uf}`)
  if (c.cidade) partes.push(`Cidade contém "${c.cidade}"`)
  return partes.join(" · ")
}
