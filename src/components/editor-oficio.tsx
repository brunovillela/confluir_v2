"use client"

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  escreverCorpo,
  lerCorpo,
  linkSeguro,
  type Alinhamento,
  type Bloco,
  type ItemLista,
  type Trecho,
} from "@/lib/oficio-formatacao"

/**
 * Editor do corpo do ofício: o texto aparece formatado enquanto se escreve e
 * é gravado em BBCode (lib/oficio-formatacao.ts), num <input hidden name>.
 * Usa o contentEditable do navegador com execCommand (sem dependência) e
 * converte o DOM de volta para o modelo de blocos a cada alteração — então
 * só sobrevive a formatação suportada, inclusive no que se cola do Word ou
 * de um e-mail.
 */

export type EditorOficioRef = {
  /** BBCode atual. */
  valor: () => string
  /** Troca o conteúdo (ex.: texto devolvido pela IA). */
  definir: (bb: string) => void
  focar: () => void
}

// ── Modelo → HTML do editor ──────────────────────────────────────────────────

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function trechosHtml(ts: Trecho[]): string {
  return ts
    .map((t) => {
      let s = escapar(t.texto)
      if (t.s) s = `<s>${s}</s>`
      if (t.u) s = `<u>${s}</u>`
      if (t.i) s = `<i>${s}</i>`
      if (t.b) s = `<b>${s}</b>`
      const link = linkSeguro(t.link)
      if (link) s = `<a href="${escapar(link)}">${s}</a>`
      return s
    })
    .join("")
}

const estiloAlinhamento = (a: Alinhamento | null) => (a && a !== "left" ? `text-align:${a};` : "")

function listaHtml(b: Extract<Bloco, { tipo: "lista" }>): string {
  // Nível mais fundo fica numa lista dentro do <li> anterior (como o navegador faz).
  const tag = b.ordenada ? "ol" : "ul"
  let html = `<${tag}>`
  let nivel = 0
  b.itens.forEach((it, i) => {
    const alvo = i === 0 ? 0 : it.nivel
    if (i > 0 && alvo > nivel) {
      while (nivel < alvo) {
        html += `<${tag}>`
        nivel++
      }
    } else if (i > 0) {
      html += "</li>"
      while (nivel > alvo) {
        html += `</${tag}></li>`
        nivel--
      }
    }
    html += `<li>${trechosHtml(it.trechos) || "<br>"}`
  })
  html += "</li>"
  while (nivel > 0) {
    html += `</${tag}></li>`
    nivel--
  }
  return html + `</${tag}>`
}

export function blocosParaHtml(blocos: Bloco[]): string {
  if (!blocos.length) return "<div><br></div>"
  return blocos
    .map((b) => {
      if (b.tipo === "lista") return listaHtml(b)
      const miolo = trechosHtml(b.trechos) || "<br>"
      if (b.tipo === "titulo") return `<h3 style="${estiloAlinhamento(b.alinhamento)}">${miolo}</h3>`
      const recuo = b.recuo ? `margin-left:${b.recuo * 2.5}em;` : ""
      return `<div style="${estiloAlinhamento(b.alinhamento)}${recuo}">${miolo}</div>`
    })
    .join("")
}

// ── DOM (editor ou HTML colado) → modelo ─────────────────────────────────────

type Contexto = {
  alinhamento: Alinhamento | null
  recuo: number
  titulo: boolean
  marcas: Omit<Trecho, "texto">
  lista: { bloco: Extract<Bloco, { tipo: "lista" }>; nivel: number } | null
  item: ItemLista | null
}

