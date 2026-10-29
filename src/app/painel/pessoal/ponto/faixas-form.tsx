"use client"

import { useActionState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RegrasApuracao } from "@/lib/ponto-apuracao"

import { salvarRegrasHoraExtraAction } from "./actions"

/**
 * Regras de hora extra da entidade: o percentual de cada faixa (o acordo pode
 * pagar mais que os 50% da CLT) e como as horas do mês são apuradas pelas
 * batidas na importação do relatório de ponto. Muda os rótulos e as próximas
 * apurações — as horas já lançadas não mudam.
 */
export function RegrasHoraExtraForm({
  faixa1,
  faixa2,
  regras,
}: {
  faixa1: number
  faixa2: number
  regras: RegrasApuracao
}) {
  const [estado, formAction, pendente] = useActionState(salvarRegrasHoraExtraAction, {})
  const [, iniciar] = useTransition()
  return (
    <form
      className="grid gap-5 px-6 pb-5"
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        iniciar(() => formAction(dados))
      }}
    >
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

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Percentuais</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="faixa1">Faixa 1 — horas extras comuns (%)</Label>
          <Input id="faixa1" name="faixa1" inputMode="decimal" defaultValue={String(faixa1).replace(".", ",")} />
          <p className="text-muted-foreground text-xs">A CLT garante no mínimo 50%; o acordo pode pagar mais.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="faixa2">Faixa 2 — fim de semana e feriado (%)</Label>
          <Input id="faixa2" name="faixa2" inputMode="decimal" defaultValue={String(faixa2).replace(".", ",")} />
          <p className="text-muted-foreground text-xs">Em geral 100%.</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Dias da faixa 2</legend>
        <p className="text-muted-foreground text-xs">As horas a mais nestes dias vão para a faixa 2; nos demais, para a faixa 1.</p>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["faixa2_sabado", "Sábado", regras.faixa2Sabado],
              ["faixa2_domingo", "Domingo", regras.faixa2Domingo],
              ["faixa2_feriado", "Feriado", regras.faixa2Feriado],
            ] as const
          ).map(([nome, rotulo, marcado]) => (
            <label key={nome} className="flex items-center gap-2">
              <input type="checkbox" name={nome} defaultChecked={marcado} />
              {rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Horas negativas (atrasos, saídas antecipadas, faltas)</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="negativas" value="faixa1" defaultChecked={regras.negativas === "faixa1"} className="mt-1" />
          <span>
            Descontar só da faixa 1 — o fim de semana fica à parte, e a faixa 1 pode ficar negativa no mês
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="negativas"
            value="faixa1_depois_faixa2"
            defaultChecked={regras.negativas === "faixa1_depois_faixa2"}
            className="mt-1"
          />
          <span>Descontar da faixa 1 até zerar e o que sobrar da faixa 2</span>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tolerancia">Tolerância diária (minutos)</Label>
          <Input id="tolerancia" name="tolerancia" inputMode="numeric" defaultValue={String(regras.toleranciaDiariaMin)} />
          <p className="text-muted-foreground text-xs">
            Diferença do dia até este limite não conta, nem a mais nem a menos. A CLT (art. 58, § 1º) admite até 10.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="abonam">Ocorrências que abonam o dia</Label>
          <Input id="abonam" name="abonam" defaultValue={regras.ocorrenciasAbonam.join(", ")} />
          <p className="text-muted-foreground text-xs">
            Separadas por vírgula, como aparecem no cartão. Dia abonado não tem jornada a cumprir; “Falta” não deve
            estar aqui.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Mês sem nenhuma batida</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mes_sem_batidas" value="alertar" defaultChecked={regras.mesSemBatidas === "alertar"} className="mt-1" />
          <span>Só alertar e não lançar (afastamento, férias ou isenção costumam explicar)</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="mes_sem_batidas" value="lancar" defaultChecked={regras.mesSemBatidas === "lancar"} className="mt-1" />
          <span>Lançar o negativo da jornada prevista mesmo assim</span>
        </label>
      </fieldset>

      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente && <Loader2 className="animate-spin" />}
        Salvar regras
      </Button>
    </form>
  )
}
