"use client"

import { useState } from "react"
import { ChevronDown, Sparkles } from "lucide-react"

/**
 * Bloco do resumo de notícias por IA no dashboard. Nasce mostrando o título e
 * as primeiras linhas do resumo; "Ver mais" expande o texto completo.
 */
export function ResumoIAPainel({
  titulo,
  resumo,
  atualizado,
}: {
  titulo: string
  resumo: string
  atualizado: string
}) {
  const [aberto, setAberto] = useState(false)
  const longo = resumo.length > 240

  return (
    <div className="border-primary/30 bg-primary/5 mb-4 rounded-lg border p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="text-primary size-3.5" />
        <span className="text-primary text-xs font-medium">Resumo por IA</span>
      </div>
      <p className="mt-1.5 font-semibold text-balance">{titulo}</p>
      <p
        className={`text-muted-foreground mt-1 text-sm whitespace-pre-wrap ${
          longo && !aberto ? "line-clamp-3" : ""
        }`}
      >
        {resumo}
      </p>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          {aberto ? "Ver menos" : "Ver mais"}
          <ChevronDown
            className={`size-3.5 transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </button>
      )}
      <p className="text-muted-foreground mt-2 text-xs">
        Atualizado em {atualizado}
      </p>
    </div>
  )
}