const BLOCOS = new Set(["DIV", "P", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE", "PRE", "CENTER", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "TR", "DL", "DD", "DT", "FIGURE", "MAIN", "ASIDE", "NAV", "FORM", "ADDRESS"])
const IGNORAR = new Set(["SCRIPT", "STYLE", "META", "TITLE", "HEAD", "IMG", "SVG", "IFRAME", "OBJECT", "VIDEO", "AUDIO", "CANVAS", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "NOSCRIPT", "TEMPLATE", "LINK"])

function recuoDoEstilo(el: HTMLElement): number {
  const medir = (v: string) => {
    const m = /^([\d.]+)(px|em|rem|pt|cm)?$/.exec(v.trim())
    if (!m) return 0
    const n = Number(m[1])
    const unidade = m[2] ?? "px"
    const px = unidade === "em" || unidade === "rem" ? n * 16 : unidade === "pt" ? n * 1.333 : unidade === "cm" ? n * 37.8 : n
    return Math.round(px / 40)
  }
  const n = Math.max(medir(el.style.marginLeft || ""), medir(el.style.paddingLeft || ""))
  if (n > 0) return n
  return el.tagName === "BLOCKQUOTE" ? 1 : 0
}

/** null = à esquerda (declarado); undefined = sem declaração, herda do bloco de fora. */
function alinhamentoDe(el: HTMLElement): Alinhamento | null | undefined {
  const v = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase()
  if (v === "center" || el.tagName === "CENTER") return "center"
  if (v === "right" || v === "end") return "right"
  if (v === "justify") return "justify"
  if (v === "left" || v === "start") return null
  return undefined
}

export function domParaBlocos(raiz: Node): Bloco[] {
  const blocos: Bloco[] = []
  let atual: Extract<Bloco, { tipo: "p" | "titulo" }> | null = null

  const abrir = (ctx: Contexto) => {
    atual = ctx.titulo
      ? { tipo: "titulo", alinhamento: ctx.alinhamento, trechos: [] }
      : { tipo: "p", alinhamento: ctx.alinhamento, recuo: Math.min(4, ctx.recuo), trechos: [] }
    blocos.push(atual)
    return atual
  }

  const texto = (bruto: string, ctx: Contexto) => {
    const t = bruto.replace(/[\r\n]+/g, " ").replace(/ /g, " ")
    if (ctx.lista) {
      if (!ctx.item) {
        if (!t.trim()) return
        ctx.item = { nivel: ctx.lista.nivel, trechos: [] }
        ctx.lista.bloco.itens.push(ctx.item)
      }
      ctx.item.trechos.push({ texto: t, ...ctx.marcas })
      return
    }
    if (!atual) {
      if (!t.trim()) return
      abrir(ctx)
    }
    atual!.trechos.push({ texto: t, ...ctx.marcas })
  }

  const visitar = (no: Node, ctx: Contexto) => {
    if (no.nodeType === Node.TEXT_NODE) {
      texto(no.textContent ?? "", ctx)
      return
    }
    if (no.nodeType !== Node.ELEMENT_NODE) return
    const el = no as HTMLElement
    const tag = el.tagName.toUpperCase()
    if (IGNORAR.has(tag)) return

    if (tag === "BR") {
      if (ctx.lista) {
        if (ctx.item) ctx.item.trechos.push({ texto: " " })
        return
      }
      if (atual) atual = null
      else blocos.push({ tipo: "p", alinhamento: ctx.alinhamento, recuo: ctx.recuo, trechos: [] })
      return
    }

    if (tag === "UL" || tag === "OL") {
      atual = null
      if (ctx.lista) {
        const filhos = { ...ctx, lista: { bloco: ctx.lista.bloco, nivel: Math.min(4, ctx.lista.nivel + 1) }, item: null }
        el.childNodes.forEach((f) => visitar(f, filhos))
        return
      }
      const bloco: Extract<Bloco, { tipo: "lista" }> = { tipo: "lista", ordenada: tag === "OL", itens: [] }
      blocos.push(bloco)
      const filhos = { ...ctx, lista: { bloco, nivel: 0 }, item: null }
      el.childNodes.forEach((f) => visitar(f, filhos))
      return
    }

    if (tag === "LI") {
      if (!ctx.lista) {
        atual = null
        const bloco: Extract<Bloco, { tipo: "lista" }> = { tipo: "lista", ordenada: false, itens: [] }
        blocos.push(bloco)
        ctx = { ...ctx, lista: { bloco, nivel: 0 } }
      }
      const item: ItemLista = { nivel: ctx.lista!.nivel, trechos: [] }
      ctx.lista!.bloco.itens.push(item)
      const filhos = { ...ctx, item }
      el.childNodes.forEach((f) => visitar(f, filhos))
      return
    }

    // Marcas de texto (tags e estilos inline, do editor ou colados).
    const marcas = { ...ctx.marcas }
    const peso = el.style.fontWeight
    if (tag === "B" || tag === "STRONG" || peso === "bold" || Number(peso) >= 600) marcas.b = true
    if (tag === "I" || tag === "EM" || el.style.fontStyle === "italic") marcas.i = true
    const deco = `${el.style.textDecoration} ${el.style.textDecorationLine}`
    if (tag === "U" || tag === "INS" || deco.includes("underline")) marcas.u = true
    if (tag === "S" || tag === "STRIKE" || tag === "DEL" || deco.includes("line-through")) marcas.s = true
    if (tag === "A") {
      const link = linkSeguro(el.getAttribute("href"))
      if (link) marcas.link = link
    }

    if (BLOCOS.has(tag) && !ctx.lista) {
      atual = null
      const alinh = alinhamentoDe(el)
      const filhos: Contexto = {
        ...ctx,
        marcas,
        alinhamento: alinh === undefined ? ctx.alinhamento : alinh,
        recuo: Math.min(4, ctx.recuo + recuoDoEstilo(el)),
        titulo: ctx.titulo || /^H[1-6]$/.test(tag),
      }
      const antes = blocos.length
      el.childNodes.forEach((f) => visitar(f, filhos))
      // Bloco sem conteúdo (<div><br></div> já virou linha em branco pelo BR).
      if (blocos.length === antes) blocos.push({ tipo: "p", alinhamento: null, recuo: 0, trechos: [] })
      atual = null
      return
    }
    el.childNodes.forEach((f) => visitar(f, { ...ctx, marcas }))
  }

  raiz.childNodes.forEach((f) =>
    visitar(f, { alinhamento: null, recuo: 0, titulo: false, marcas: {}, lista: null, item: null })
  )
  return blocos
}

// ── Componente ───────────────────────────────────────────────────────────────

type Estado = Record<string, boolean>

const COMANDOS_ESTADO = [
  "bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList",
  "justifyCenter", "justifyRight", "justifyFull",
] as const

function Botao({
  icone: Icone,
  rotulo,
  atalho,
  ativo,
  onClick,
}: {
  icone: LucideIcon
  rotulo: string
  atalho?: string
  ativo?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={atalho ? `${rotulo} (${atalho})` : rotulo}
      aria-label={rotulo}
      aria-pressed={ativo === undefined ? undefined : ativo}
      // mousedown sem foco: a seleção do texto continua lá.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors",
        ativo && "bg-muted text-foreground"
      )}
    >
      <Icone className="size-4" />
    </button>
  )
}

