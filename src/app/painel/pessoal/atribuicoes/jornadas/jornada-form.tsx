"use client"

import { useActionState } from "react"
import Link from "next/link"
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

/**
 * Cria ou edita uma jornada da entidade: nome e, por dia, o 1º turno e o 2º
 * (opcional), com o intervalo intrajornada entre eles. Salvar volta à página
 * da jornada com o formulário fechado.
 */
export function JornadaForm({
  id,
  nome,
  observacao,
  dias,
  vinculados,
  cancelarHref,
}: {
  /** Fechar o formulário sem salvar. */
  cancelarHref: string
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
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="pr-3 pb-1 font-normal">Dia</th>
              <th className="pr-3 pb-1 font-normal" colSpan={3}>1º turno</th>
              <th className="w-4" />
              <th className="pr-3 pb-1 font-normal" colSpan={3}>2º turno (depois do intervalo)</th>
            </tr>
          </thead>
          <tbody>
            {DIAS_SEMANA.map((d) => {
              const j = porDia.get(d.valor)
              const hora = (campo: string, rotulo: string, v: string | null | undefined) => (
                <td className="py-1 pr-1">
                  <Input
                    type="time"
                    name={`${campo}_${d.valor}`}
                    defaultValue={valor(v ?? null)}
                    className="w-32"
                    aria-label={`${rotulo} ${d.rotulo}`}
                  />
                </td>
              )
              const as = <td className="text-muted-foreground px-1 text-xs">às</td>
              return (
                <tr key={d.valor}>
                  <td className="w-32 pr-3">{d.rotulo}</td>
                  {hora("inicio", "Entrada do 1º turno", j?.hora_inicio)}
                  {as}
                  {hora("fim", "Saída do 1º turno", j?.hora_fim)}
                  <td className="w-4" />
                  {hora("inicio2", "Entrada do 2º turno", j?.hora_inicio_2)}
                  {as}
                  {hora("fim2", "Saída do 2º turno", j?.hora_fim_2)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Dia em branco = sem expediente. O 2º turno é opcional: preencha quando houver intervalo
        intrajornada (ex.: 08:00 às 12:00 e 13:00 às 17:00). O alerta de acesso fora do horário só
        vale antes da primeira entrada e depois da última saída; o intervalo não conta como fora.
        {vinculados > 0 &&
          ` A alteração vale para ${vinculados === 1 ? "o funcionário vinculado" : `os ${vinculados} funcionários vinculados`} e entra no movimento da folha.`}
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          {id ? "Salvar jornada" : "Criar jornada"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={cancelarHref}>Cancelar</Link>
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
