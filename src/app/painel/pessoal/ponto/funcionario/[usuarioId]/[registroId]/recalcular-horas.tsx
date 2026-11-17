"use client"

import { useActionState, useState } from "react"
import { Calculator, Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { hhmm } from "@/lib/horas"

import {
  aplicarRecalculoAction,
  previaRecalculoAction,
  type EstadoRecalculo,
} from "../../../marcacoes-actions"

/**
 * Recalcular as horas realizadas pelas marcações conferidas: primeiro mostra
 * o que daria (sem gravar), com a jornada usada e o que muda; Aplicar grava e
 * refaz o saldo, e as remessas seguintes, se marcado.
 */
export function RecalcularHoras({
  registroId,
  faixa1,
  faixa2,
  bloqueado,
}: {
  registroId: string
  /** Rótulos das faixas (50%, 100%…). */
  faixa1: string
  faixa2: string
  /** Remessa finalizada: só mostra a prévia. */
  bloqueado: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [previa, pedirPrevia, calculando] = useActionState<EstadoRecalculo, FormData>(async (anterior, dados) => {
    const r = await previaRecalculoAction(anterior, dados)
    setAberto(true)
    return r
  }, {})
  const [aplicado, aplicar, aplicando] = useActionState<EstadoRecalculo, FormData>(async (anterior, dados) => {
    const r = await aplicarRecalculoAction(anterior, dados)
    if (r.ok) {
      toast.success(r.ok)
      setAberto(false)
    }
    return r
  }, {})

  const p = previa.previa
  const igual = p && p.faixa1 === p.atual1 && p.faixa2 === p.atual2
  const posterioresAbertas = p?.posteriores.filter((r) => !r.finalizada) ?? []
  // A marcação incompleta tem aviso próprio, com os dias, perto do Aplicar.
  const alertas = p?.alertas.filter((a) => !(p.incompletos.length && /marcação incompleta/i.test(a))) ?? []

  return (
    <div className="grid gap-3">
      {!aberto && (
        <form action={pedirPrevia}>
          <input type="hidden" name="registro_id" value={registroId} />
          <Button type="submit" variant="outline" size="sm" disabled={calculando}>
            {calculando ? <Loader2 className="animate-spin" /> : <Calculator />}
            Recalcular pelas marcações
          </Button>
        </form>
      )}

      {aberto && previa.erro && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {previa.erro}
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {aberto && p && (
        <div className="grid gap-3 rounded-md border p-3 text-sm">
          <p className="font-medium">Pelas marcações conferidas</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              [`Realizadas a ${faixa1}`, p.faixa1, p.atual1],
              [`Realizadas a ${faixa2}`, p.faixa2, p.atual2],
            ].map(([rotulo, novo, atual]) => (
              <div key={String(rotulo)} className="rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">{rotulo}</p>
                <p className="text-lg font-semibold tabular-nums">{hhmm(Number(novo))}</p>
                <p className="text-muted-foreground text-xs">
                  {novo === atual ? "igual ao lançado" : `lançado hoje: ${hhmm(Number(atual))}`}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Jornada prevista: {p.jornada}. Mesmas regras de hora extra da importação (tolerância, faixas, negativas).
            As pagas não mudam; o saldo remanescente é refeito.
          </p>
          {alertas.length > 0 && (
            <ul className="text-warning-fg list-disc pl-5 text-xs">
              {alertas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          {bloqueado ? (
            <p className="text-muted-foreground text-xs">A remessa está finalizada: reabra a remessa para aplicar.</p>
          ) : igual ? (
            <p className="text-muted-foreground text-xs">As horas lançadas já batem com as marcações.</p>
          ) : (
            <form action={aplicar} className="grid gap-2">
              <input type="hidden" name="registro_id" value={registroId} />
              {p.posteriores.length > 0 && (
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    name="recalcular_posteriores"
                    value="1"
                    defaultChecked={posterioresAbertas.length > 0}
                    disabled={posterioresAbertas.length === 0}
                    className="mt-0.5"
                  />
                  <span>
                    Refazer o saldo nas remessas seguintes: {p.posteriores.map((r) => r.remessa + (r.finalizada ? " (finalizada)" : "")).join(", ")}
                    {posterioresAbertas.length < p.posteriores.length && " — para na primeira finalizada"}
                  </span>
                </label>
              )}
              {p.incompletos.length > 0 && (
                <p className="text-warning-fg text-xs font-medium">
                  {p.incompletos.length} dia(s) ainda com marcação incompleta (
                  {p.incompletos.map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(", ")}): aplicando assim, esses
                  dias contam só as horas dos pares completos. Corrija-os na tabela abaixo antes, se for erro de leitura.
                </p>
              )}
              {aplicado.erro && <p className="text-destructive text-xs">{aplicado.erro}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" disabled={aplicando}>
                  {aplicando ? <Loader2 className="animate-spin" /> : <Check />}
                  Aplicar no registro
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)} disabled={aplicando}>
                  <X />
                  Cancelar
                </Button>
              </div>
            </form>
          )}
          {(bloqueado || igual) && (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
