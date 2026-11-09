"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DIAS_SEMANA,
  formatarHora,
  type JornadaDia,
} from "@/lib/pessoal-sst-constantes"

import { excluirJornadaModelo, salvarJornadaModelo } from "../actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Cria ou edita uma jornada da entidade (nome + horário de cada dia). */
export function JornadaForm({
  id,
  nome,
  observacao,
  dias,
  vinculados,
}: {
  id?: string
  nome?: string
  observacao?: string | null
  dias: JornadaDia[]
  /** Quantos funcionários seguem esta jornada (aviso ao salvar). */
  vinculados: number
}) {
  const [estado, action, pend] = useActionState(salvarJornadaModelo, {})
  const envio = useEnvioFormulario(action, estado)
  const porDia = new Map(dias.map((d) => [d.dia_semana, d]))

  const valor = (h: string | null) => {
    const f = formatarHora(h)
    return f === "—" ? "" : f
  }

  return (
    <form action={action} {...envio} className="grid gap-4">
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
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="jornada-nome">Nome</Label>
          <Input
            id="jornada-nome"
            name="nome"
            defaultValue={nome ?? ""}
            placeholder="Ex.: Administrativo 8h às 17h"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="jornada-obs">Observação (opcional)</Label>
          <Textarea
            id="jornada-obs"
            name="observacao"
            defaultValue={observacao ?? ""}
            rows={1}
            placeholder="Ex.: cláusula do acordo que define o horário"
          />
        </div>
      </div>
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
        Dia sem os dois horários = sem expediente.
        {vinculados > 0 &&
          ` A alteração vale para ${vinculados === 1 ? "o funcionário vinculado" : `os ${vinculados} funcionários vinculados`} e entra no movimento da folha.`}
      </p>
      <div>
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          {id ? "Salvar jornada" : "Criar jornada"}
        </Button>
      </div>
    </form>
  )
}

/** Excluir a jornada (só sem funcionários vinculados; o servidor confere). */
export function ExcluirJornada({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirJornadaModelo, {})
  const envio = useEnvioFormulario(action, estado, {
    antes: (e) => {
      confirmarEnvio(e, "Excluir esta jornada? Não dá para desfazer.")
    },
  })
  return (
    <form action={action} {...envio} className="grid justify-items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pend}
        className="text-destructive hover:text-destructive"
      >
        {pend ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir jornada
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
