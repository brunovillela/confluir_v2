"use client"

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, MessageSquarePlus, Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type ItemBusca = {
  titulo: string
  resumo: string
  area: string
  href: string
  /**
   * Corpo do artigo em texto puro (A111). Sem ele, a busca olha só título,
   * resumo e área — é o caso do painel e do hotel.
   */
  texto?: string
}

/** Para onde mandar quem não achou a resposta (A115) — no portal, o Atendimento. */
export type SaidaBusca = { rotulo: string; href: string }

/** O nome da seção em cada interface (A170): "manual" no painel e no hotel, "ajuda" no portal. */
const ONDE = { manual: "no manual", ajuda: "na ajuda" } as const

const MAX_RESULTADOS = 8

/** Acento e caixa não contam: "endereco" acha "Endereço". */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/**
 * Corpo normalizado e, para cada caractere dele, a posição no original — é o
 * que permite recortar e destacar o trecho com os acentos de volta.
 */
function indexar(original: string): { norm: string; origem: number[] } {
  let norm = ""
  const origem: number[] = []
  for (let i = 0; i < original.length; i++) {
    const n = normalizar(original[i])
    norm += n
    for (let k = 0; k < n.length; k++) origem.push(i)
  }
  return { norm, origem }
}

type Indexado = {
  item: ItemBusca
  titulo: string
  resumo: string
  area: string
  corpo: { norm: string; origem: number[] } | null
}

/** `marcas`: as formas que casaram (a palavra ou o radical dela), para o destaque. */
type Resultado = { item: ItemBusca; trecho: string | null; pontos: number; marcas: string[] }

/** Quantas vezes `termo` aparece em `texto` (até `teto`). */
function ocorrencias(texto: string, termo: string, teto: number): number {
  let n = 0
  for (let i = texto.indexOf(termo); i !== -1 && n < teto; i = texto.indexOf(termo, i + termo.length)) n++
  return n
}

/**
 * Trecho do corpo em volta da primeira ocorrência de `termo`, cortado em
 * palavra inteira: é o que mostra ao associado POR QUE o artigo apareceu.
 */
function recortar(corpo: { norm: string; origem: number[] }, original: string, termo: string): string | null {
  const pos = corpo.norm.indexOf(termo)
  if (pos === -1) return null
  let ini = corpo.origem[Math.max(0, pos - 50)]
  let fim = corpo.origem[Math.min(corpo.norm.length - 1, pos + termo.length + 70)] + 1
  if (ini > 0) {
    const espaco = original.indexOf(" ", ini)
    ini = espaco === -1 || espaco > corpo.origem[pos] ? ini : espaco + 1
  }
  if (fim < original.length) {
    const espaco = original.lastIndexOf(" ", fim)
    fim = espaco > corpo.origem[pos] ? espaco : fim
  }
  return `${ini > 0 ? "…" : ""}${original.slice(ini, fim).trim()}${fim < original.length ? "…" : ""}`
}

/**
 * Radical para a segunda tentativa, quando a palavra inteira não aparece:
 * "desfiliar" acha "desfiliação", "cancelar" acha "cancelamento", "votar"
 * acha "votação". Só a partir de cinco letras.
 */
function radical(termo: string): string | null {
  return termo.length >= 5 ? termo.slice(0, Math.max(4, termo.length - 3)) : null
}

type Acerto = { titulo: boolean; area: boolean; resumo: boolean; vezes: number }

function procurar(ix: Indexado, forma: string): Acerto | null {
  const a: Acerto = {
    titulo: ix.titulo.includes(forma),
    area: ix.area.includes(forma),
    resumo: ix.resumo.includes(forma),
    vezes: ix.corpo ? ocorrencias(ix.corpo.norm, forma, 3) : 0,
  }
  return a.titulo || a.area || a.resumo || a.vezes > 0 ? a : null
}

/**
 * Todos os termos precisam aparecer em algum lugar do artigo (inteiros ou,
 * valendo metade, pelo radical). Ordem: acerto no título > área > resumo >
 * corpo (A111); empate fica na ordem do manual.
 */
function buscar(indice: Indexado[], termos: string[]): Resultado[] {
  if (termos.length === 0) return []
  const achados: Resultado[] = []
  for (const ix of indice) {
    let pontos = 0
    let soNoCorpo: string | null = null
    const marcas: string[] = []
    let falhou = false
    for (const t of termos) {
      let forma = t
      let peso = 1
      let acerto = procurar(ix, t)
      const r = radical(t)
      if (!acerto && r) {
        acerto = procurar(ix, r)
        forma = r
        peso = 0.5
      }
      if (!acerto) {
        falhou = true
        break
      }
      marcas.push(forma)
      pontos += peso * ((acerto.titulo ? 8 : 0) + (acerto.area ? 4 : 0) + (acerto.resumo ? 3 : 0) + acerto.vezes)
      if (!acerto.titulo && !acerto.resumo && acerto.vezes > 0 && soNoCorpo === null) soNoCorpo = forma
    }
    if (falhou) continue
    const trecho = soNoCorpo && ix.corpo && ix.item.texto ? recortar(ix.corpo, ix.item.texto, soNoCorpo) : null
    achados.push({ item: ix.item, trecho, pontos, marcas })
  }
  // sort estável: no empate, a ordem do manual.
  return achados.sort((a, b) => b.pontos - a.pontos)
}

