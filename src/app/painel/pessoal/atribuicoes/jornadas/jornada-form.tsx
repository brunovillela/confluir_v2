"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DIAS_SEMANA,
  formatarHora,
  type JornadaDia,
} from "@/lib/pessoal-sst-constantes"

import { salvarJornada } from "../actions"

/** Editor da jornada semanal de UM funcionário (linha por dia da semana). */
export function JornadaForm({
  funcionarioId,
  dias,
}: {
  funcionarioId: string
  dias: JornadaDia[]
}) {
  const [estado, action, pend] = useActionState(salvarJornada, {})
  const porDia = new Map(dias.map((d) => [d.dia_semana, d]))

  const valor = (h: string | null) => {
    const f = formatarHora(h)
    return f === "—" ? "" : f
  }

  return (
    <form action={action} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="funcionario_id" value={funcionarioId} />
      <div className="grid gap-2">
        {DIAS_SEMANA.map((d) => {
          const j = porDia.get(d.valor)
          return (
            <div key={d.valor} className="flex items-center gap-2">
              <span className="w-32 text-sm">{d.rotulo}</span>
              <Input
                type="time"
                name={`inicio_${d.valor}`}
                defaultValue={valor(j?.hora_inicio ?? null)}
                className="w-32"
                aria-label={`Início ${d.rotulo}`}
              />
              <span className="text-muted-foreground text-xs">às</span>
              <Input
                type="time"
                name={`fim_${d.valor}`}
                defaultValue={valor(j?.hora_fim ?? null)}
                className="w-32"
                aria-label={`Fim ${d.rotulo}`}
              />
            </div>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        Dia sem os dois horários preenchidos = sem expediente. A jornada
        alimenta o % de ocupação nos relatórios e o alerta de acesso fora do
        horário de trabalho.
      </p>
      <div>
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Salvar jornada
        </Button>
      </div>
    </form>
  )
}
