/**
 * Formatação do corpo dos ofícios. O corpo é gravado em BBCode — o mesmo
 * formato dos 727 ofícios herdados do Bubble —, então o que já está no banco
 * não muda (e o resumo SHA-256 da assinatura eletrônica continua valendo).
 *
 * Este módulo é PURO (client e server): lê o BBCode num modelo de blocos,
 * escreve BBCode normalizado e gera texto simples. A tela (components/
 * oficio-corpo.tsx), o editor (components/editor-oficio.tsx) e o PDF
 * (lib/pdf/oficio.tsx) desenham a partir dos blocos.
 *
 * Suportado: negrito [b], itálico [i], sublinhado [u], tachado [s], listas
 * [ul]/[ol] com [li] (e níveis [li indent=N]), alinhamento [left] [center]
 * [right] [justify], recuo [indent data=N], título [h3] e link [url=…].
 * Do legado, cor, realce, fonte e tamanho são ignorados (o ofício tem visual
 * padronizado) e imagens/tabelas ficam de fora. Colchetes que não são
 * marcação — "[PREENCHER]", "[sic]" — continuam como texto.
 */

export type Alinhamento = "left" | "center" | "right" | "justify"

export type Trecho = {
  texto: string
  b?: boolean
  i?: boolean
  u?: boolean
  s?: boolean
  link?: string
}

export type ItemLista = { nivel: number; trechos: Trecho[] }

export type Bloco =
  | { tipo: "p"; alinhamento: Alinhamento | null; recuo: number; trechos: Trecho[] }
  | { tipo: "titulo"; alinhamento: Alinhamento | null; trechos: Trecho[] }
  | { tipo: "lista"; ordenada: boolean; itens: ItemLista[] }

const ALINHAMENTOS: Alinhamento[] = ["left", "center", "right", "justify"]
const MARCAS = ["b", "i", "u", "s"] as const
type Marca = (typeof MARCAS)[number]

/** Etiquetas reconhecidas — o resto entre colchetes é texto. */
const CONHECIDAS = new Set([
  "b", "i", "u", "s", "strike", "left", "center", "right", "justify",
  "ul", "ol", "list", "li", "*", "h1", "h2", "h3", "h4", "h5", "h6", "indent", "url", "email", "img",
  "color", "highlight", "size", "font", "ml", "td", "tr", "th", "table", "quote", "sub", "sup", "code",
])

const MAX_NIVEL = 4

