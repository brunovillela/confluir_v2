"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Enquanto a IA lê a lista em segundo plano, a página se recarrega a cada
 * poucos segundos e mostra o andamento; quando a prévia fica pronta (ou a
 * leitura falha), o servidor já devolve a tela nova e isto some.
 */
export function AcompanharLeitura({ progresso }: { progresso: { lidos: number; total: number } | null }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(id)
  }, [router])

  const pct = progresso && progresso.total > 0 ? Math.round((progresso.lidos / progresso.total) * 100) : null
  return (
    <div className="grid gap-3 rounded-lg border p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="text-primary size-4 animate-spin" />
        A IA está lendo a lista…
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-[width] duration-500"
          style={{ width: `${pct ?? 5}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {progresso && progresso.total > 1
          ? `${progresso.lidos} de ${progresso.total} trechos lidos.`
          : "Preparando a leitura."}{" "}
        Listas grandes levam alguns minutos. Pode sair desta tela: a lista fica em Listas enviadas e a prévia
        aparece aqui quando terminar.
      </p>
    </div>
  )
}