const Separador = () => <span aria-hidden className="bg-border mx-1 h-5 w-px" />

export function EditorOficio({
  id,
  name,
  valorInicial,
  className,
  ref,
  rotuloId,
}: {
  id?: string
  name: string
  valorInicial: string | null | undefined
  className?: string
  ref?: Ref<EditorOficioRef>
  /** id do <label> que nomeia o campo. */
  rotuloId?: string
}) {
  const editor = useRef<HTMLDivElement>(null)
  const [valor, setValor] = useState(() => escreverCorpo(lerCorpo(valorInicial)))
  const [estado, setEstado] = useState<Estado>({})
  const [titulo, setTitulo] = useState(false)

  const sincronizar = useCallback(() => {
    if (!editor.current) return
    setValor(escreverCorpo(domParaBlocos(editor.current)))
  }, [])

  // Conteúdo inicial (uma vez; depois o navegador cuida da edição).
  useEffect(() => {
    if (!editor.current) return
    editor.current.innerHTML = blocosParaHtml(lerCorpo(valorInicial))
    document.execCommand("styleWithCSS", false, "false")
    document.execCommand("defaultParagraphSeparator", false, "div")
    // valorInicial só vale na montagem (o formulário troca a key para recomeçar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atualizarEstado = useCallback(() => {
    const sel = document.getSelection()
    if (!editor.current || !sel?.anchorNode || !editor.current.contains(sel.anchorNode)) return
    const novo: Estado = {}
    for (const c of COMANDOS_ESTADO) {
      try {
        novo[c] = document.queryCommandState(c)
      } catch {
        novo[c] = false
      }
    }
    setEstado(novo)
    let no: Node | null = sel.anchorNode
    let emTitulo = false
    while (no && no !== editor.current) {
      if (no.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test((no as HTMLElement).tagName)) emTitulo = true
      no = no.parentNode
    }
    setTitulo(emTitulo)
  }, [])

  useEffect(() => {
    document.addEventListener("selectionchange", atualizarEstado)
    return () => document.removeEventListener("selectionchange", atualizarEstado)
  }, [atualizarEstado])

  const executar = (comando: string, arg?: string) => {
    editor.current?.focus()
    document.execCommand(comando, false, arg)
    sincronizar()
    atualizarEstado()
  }

  useImperativeHandle(
    ref,
    () => ({
      valor: () => (editor.current ? escreverCorpo(domParaBlocos(editor.current)) : valor),
      definir: (bb: string) => {
        if (!editor.current) return
        editor.current.innerHTML = blocosParaHtml(lerCorpo(bb))
        sincronizar()
      },
      focar: () => editor.current?.focus(),
    }),
    [valor, sincronizar]
  )

  const inserirLink = () => {
    const sel = document.getSelection()
    if (!sel || sel.isCollapsed) {
      window.alert("Selecione o texto que vai virar link.")
      return
    }
    const endereco = window.prompt("Endereço do link (https://… ou mailto:…)", "https://")
    const link = linkSeguro(endereco)
    if (!link) {
      if (endereco && endereco !== "https://") window.alert("Use um endereço que comece com https://, http:// ou mailto:.")
      return
    }
    executar("createLink", link)
  }

  return (
    <div className={cn("border-input focus-within:ring-ring/50 rounded-md border shadow-xs focus-within:ring-[3px]", className)}>
      <div
        role="toolbar"
        aria-label="Formatação do texto"
        className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1"
      >
        <Botao icone={Bold} rotulo="Negrito" atalho="Ctrl+B" ativo={estado.bold} onClick={() => executar("bold")} />
        <Botao icone={Italic} rotulo="Itálico" atalho="Ctrl+I" ativo={estado.italic} onClick={() => executar("italic")} />
        <Botao icone={Underline} rotulo="Sublinhado" atalho="Ctrl+U" ativo={estado.underline} onClick={() => executar("underline")} />
        <Botao icone={Strikethrough} rotulo="Tachado" ativo={estado.strikeThrough} onClick={() => executar("strikeThrough")} />
        <Separador />
        <Botao icone={List} rotulo="Lista com marcadores" ativo={estado.insertUnorderedList} onClick={() => executar("insertUnorderedList")} />
        <Botao icone={ListOrdered} rotulo="Lista numerada" ativo={estado.insertOrderedList} onClick={() => executar("insertOrderedList")} />
        <Botao icone={IndentDecrease} rotulo="Diminuir recuo" atalho="Shift+Tab" onClick={() => executar("outdent")} />
        <Botao icone={IndentIncrease} rotulo="Aumentar recuo" atalho="Tab" onClick={() => executar("indent")} />
        <Separador />
        <Botao
          icone={AlignLeft}
          rotulo="Alinhar à esquerda"
          ativo={!estado.justifyCenter && !estado.justifyRight && !estado.justifyFull}
          onClick={() => executar("justifyLeft")}
        />
        <Botao icone={AlignCenter} rotulo="Centralizar" ativo={estado.justifyCenter} onClick={() => executar("justifyCenter")} />
        <Botao icone={AlignRight} rotulo="Alinhar à direita" ativo={estado.justifyRight} onClick={() => executar("justifyRight")} />
        <Botao icone={AlignJustify} rotulo="Justificar" ativo={estado.justifyFull} onClick={() => executar("justifyFull")} />
        <Separador />
        <Botao icone={Heading3} rotulo="Título de seção" ativo={titulo} onClick={() => executar("formatBlock", titulo ? "div" : "h3")} />
        <Botao icone={Link} rotulo="Inserir link" onClick={inserirLink} />
        <Botao icone={Link2Off} rotulo="Remover link" onClick={() => executar("unlink")} />
        <Botao icone={RemoveFormatting} rotulo="Limpar formatação do trecho" onClick={() => executar("removeFormat")} />
        <Separador />
        <Botao icone={Undo2} rotulo="Desfazer" atalho="Ctrl+Z" onClick={() => executar("undo")} />
        <Botao icone={Redo2} rotulo="Refazer" atalho="Ctrl+Y" onClick={() => executar("redo")} />
      </div>
      <div
        id={id}
        ref={editor}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={rotuloId}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        lang="pt-BR"
        onInput={sincronizar}
        onBlur={sincronizar}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault()
            executar(e.shiftKey ? "outdent" : "indent")
          }
        }}
        onPaste={(e) => {
          e.preventDefault()
          const html = e.clipboardData.getData("text/html")
          if (html) {
            const doc = new DOMParser().parseFromString(html, "text/html")
            executar("insertHTML", blocosParaHtml(domParaBlocos(doc.body)))
          } else {
            executar("insertText", e.clipboardData.getData("text/plain"))
          }
        }}
        className={cn(
          "min-h-[22rem] px-3 py-2 text-sm leading-relaxed outline-none",
          "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-7",
          "[&_ol_ol]:list-[lower-alpha] [&_ul_ul]:list-[circle]",
          "[&_h3]:mt-1 [&_h3]:text-base [&_h3]:font-semibold",
          "[&_a]:text-primary [&_a]:underline [&_blockquote]:my-0 [&_blockquote]:ml-10"
        )}
      />
      <input type="hidden" name={name} value={valor} />
    </div>
  )
}