/** Link só http(s) ou mailto — nada de javascript:. */
export function linkSeguro(v: string | null | undefined): string | null {
  const t = (v ?? "").trim().replace(/^["']|["']$/g, "")
  return /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(t) ? t : null
}

function numeroDe(v: string | undefined, padrao: number): number {
  const n = Number.parseInt((v ?? "").replace(/\D/g, ""), 10)
  return Number.isFinite(n) ? n : padrao
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export function lerCorpo(bb: string | null | undefined): Bloco[] {
  const blocos: Bloco[] = []
  const texto = (bb ?? "").replace(/\r\n?/g, "\n")
  const marcas: Record<Marca, number> = { b: 0, i: 0, u: 0, s: 0 }
  const links: (string | null)[] = []
  const alinhamentos: { a: Alinhamento; blocosAoAbrir: number }[] = []
  const recuos: number[] = []
  let titulo = false
  let atual: Extract<Bloco, { tipo: "p" | "titulo" }> | null = null
  // Listas: o bloco da lista aberta, a profundidade e o item corrente.
  let lista: Extract<Bloco, { tipo: "lista" }> | null = null
  let profundidade = 0
  let item: ItemLista | null = null
  let nivelDoItem = 0
  let descartando = 0 // dentro de [img]…[/img]
  let linhaVazia = true

  // "left" é o padrão: gravado ou não, dá no mesmo.
  const alinhamento = () => {
    const a = alinhamentos.at(-1)?.a ?? null
    return a === "left" ? null : a
  }
  const recuo = () => Math.min(MAX_NIVEL, recuos.reduce((s, n) => s + n, 0))

  const fecharBloco = () => {
    atual = null
  }
  const fecharItem = () => {
    item = null
  }
  const abrirBloco = () => {
    atual = titulo
      ? { tipo: "titulo", alinhamento: alinhamento(), trechos: [] }
      : { tipo: "p", alinhamento: alinhamento(), recuo: recuo(), trechos: [] }
    blocos.push(atual)
    linhaVazia = false
    return atual
  }
  const destino = (): Trecho[] => {
    if (lista) {
      if (!item) {
        item = { nivel: Math.min(MAX_NIVEL, Math.max(0, profundidade - 1 + nivelDoItem)), trechos: [] }
        lista.itens.push(item)
      }
      return item.trechos
    }
    return (atual ?? abrirBloco()).trechos
  }
  const acrescentar = (t: string) => {
    if (!t || descartando) return
    const alvo = destino()
    const trecho: Trecho = { texto: t }
    for (const m of MARCAS) if (marcas[m] > 0) trecho[m] = true
    const link = links.findLast((l) => l)
    if (link) trecho.link = link
    alvo.push(trecho)
    linhaVazia = false
  }
  const textoLivre = (t: string) => {
    const partes = t.split("\n")
    partes.forEach((parte, i) => {
      if (i > 0) {
        if (lista) {
          // Quebra dentro de item vira espaço; entre as etiquetas da lista, nada.
          if (item && item.trechos.length) acrescentar(" ")
        } else {
          if (atual) fecharBloco()
          else if (linhaVazia) blocos.push({ tipo: "p", alinhamento: alinhamento(), recuo: recuo(), trechos: [] })
          linhaVazia = true
        }
      }
      if (lista && !item && !parte.trim()) return
      acrescentar(parte)
    })
  }

  const re = /\[(\/?)([a-z][a-z0-9]*|\*)(?:(?:=|\s+)([^\]]*))?\]/gi
  let pos = 0
  for (const m of texto.matchAll(re)) {
    const nome = m[2].toLowerCase()
    if (!CONHECIDAS.has(nome)) continue
    textoLivre(texto.slice(pos, m.index))
    pos = (m.index ?? 0) + m[0].length
    const fecha = m[1] === "/"
    const valor = m[3]

    if (nome === "img") {
      descartando = Math.max(0, descartando + (fecha ? -1 : 1))
    } else if (nome === "b" || nome === "i" || nome === "u" || nome === "s" || nome === "strike") {
      const k: Marca = nome === "strike" ? "s" : nome
      marcas[k] = Math.max(0, marcas[k] + (fecha ? -1 : 1))
    } else if (nome === "url" || nome === "email") {
      if (fecha) links.pop()
      else links.push(linkSeguro(nome === "email" && valor ? `mailto:${valor.trim()}` : valor))
    } else if ((ALINHAMENTOS as string[]).includes(nome)) {
      if (!lista) fecharBloco()
      if (!fecha) {
        alinhamentos.push({ a: nome as Alinhamento, blocosAoAbrir: blocos.length })
      } else {
        const aberto = alinhamentos.pop()
        // "[justify][/justify]" do legado = linha em branco.
        if (aberto && !lista && blocos.length === aberto.blocosAoAbrir) {
          blocos.push({ tipo: "p", alinhamento: aberto.a === "left" ? null : aberto.a, recuo: recuo(), trechos: [] })
        }
        linhaVazia = false
      }
    } else if (/^h[1-6]$/.test(nome)) {
      fecharBloco()
      titulo = !fecha
      if (fecha) linhaVazia = false
    } else if (nome === "indent") {
      fecharBloco()
      if (fecha) recuos.pop()
      else recuos.push(Math.max(1, numeroDe(valor, 1)))
    } else if (nome === "ul" || nome === "ol" || nome === "list") {
      if (!fecha) {
        fecharBloco()
        fecharItem()
        if (!lista) {
          lista = { tipo: "lista", ordenada: nome === "ol" || (nome === "list" && !!valor), itens: [] }
          blocos.push(lista)
        }
        profundidade++
      } else {
        fecharItem()
        profundidade = Math.max(0, profundidade - 1)
        if (profundidade === 0) {
          lista = null
          linhaVazia = false
        }
      }
    } else if (nome === "li" || nome === "*") {
      if (!lista) {
        fecharBloco()
        lista = { tipo: "lista", ordenada: false, itens: [] }
        blocos.push(lista)
        profundidade = 1
      }
      fecharItem()
      if (!fecha) {
        nivelDoItem = numeroDe(valor?.match(/indent\s*=\s*"?(\d+)/i)?.[1] ?? (/^\d+$/.test(valor ?? "") ? valor : undefined), 0)
        item = { nivel: Math.min(MAX_NIVEL, Math.max(0, profundidade - 1 + nivelDoItem)), trechos: [] }
        lista.itens.push(item)
      }
    }
    // color, highlight, size, font, ml, td… — ignorados (o conteúdo fica).
  }
  textoLivre(texto.slice(pos))
  return arrumar(blocos)
}

function mesmasMarcas(a: Trecho, b: Trecho): boolean {
  return !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s && (a.link ?? null) === (b.link ?? null)
}

function juntarTrechos(ts: Trecho[]): Trecho[] {
  const saida: Trecho[] = []
  for (const t of ts) {
    if (!t.texto) continue
    const ultimo = saida.at(-1)
    if (ultimo && mesmasMarcas(ultimo, t)) ultimo.texto += t.texto
    else saida.push({ ...t })
  }
  return saida
}

const vazio = (b: Bloco) => b.tipo !== "lista" && !b.trechos.some((t) => t.texto.trim())

/** Junta trechos iguais, tira listas sem itens, no máximo UMA linha em branco seguida e nenhuma nas pontas. */
function arrumar(blocos: Bloco[]): Bloco[] {
  const saida: Bloco[] = []
  for (const b of blocos) {
    if (b.tipo === "lista") {
      const itens = b.itens.map((it) => ({ ...it, trechos: juntarTrechos(it.trechos) })).filter((it) => it.trechos.some((t) => t.texto.trim()))
      if (itens.length) saida.push({ ...b, itens })
      continue
    }
    const nb: Bloco = { ...b, trechos: juntarTrechos(b.trechos) }
    if (vazio(nb)) {
      const ultimo = saida.at(-1)
      if (!ultimo || vazio(ultimo)) continue
      // Linha em branco não carrega formatação (título vazio, recuo vazio…).
      saida.push({ tipo: "p", alinhamento: null, recuo: 0, trechos: [] })
      continue
    }
    saida.push(nb)
  }
  while (saida.length && vazio(saida.at(-1)!)) saida.pop()
  return saida
}

// ── Escrita ──────────────────────────────────────────────────────────────────

function trechosEmBB(ts: Trecho[]): string {
  return juntarTrechos(ts)
    .map((t) => {
      let s = t.texto
      for (const m of [...MARCAS].reverse()) if (t[m]) s = `[${m}]${s}[/${m}]`
      const link = linkSeguro(t.link)
      if (link) s = `[url=${link}]${s}[/url]`
      return s
    })
    .join("")
}

const comAlinhamento = (a: Alinhamento | null, s: string) => (a && a !== "left" ? `[${a}]${s}[/${a}]` : s)

/** Blocos → BBCode normalizado (uma linha por bloco). */
export function escreverCorpo(blocos: Bloco[]): string {
  return arrumar(blocos)
    .map((b) => {
      if (b.tipo === "lista") {
        const tag = b.ordenada ? "ol" : "ul"
        const itens = b.itens
          .map((it) => `[li${it.nivel > 0 ? ` indent=${it.nivel}` : ""}]${trechosEmBB(it.trechos)}[/li]`)
          .join("")
        return `[${tag}]${itens}[/${tag}]`
      }
      const miolo = trechosEmBB(b.trechos)
      if (b.tipo === "titulo") return comAlinhamento(b.alinhamento, `[h3]${miolo}[/h3]`)
      const recuado = b.recuo > 0 ? `[indent data=${b.recuo}]${miolo}[/indent]` : miolo
      return b.alinhamento && b.alinhamento !== "left" ? comAlinhamento(b.alinhamento, recuado) : recuado
    })
    .join("\n")
}

/** BBCode → BBCode normalizado (o que o editor grava). */
export function normalizarCorpo(bb: string | null | undefined): string {
  return escreverCorpo(lerCorpo(bb))
}

// ── Texto simples ────────────────────────────────────────────────────────────

/** Para buscas, e-mails e prévias: listas com "•" / "1.", sem marcação. */
export function corpoEmTexto(bb: string | null | undefined): string {
  return lerCorpo(bb)
    .map((b) => {
      if (b.tipo === "lista") {
        const marcadores = marcadoresDaLista(b)
        return b.itens
          .map((it, i) => `${"  ".repeat(it.nivel)}${marcadores[i]} ${it.trechos.map((t) => t.texto).join("")}`)
          .join("\n")
      }
      return b.trechos.map((t) => t.texto).join("")
    })
    .join("\n")
}

/** Números de cada item de lista ordenada, por nível (1., 2.… e a., b.… no nível 1). */
export function marcadoresDaLista(b: Extract<Bloco, { tipo: "lista" }>): string[] {
  const contagem: number[] = []
  return b.itens.map((it) => {
    contagem.length = it.nivel + 1
    contagem[it.nivel] = (contagem[it.nivel] ?? 0) + 1
    // Só caracteres que a Helvetica padrão do PDF tem (◦ e ▪ viram lixo lá).
    if (!b.ordenada) return ["•", "–", "·"][it.nivel % 3]
    const n = contagem[it.nivel]
    if (it.nivel % 3 === 1) return `${String.fromCharCode(96 + ((n - 1) % 26) + 1)})`
    if (it.nivel % 3 === 2) return `${["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][(n - 1) % 10]}.`
    return `${n}.`
  })
}
