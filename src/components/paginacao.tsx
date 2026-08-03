"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { OPCOES_POR_PAGINA } from "@/lib/paginacao"

/**
 * Rodapé de paginação dirigido por URL (?pagina= / ?porPagina=, com prefixo
 * opcional para páginas com mais de uma tabela). Preserva os demais filtros
 * da querystring; trocar a quantidade por página volta à página 1.
 */
export function Paginacao({
  total,
  pagina,
  totalPaginas,
  porPagina,
  padrao,
  prefixo = "",
}: {
  total: number
  pagina: number
  totalPaginas: number
  porPagina: number
  /** Itens por página quando a URL não define (10 ou 30, conforme a página). */
  padrao: number
  prefixo?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const chave = (nome: string) =>
    prefixo ? `${prefixo}${nome[0].toUpperCase()}${nome.slice(1)}` : nome

  function navegar(mudancas: { pagina?: number; porPagina?: number }) {
    const q = new URLSearchParams(searchParams)
    const novaPagina = mudancas.pagina ?? 1
    if (novaPagina > 1) q.set(chave("pagina"), String(novaPagina))
    else q.delete(chave("pagina"))
    const novoPorPagina = mudancas.porPagina ?? porPagina
    if (novoPorPagina !== padrao) q.set(chave("porPagina"), String(novoPorPagina))
    else q.delete(chave("porPagina"))
    const query = q.toString()
    router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false })
  }

  if (total === 0) return null

  const de = (pagina - 1) * porPagina + 1
  const ate = Math.min(pagina * porPagina, total)

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="tabular-nums">
        {de.toLocaleString("pt-BR")}–{ate.toLocaleString("pt-BR")} de{" "}
        {total.toLocaleString("pt-BR")}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Por página</span>
          <select
            value={porPagina}
            onChange={(e) => navegar({ porPagina: Number(e.target.value) })}
            aria-label="Itens por página"
            className="border-input bg-background text-foreground h-8 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
          >
            {OPCOES_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={pagina <= 1}
          onClick={() => navegar({ pagina: pagina - 1 })}
          aria-label="Página anterior"
        >
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          {pagina.toLocaleString("pt-BR")} / {totalPaginas.toLocaleString("pt-BR")}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={pagina >= totalPaginas}
          onClick={() => navegar({ pagina: pagina + 1 })}
          aria-label="Próxima página"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
