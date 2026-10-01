import type { MesDistribuicao } from "@/lib/ferias-painel"

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

const COR_AUTORIZADOS = "var(--chart-marca-1)"
const COR_AGUARDANDO = "var(--chart-marca-2)"

/**
 * Dias de férias por mês — colunas empilhadas (autorizados embaixo,
 * aguardando autorização em cima). Server component: o tooltip é CSS
 * (hover/foco), sem JavaScript. O mês atual ganha o rótulo em destaque.
 */
export function DistribuicaoMensal({
  meses,
  mesAtual,
}: {
  meses: MesDistribuicao[]
  /** 0–11 quando o ano exibido é o atual; null nos demais. */
  mesAtual: number | null
}) {
  const max = Math.max(1, ...meses.map((m) => m.autorizados + m.aguardando))
  const temAguardando = meses.some((m) => m.aguardando > 0)

  return (
    <div className="grid gap-3">
      {temAguardando && (
        <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COR_AUTORIZADOS }} />
            Autorizados
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COR_AGUARDANDO }} />
            Aguardando autorização
          </span>
        </div>
      )}

      <div className="flex h-52 items-end gap-1 sm:gap-2" role="img" aria-label="Dias de férias por mês">
        {meses.map((m) => {
          const total = m.autorizados + m.aguardando
          return (
            <div
              key={m.mes}
              tabIndex={0}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center gap-1 outline-none"
            >
              {/* A altura é % da área das barras — os rótulos ficam fora. */}
              <div className="flex w-full flex-1 flex-col items-center justify-end">
                <span className="text-muted-foreground h-4 text-[10px] leading-4 tabular-nums">
                  {total || ""}
                </span>
                <div
                  className="flex w-full max-w-10 flex-col gap-[2px] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ height: `calc((100% - 1rem) * ${total / max})`, opacity: 0.92 }}
                >
                  {m.aguardando > 0 && (
                    <div
                      className="w-full rounded-t-[4px]"
                      style={{ flexGrow: m.aguardando, background: COR_AGUARDANDO, minHeight: 2 }}
                    />
                  )}
                  {m.autorizados > 0 && (
                    <div
                      className={m.aguardando > 0 ? "w-full" : "w-full rounded-t-[4px]"}
                      style={{ flexGrow: m.autorizados, background: COR_AUTORIZADOS, minHeight: 2 }}
                    />
                  )}
                </div>
              </div>
              <span
                className={
                  m.mes === mesAtual
                    ? "text-foreground h-4 text-[10px] leading-4 font-semibold"
                    : "text-muted-foreground h-4 text-[10px] leading-4"
                }
              >
                {MESES[m.mes]}
              </span>

              <div
                className={`bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max max-w-52 rounded-md border px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus-visible:block ${
                  // Nas pontas o balão encosta na borda em vez de centrar e vazar.
                  m.mes < 2 ? "left-0" : m.mes > 9 ? "right-0" : "left-1/2 -translate-x-1/2"
                }`}
              >
                <p className="font-medium">{MESES_LONGOS[m.mes]}</p>
                {total === 0 ? (
                  <p className="text-muted-foreground">Ninguém de férias</p>
                ) : (
                  <>
                    <p className="tabular-nums">
                      {total} dia{total === 1 ? "" : "s"} · {m.pessoas} pessoa{m.pessoas === 1 ? "" : "s"}
                    </p>
                    {m.aguardando > 0 && (
                      <p className="text-muted-foreground tabular-nums">
                        {m.aguardando} aguardando autorização
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <details className="text-xs">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
          Ver em tabela
        </summary>
        <table className="mt-2 w-full max-w-md text-left tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Mês</th>
              <th className="py-1 text-right font-normal">Autorizados</th>
              <th className="py-1 text-right font-normal">Aguardando</th>
              <th className="py-1 text-right font-normal">Pessoas</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t">
                <td className="py-1">{MESES_LONGOS[m.mes]}</td>
                <td className="py-1 text-right">{m.autorizados}</td>
                <td className="py-1 text-right">{m.aguardando}</td>
                <td className="py-1 text-right">{m.pessoas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
