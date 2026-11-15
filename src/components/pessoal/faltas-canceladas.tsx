import { History } from "lucide-react"

import { formatarData, formatarDataHora } from "@/lib/formato"

type Cancelada = {
  id: string
  data: string | null
  tipo: string | null
  situacao: "aguardando" | "autorizada" | "recusada"
  canceladaEm: string | null
  canceladaPorId: string | null
  canceladaPorNome: string | null
}

/**
 * Histórico das faltas justificadas canceladas (15/11/2026). A cancelada não
 * conta no limite, no ponto nem na folha; aparece aqui só para consulta.
 */
export function FaltasCanceladas({
  canceladas,
  funcionarioId,
  doProprio = false,
  className = "",
}: {
  canceladas: Cancelada[]
  funcionarioId: string | null
  /** No Meu perfil, "por você" em vez do nome. */
  doProprio?: boolean
  className?: string
}) {
  if (canceladas.length === 0) return null
  const quem = (f: Cancelada) => {
    if (f.canceladaPorId && f.canceladaPorId === funcionarioId) return doProprio ? "por você" : "pelo funcionário"
    if (f.canceladaPorNome) return `por ${f.canceladaPorNome}`
    return "pelo departamento de pessoal"
  }
  return (
    <div className={`text-muted-foreground grid gap-1 text-xs ${className}`}>
      <p className="flex items-center gap-1 font-medium">
        <History className="size-3.5" />
        {canceladas.length === 1 ? "1 falta cancelada" : `${canceladas.length} faltas canceladas`} (não contam no limite)
      </p>
      <ul className="grid gap-0.5 pl-5">
        {canceladas.map((f) => (
          <li key={f.id} className="list-disc">
            <span className="line-through">{formatarData(f.data)}</span>
            {f.tipo ? ` · ${f.tipo}` : ""} · {f.situacao === "autorizada" ? "estava autorizada" : "aguardava autorização"} ·
            cancelada em {formatarDataHora(f.canceladaEm)} {quem(f)}
          </li>
        ))}
      </ul>
    </div>
  )
}
