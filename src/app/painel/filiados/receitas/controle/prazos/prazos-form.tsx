"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import type { RegraEfetiva, TipoContribuicao } from "@/lib/repasse"

import { salvarRegrasGeraisAction } from "../actions"

const EXPLICACAO: Record<TipoContribuicao, string> = {
  Associativa: "A mensalidade dos filiados, descontada todo mês.",
  Assistencial: "Prevista no acordo coletivo; costuma ser descontada em um ou poucos meses do ano.",
  Sindical: "Descontada uma vez por ano, em geral em março (CLT art. 582), quando autorizada.",
}

const nomeMes = (m: number) =>
  ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][m - 1]

export function PrazosForm({
  desde,
  regras,
}: {
  /** "2026-10" ou "". */
  desde: string
  regras: Record<TipoContribuicao, RegraEfetiva>
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(salvarRegrasGeraisAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  return (
    <form action={acao} {...envio} className="grid gap-6">
      <ErroNoCampo estado={estado} />
      <div className="grid max-w-sm gap-1.5">
        <Label htmlFor="desde">Controlar a partir da competência</Label>
        <Input id="desde" name="desde" type="month" defaultValue={desde} aria-invalid={estado.campo === "desde"} />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Antes dela, nada aparece como atrasado. Filiações e desfiliações a partir dela entram nas inclusões e exclusões a
          comunicar às empresas. Deixe em branco para não cobrar ninguém ainda.
        </p>
      </div>

      {(Object.keys(regras) as TipoContribuicao[]).map((tipo) => {
        const r = regras[tipo]
        return (
          <fieldset key={tipo} className="grid gap-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Contribuição {tipo.toLowerCase()}</legend>
            <p className="text-muted-foreground -mt-1 text-xs">{EXPLICACAO[tipo]}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`controla_${tipo}`}
                defaultChecked={r.controla}
                className="accent-primary size-4"
              />
              Controlar o envio deste tipo
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {tipo !== "Associativa" && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`meses_${tipo}`}>Meses de competência com desconto</Label>
                  <Input
                    id={`meses_${tipo}`}
                    name={`meses_${tipo}`}
                    placeholder="todos"
                    defaultValue={r.meses?.map(nomeMes).join(", ") ?? ""}
                    aria-invalid={estado.campo === `meses_${tipo}`}
                  />
                  <p className="text-muted-foreground text-xs">Ex.: mar ou 3, 9. Em branco = todos.</p>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={`envio_${tipo}`}>Relação até o dia</Label>
                <Input id={`envio_${tipo}`} name={`envio_${tipo}`} type="number" min={1} max={31} defaultValue={r.diaEnvio} />
                <p className="text-muted-foreground text-xs">do mês seguinte à competência</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`deposito_${tipo}`}>Depósito até o dia</Label>
                <Input id={`deposito_${tipo}`} name={`deposito_${tipo}`} type="number" min={1} max={31} defaultValue={r.diaDeposito} />
                <p className="text-muted-foreground text-xs">do mês seguinte à competência</p>
              </div>
            </div>
          </fieldset>
        )
      })}

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar prazos
        </Button>
      </div>
    </form>
  )
}
