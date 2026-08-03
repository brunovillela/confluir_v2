"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Search } from "lucide-react"

import { Input } from "@/components/ui/input"

export type ItemBusca = {
  titulo: string
  resumo: string
  area: string
  href: string
}

/** Normaliza para busca acento-insensível. */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export function AjudaBusca({ itens }: { itens: ItemBusca[] }) {
  const [termo, setTermo] = useState("")

  const resultados = useMemo(() => {
    const t = norm(termo.trim())
    if (!t) return []
    return itens
      .filter(
        (i) =>
          norm(i.titulo).includes(t) ||
          norm(i.resumo).includes(t) ||
          norm(i.area).includes(t)
      )
      .slice(0, 8)
  }, [termo, itens])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar no manual…"
          className="pl-9"
          aria-label="Buscar no manual"
        />
      </div>

      {termo.trim() && (
        <div className="bg-card absolute z-10 mt-2 w-full overflow-hidden rounded-lg border shadow-md">
          {resultados.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              Nenhum artigo encontrado.
            </p>
          ) : (
            <ul className="divide-y">
              {resultados.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="hover:bg-muted/60 flex items-start gap-2 px-3 py-2"
                  >
                    <ArrowUpRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {r.titulo}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {r.area} · {r.resumo}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
