import { Label } from "@/components/ui/label"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * "Projeto (se houver)": o pedido (diária, viagem) do projeto entra no gasto
 * dele. Sem projetos em andamento, não aparece.
 */
export function CampoProjeto({ projetos, className }: { projetos: { id: string; titulo: string }[]; className?: string }) {
  if (projetos.length === 0) return null
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor="projeto_id">Projeto (se houver)</Label>
      <select id="projeto_id" name="projeto_id" defaultValue="" className={SELECT}>
        <option value="">Nenhum</option>
        {projetos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.titulo}
          </option>
        ))}
      </select>
    </div>
  )
}
