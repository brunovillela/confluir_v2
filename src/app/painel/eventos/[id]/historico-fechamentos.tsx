import { History } from "lucide-react"

import type { FechamentoInscricoes } from "@/lib/db/eventos"
import { formatarDataHora } from "@/lib/formato"

/**
 * Histórico dos fechamentos e reaberturas à mão das inscrições (26/11/2026).
 * O evento só guarda o último fechamento; aqui aparece o vaivém, do mais
 * recente para o mais antigo. Recolhido: abre no clique, sem JavaScript.
 */
export function HistoricoFechamentos({ itens }: { itens: FechamentoInscricoes[] }) {
  if (itens.length === 0) return null
  return (
    <details className="text-sm">
      <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5">
        <History className="size-4" />
        Histórico das inscrições ({itens.length === 1 ? "1 registro" : `${itens.length} registros`})
      </summary>
      <ol className="mt-2 grid gap-1.5 border-l pl-4">
        {itens.map((f) => (
          <li key={f.id}>
            <span className="font-medium">
              {f.acao === "fechou" ? "Fechadas" : "Reabertas"}
            </span>{" "}
            em {formatarDataHora(f.em)}
            {f.usuarioNome ? ` por ${f.usuarioNome}` : ""}
            {f.mensagem && (
              <span className="text-muted-foreground"> — recado: &ldquo;{f.mensagem}&rdquo;</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}
