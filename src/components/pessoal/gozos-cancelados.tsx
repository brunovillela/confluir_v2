import { History } from "lucide-react"

import { formatarData, formatarDataHora } from "@/lib/formato"

type Cancelado = {
  id: string
  inicio: string | null
  termino: string | null
  dias: number | null
  autorizado: boolean | null
  cancelado_em: string | null
  cancelado_por: string | null
  canceladoPorNome: string | null
}

/**
 * Histórico dos gozos cancelados de um período (14/11/2026). O cancelado não
 * conta no saldo nem nas 3 partes; aparece aqui só para consulta.
 */
export function GozosCancelados({
  cancelados,
  funcionarioId,
  /** No Meu perfil, "por você" em vez do nome. */
  doProprio = false,
  className = "",
}: {
  cancelados: Cancelado[]
  funcionarioId: string | null
  doProprio?: boolean
  className?: string
}) {
  if (cancelados.length === 0) return null
  const quem = (g: Cancelado) => {
    if (g.cancelado_por && g.cancelado_por === funcionarioId) return doProprio ? "por você" : "pelo funcionário"
    if (g.canceladoPorNome) return `por ${g.canceladoPorNome}`
    return "pelo departamento de pessoal"
  }
  return (
    <div className={`text-muted-foreground grid gap-1 text-xs ${className}`}>
      <p className="flex items-center gap-1 font-medium">
        <History className="size-3.5" />
        {cancelados.length === 1 ? "1 gozo cancelado" : `${cancelados.length} gozos cancelados`} (não contam no saldo)
      </p>
      <ul className="grid gap-0.5 pl-5">
        {cancelados.map((g) => (
          <li key={g.id} className="list-disc">
            <span className="line-through">
              {formatarData(g.inicio)} a {formatarData(g.termino)}
            </span>{" "}
            · {g.dias ?? "?"} dias · {g.autorizado === true ? "estava autorizado" : "aguardava autorização"} · cancelado em{" "}
            {formatarDataHora(g.cancelado_em)} {quem(g)}
          </li>
        ))}
      </ul>
    </div>
  )
}