/** Destaca os termos dentro de um texto curto (título, resumo ou trecho). */
function Destaque({ texto, termos }: { texto: string; termos: string[] }) {
  const { norm, origem } = indexar(texto)
  const marcado = new Array<boolean>(texto.length).fill(false)
  for (const t of termos) {
    for (let i = norm.indexOf(t); i !== -1; i = norm.indexOf(t, i + t.length)) {
      for (let k = i; k < i + t.length; k++) marcado[origem[k]] = true
    }
  }
  const partes: { texto: string; marca: boolean }[] = []
  for (let i = 0; i < texto.length; i++) {
    const ultima = partes[partes.length - 1]
    if (ultima && ultima.marca === marcado[i]) ultima.texto += texto[i]
    else partes.push({ texto: texto[i], marca: marcado[i] })
  }
  return (
    <>
      {partes.map((p, i) =>
        p.marca ? (
          <mark key={i} className="bg-primary/15 text-foreground rounded-sm">
            {p.texto}
          </mark>
        ) : (
          <Fragment key={i}>{p.texto}</Fragment>
        )
      )}
    </>
  )
}

/**
 * Busca da ajuda (A111/A115): procura no título, na área, no resumo e — quando
 * o item traz `texto` — no corpo do artigo, mostrando o trecho em que a
 * palavra aparece. É um combobox: setas percorrem os resultados, Enter abre,
 * Esc fecha, e clicar fora ou sair com Tab também fecha. Com `saida`, a lista
 * termina sempre num caminho para quem não achou a resposta.
 */
