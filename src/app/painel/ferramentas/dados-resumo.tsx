import type { ReactNode } from "react"

/**
 * Peças das páginas de detalhe de Ferramentas (projeto, demanda, anomalia):
 * `Dado` é rótulo em cima e valor embaixo (para grades lado a lado); `Linha`
 * é rótulo à esquerda e valor à direita (para o cartão de resumo). Ambas vão
 * dentro de um `<dl>`.
 */
export function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  )
}

export function Linha({
  rotulo,
  alerta,
  children,
}: {
  rotulo: string
  alerta?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{rotulo}</dt>
      <dd className={`min-w-0 text-right font-medium tabular-nums ${alerta ? "text-destructive" : ""}`}>
        {children}
      </dd>
    </div>
  )
}
