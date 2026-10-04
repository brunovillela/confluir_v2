"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CornerDownLeft, Loader2, Search } from "lucide-react"

import { ICONES_MODULOS } from "@/components/layout/icones-modulos"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { GrupoBusca, ResultadoBusca } from "@/lib/db/busca-global"
import { semAcento } from "@/lib/texto"
import { cn } from "@/lib/utils"

/** Página do menu que a pessoa pode abrir (vem do layout, já filtrada por permissão). */
export type PaginaBusca = { titulo: string; href: string; descricao: string; icone: string }

type Item = ResultadoBusca & { grupo: string; icone?: string }

const MIN = 2

/**
 * BUSCA GLOBAL (onda 2, U4): Ctrl+K (ou ⌘K) abre a paleta; o termo procura
 * páginas do menu no próprio navegador e, a partir de 2 letras, consulta
 * /api/painel/busca para filiados, fornecedores, usuários, ordens, contratos
 * e veículos. Setas navegam, Enter abre, Esc fecha.
 */
export function BuscaGlobal({ paginas }: { paginas: PaginaBusca[] }) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [termo, setTermo] = useState("")
  const [grupos, setGrupos] = useState<GrupoBusca[]>([])
  const [carregando, setCarregando] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  // Atalho global.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setAberta((v) => !v)
      }
    }
    window.addEventListener("keydown", aoTeclar)
    return () => window.removeEventListener("keydown", aoTeclar)
  }, [])

  // Consulta ao servidor com debounce; termos curtos limpam.
  useEffect(() => {
    if (!aberta) return
    const t = termo.trim()
    // Termo curto: a limpeza dos resultados já aconteceu no onChange.
    if (t.length < MIN) return
    const controle = new AbortController()
    const timer = window.setTimeout(async () => {
      setCarregando(true)
      try {
        const r = await fetch(`/api/painel/busca?q=${encodeURIComponent(t)}`, { signal: controle.signal, cache: "no-store" })
        if (r.ok) {
          const dados = (await r.json()) as { grupos?: GrupoBusca[] }
          setGrupos(dados.grupos ?? [])
        }
      } catch {
        // abortado ou sem rede: mantém o que tinha
      } finally {
        if (!controle.signal.aborted) setCarregando(false)
      }
    }, 250)
    return () => {
      controle.abort()
      window.clearTimeout(timer)
    }
  }, [termo, aberta])

  const paginasCasadas = useMemo(() => {
    const t = semAcento(termo)
    if (!t) return paginas.slice(0, 8)
    return paginas.filter((p) => semAcento(p.titulo).includes(t) || semAcento(p.descricao).includes(t)).slice(0, 8)
  }, [paginas, termo])

  const itens = useMemo<Item[]>(() => {
    const lista: Item[] = paginasCasadas.map((p) => ({ titulo: p.titulo, detalhe: p.descricao, href: p.href, grupo: "Páginas", icone: p.icone }))
    for (const g of grupos) {
      for (const r of g.itens) lista.push({ ...r, grupo: g.titulo })
      if (g.verTodos) lista.push({ titulo: `Ver todos em ${g.titulo}`, detalhe: null, href: g.verTodos, grupo: g.titulo })
    }
    return lista
  }, [paginasCasadas, grupos])

  // Índice ativo sempre dentro da lista.
  const ativoSeguro = Math.min(ativo, Math.max(itens.length - 1, 0))

  const abrir = useCallback(
    (item: Item | undefined) => {
      if (!item) return
      setAberta(false)
      router.push(item.href)
    },
    [router]
  )

  const aoAbrirMudar = (v: boolean) => {
    setAberta(v)
    if (v) {
      setTermo("")
      setGrupos([])
      setAtivo(0)
    }
  }

  // Mantém o item ativo visível ao navegar pelas setas.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${ativoSeguro}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [ativoSeguro])

  const aoTeclarNoCampo = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setAtivo((i) => Math.min(i + 1, itens.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setAtivo((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      abrir(itens[ativoSeguro])
    }
  }

  // Agrupa para exibir cabeçalhos, mantendo o índice global de cada item.
  const blocos = useMemo(() => {
    const porGrupo = new Map<string, { item: Item; indice: number }[]>()
    itens.forEach((item, indice) => {
      const lista = porGrupo.get(item.grupo) ?? []
      lista.push({ item, indice })
      porGrupo.set(item.grupo, lista)
    })
    return [...porGrupo.entries()]
  }, [itens])

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => aoAbrirMudar(true)}
        aria-label="Buscar (Ctrl+K)"
        className="text-muted-foreground h-8 gap-2 px-2 font-normal sm:w-48 sm:justify-start"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="bg-muted text-muted-foreground ml-auto hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </Button>

      <Dialog open={aberta} onOpenChange={aoAbrirMudar}>
        <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Busca global</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            {carregando ? <Loader2 className="text-muted-foreground size-4 animate-spin" /> : <Search className="text-muted-foreground size-4" />}
            <input
              ref={inputRef}
              autoFocus
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value)
                setAtivo(0)
                if (e.target.value.trim().length < MIN) {
                  setGrupos([])
                  setCarregando(false)
                }
              }}
              onKeyDown={aoTeclarNoCampo}
              placeholder="Filiado, fornecedor, ordem, contrato, veículo, página…"
              aria-label="Termo da busca"
              className="h-12 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div ref={listaRef} className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Resultados">
            {itens.length === 0 && (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                {termo.trim().length < MIN ? "Digite para procurar." : carregando ? "Procurando…" : "Nada encontrado."}
              </p>
            )}
            {blocos.map(([grupo, lista]) => (
              <div key={grupo} className="mb-1">
                <p className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">{grupo}</p>
                {lista.map(({ item, indice }) => {
                  const Icone = item.icone ? ICONES_MODULOS[item.icone] : null
                  const verTodos = item.titulo.startsWith("Ver todos em ")
                  return (
                    <button
                      key={`${item.href}-${indice}`}
                      type="button"
                      role="option"
                      aria-selected={indice === ativoSeguro}
                      data-indice={indice}
                      onMouseEnter={() => setAtivo(indice)}
                      onClick={() => abrir(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                        indice === ativoSeguro ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                      )}
                    >
                      {Icone ? <Icone className="text-muted-foreground size-4 shrink-0" /> : verTodos ? <ArrowRight className="text-muted-foreground size-4 shrink-0" /> : <span className="size-4 shrink-0" />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", verTodos && "text-muted-foreground")}>{item.titulo}</span>
                        {item.detalhe && <span className="text-muted-foreground block truncate text-xs">{item.detalhe}</span>}
                      </span>
                      {indice === ativoSeguro && <CornerDownLeft className="text-muted-foreground size-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
