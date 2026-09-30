import { COR, escaparHtml } from "@/lib/email-layout"
import { FILIACAO_CONDICOES, FORMAS_RECEBIMENTO } from "@/lib/filiacao"
import { lerCorpo, linkSeguro, type Bloco, type Trecho } from "@/lib/oficio-formatacao"

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

/** Horário do envio automático (o agendador roda às 12:00 UTC). */
export const HORA_ENVIO_AUTOMATICO = "9h"

export type SituacaoEmail = "pendente" | "enviado" | "sem_email" | "descadastrado" | "duplicado" | "falha"

export const ROTULO_SITUACAO_EMAIL: Record<SituacaoEmail, string> = {
  pendente: "Na fila",
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