export function AjudaBusca({
  itens,
  rotulo = "manual",
  saida,
  className,
  classePainel,
}: {
  itens: ItemBusca[]
  /** "manual" no painel e no hotel, "ajuda" no portal (A170): vai no placeholder. */
  rotulo?: keyof typeof ONDE
  saida?: SaidaBusca
  className?: string
  /** Largura do painel de resultados, quando o campo é mais estreito que eles. */
  classePainel?: string
}) {
  const router = useRouter()
  const id = useId()
  const listaId = `${id}-resultados`
  const opcaoId = (i: number) => `${id}-opcao-${i}`
  const onde = ONDE[rotulo]
  const caixa = useRef<HTMLDivElement>(null)
  const [termo, setTermo] = useState("")
  const [aberta, setAberta] = useState(false)
  const [ativo, setAtivo] = useState(-1)

  const indice = useMemo<Indexado[]>(
    () =>
      itens.map((item) => ({
        item,
        titulo: normalizar(item.titulo),
        resumo: normalizar(item.resumo),
        area: normalizar(item.area),
        corpo: item.texto ? indexar(item.texto) : null,
      })),
    [itens]
  )
  // Letra solta acharia tudo: só contam termos de duas letras ou mais.
  const termos = useMemo(() => normalizar(termo).split(/\s+/).filter((t) => t.length >= 2), [termo])
  const resultados = useMemo(() => buscar(indice, termos).slice(0, MAX_RESULTADOS), [indice, termos])

  // A saída para o Atendimento entra como última opção (dá para chegar nela pelas setas).
  const comSaida = saida && termos.length > 0 ? saida : null
  const opcoes = [...resultados.map((r) => r.item.href), ...(comSaida ? [comSaida.href] : [])]
  const mostrar = aberta && termo.trim().length > 0
  const ativoSeguro = ativo < opcoes.length ? ativo : -1

  // Clique (ou toque) fora fecha a lista.
  useEffect(() => {
    if (!mostrar) return
    const aoTocar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberta(false)
    }
    document.addEventListener("pointerdown", aoTocar)
    return () => document.removeEventListener("pointerdown", aoTocar)
  }, [mostrar])

  // O resultado ativo pelas setas fica sempre à vista na lista.
  useEffect(() => {
    if (ativoSeguro >= 0) document.getElementById(`${id}-opcao-${ativoSeguro}`)?.scrollIntoView({ block: "nearest" })
  }, [ativoSeguro, id])

  function fechar() {
    setAberta(false)
    setAtivo(-1)
  }

  /** Ao escolher um resultado, a busca se recolhe e esvazia: ela continua na tela do artigo. */
  function escolher() {
    fechar()
    setTermo("")
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!termo.trim() || opcoes.length === 0) return
      e.preventDefault()
      if (!mostrar) {
        setAberta(true)
        setAtivo(e.key === "ArrowDown" ? 0 : opcoes.length - 1)
        return
      }
      const passo = e.key === "ArrowDown" ? 1 : -1
      // Circular: do último volta ao primeiro, e vice-versa.
      setAtivo(
        ativoSeguro === -1
          ? passo === 1
            ? 0
            : opcoes.length - 1
          : (ativoSeguro + passo + opcoes.length) % opcoes.length
      )
    } else if (e.key === "Enter") {
      // Sem nada marcado pelas setas, Enter abre o primeiro resultado — e, sem
      // resultado, não faz nada (não leva ao Atendimento de surpresa).
      if (!mostrar || (ativoSeguro === -1 && resultados.length === 0)) return
      e.preventDefault()
      const destino = opcoes[ativoSeguro >= 0 ? ativoSeguro : 0]
      escolher()
      router.push(destino)
    } else if (e.key === "Escape") {
      // Primeiro Esc fecha a lista; o segundo limpa o campo.
      if (mostrar) {
        e.preventDefault()
        fechar()
      } else if (termo) {
        e.preventDefault()
        setTermo("")
      }
    }
  }

  const contagem = !mostrar
    ? ""
    : resultados.length === 0
      ? "Nenhum artigo encontrado."
      : `${resultados.length} ${resultados.length === 1 ? "artigo encontrado" : "artigos encontrados"}. Use as setas para escolher.`

  return (
    <div
      ref={caixa}
      className={cn("relative", className)}
      onBlur={(e) => {
        // Saiu com Tab para fora da busca: a lista não fica aberta sobre a página.
        if (!caixa.current?.contains(e.relatedTarget as Node | null)) fechar()
      }}
    >
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
        <Input
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value)
            setAberta(true)
            setAtivo(-1)
          }}
          onFocus={() => setAberta(true)}
          // Fechada com Esc, a lista volta ao tocar de novo no campo (o foco não mudou).
          onClick={() => setAberta(true)}
          onKeyDown={aoTeclar}
          placeholder={`Buscar ${onde}…`}
          aria-label={`Buscar ${onde}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrar}
          aria-controls={mostrar ? listaId : undefined}
          aria-activedescendant={mostrar && ativoSeguro >= 0 ? opcaoId(ativoSeguro) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          className="pl-9"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {contagem}
      </p>

      {mostrar && (
        <div
          // O foco fica no campo: sem isto, tocar num resultado tiraria o foco
          // dele antes do clique (o Safari não foca links) e a lista sumiria.
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "bg-popover text-popover-foreground absolute z-(--z-dropdown) mt-2 w-full overflow-hidden rounded-lg border shadow-md",
            classePainel
          )}
        >
          <ul id={listaId} role="listbox" aria-label="Resultados da busca" className="max-h-[min(26rem,60svh)] overflow-y-auto">
            {resultados.length === 0 && (
              <li role="presentation" className="text-muted-foreground px-3 py-3 text-sm">
                {termos.length === 0
                  ? "Digite pelo menos duas letras."
                  : `Nenhum artigo fala de “${termo.trim()}”. Tente outra palavra${saida ? " ou pergunte ao sindicato" : ""}.`}
              </li>
            )}
            {resultados.map((r, i) => (
              <li key={r.item.href} role="presentation" className="border-t first:border-t-0">
                <Link
                  id={opcaoId(i)}
                  href={r.item.href}
                  role="option"
                  aria-selected={i === ativoSeguro}
                  tabIndex={-1}
                  onClick={escolher}
                  onMouseMove={() => i !== ativoSeguro && setAtivo(i)}
                  className={cn(
                    "flex min-h-11 items-start gap-2 px-3 py-2",
                    i === ativoSeguro ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <ArrowUpRight className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      <Destaque texto={r.item.titulo} termos={r.marcas} />
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {r.item.area}
                      {" · "}
                      <Destaque texto={r.trecho ?? r.item.resumo} termos={r.marcas} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {comSaida && (
              <li role="presentation" className="bg-muted/40 border-t">
                <Link
                  id={opcaoId(resultados.length)}
                  href={comSaida.href}
                  role="option"
                  aria-selected={resultados.length === ativoSeguro}
                  tabIndex={-1}
                  onClick={escolher}
                  onMouseMove={() => resultados.length !== ativoSeguro && setAtivo(resultados.length)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 px-3 py-2 text-sm",
                    resultados.length === ativoSeguro ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <MessageSquarePlus className="text-primary size-4 shrink-0" aria-hidden />
                  <span>
                    {resultados.length === 0 ? "A ajuda não respondeu? " : "Não achou o que procurava? "}
                    <span className="text-primary font-medium">{comSaida.rotulo}</span>
                  </span>
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
