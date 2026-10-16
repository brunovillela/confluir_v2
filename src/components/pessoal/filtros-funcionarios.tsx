import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectNativo } from "@/components/ui/select-nativo"
import { SITUACOES_FUNCIONARIO, type FiltrosArea } from "@/lib/pessoal-area"

/**
 * Barra de filtros da lista de funcionários de uma área: busca (nome,
 * matrícula, cargo, departamento — sem acento), situação, departamento e os
 * filtros próprios da área (`extras`). Formulário GET: a URL guarda o recorte.
 */
export function FiltrosFuncionarios({
  filtros,
  departamentos,
  extras,
  ocultos = {},
}: {
  filtros: FiltrosArea
  departamentos: string[]
  /** Selects próprios da área (já com `name`). */
  extras?: React.ReactNode
  /** Parâmetros que precisam sobreviver ao filtrar (ex.: aba, ano). */
  ocultos?: Record<string, string | undefined>
}) {
  return (
    <form method="GET" className="flex flex-wrap items-center gap-2">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input type="hidden" name="ordem" value={filtros.ordem} />
      <input type="hidden" name="dir" value={filtros.dir} />
      <Input
        name="busca"
        defaultValue={filtros.busca}
        placeholder="Nome, matrícula, cargo…"
        className="h-9 w-full sm:max-w-60"
        aria-label="Buscar funcionário"
      />
      <SelectNativo name="situacao" defaultValue={filtros.situacao} aria-label="Situação" className="h-9 w-auto">
        {SITUACOES_FUNCIONARIO.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </SelectNativo>
      {departamentos.length > 1 && (
        <SelectNativo
          name="departamento"
          defaultValue={filtros.departamento}
          aria-label="Departamento"
          className="h-9 w-auto max-w-56"
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectNativo>
      )}
      {extras}
      <Button type="submit" variant="secondary" size="sm">
        Filtrar
      </Button>
    </form>
  )
}
