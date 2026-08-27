/**
 * Donut (pizza com furo) desenhado com `conic-gradient` — sem dependência de
 * biblioteca de gráficos. As cores vêm em `fatias[].cor` (use tokens
 * theme-aware, ex.: `var(--chart-marca-1)`). O furo usa `bg-card`, então o
 * donut deve ficar dentro de um Card. Componente puro (server-safe).
 */
export function Donut({
  fatias,
  centroValor,
  centroRotulo,
  className = "size-32",
}: {
  fatias: { cor: string; valor: number }[]
  centroValor: string
  centroRotulo: string
  className?: string
}) {
  const soma = fatias.reduce((s, f) => s + f.valor, 0)
  let acc = 0
  const stops =
    soma > 0
      ? fatias
          .filter((f) => f.valor > 0)
          .map((f) => {
            const ini = (acc / soma) * 100
            acc += f.valor
            const fim = (acc / soma) * 100
            return `${f.cor} ${ini}% ${fim}%`
          })
          .join(", ")
      : "var(--muted) 0% 100%"
  return (
    <div className={`relative mx-auto ${className}`}>
      <div
        className="size-full rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
      />
      <div className="bg-card absolute inset-[24%] flex flex-col items-center justify-center rounded-full text-center">
        <span className="text-lg leading-none font-semibold tabular-nums">
          {centroValor}
        </span>
        <span className="text-muted-foreground mt-0.5 text-[10px] leading-none">
          {centroRotulo}
        </span>
      </div>
    </div>
  )
}
