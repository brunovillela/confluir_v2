"use client"

import { useState } from "react"

const CLS_SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Departamento + Centro de custo encadeados: ao escolher um departamento, o
 * select de centro de custo passa a listar só os centros daquele departamento
 * (e o centro é limpo se não pertencer ao novo departamento).
 */
export function FiltroDeptoCentro({
  departamentos,
  centros,
  defaultDepartamento,
  defaultCentro,
}: {
  departamentos: { id: string; nome: string }[]
  centros: { id: string; nome: string; departamentoId: string | null }[]
  defaultDepartamento: string
  defaultCentro: string
}) {
  const [depto, setDepto] = useState(defaultDepartamento)
  const [centro, setCentro] = useState(defaultCentro)

  const centrosVisiveis = depto
    ? centros.filter((c) => c.departamentoId === depto)
    : centros
  const centroValido = centrosVisiveis.some((c) => c.id === centro) ? centro : ""

  return (
    <>
      <div className="grid gap-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          Departamento
        </span>
        <select
          name="departamento"
          value={depto}
          onChange={(e) => {
            setDepto(e.target.value)
            setCentro("")
          }}
          aria-label="Departamento"
          className={CLS_SELECT}
        >
          <option value="">Todos</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          Centro de custo
        </span>
        <select
          name="centroCusto"
          value={centroValido}
          onChange={(e) => setCentro(e.target.value)}
          aria-label="Centro de custo"
          className={CLS_SELECT}
        >
          <option value="">
            {depto ? "Todos do departamento" : "Todos"}
          </option>
          {centrosVisiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
