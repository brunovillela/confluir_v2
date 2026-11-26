"use client"

import { useActionState, useState } from "react"
import { CircleCheckBig, Loader2, RotateCcw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { MOTIVOS_FINALIZACAO_CONTRATO } from "@/lib/contratos-constantes"

import { finalizarContratoAction, reabrirContratoAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Finalizar contrato (26/11/2026): cumprido, rescindido ou substituído — o
 * contrato sai de vigentes/vencidos e fica "Finalizado". As parcelas ainda não
 * autorizadas que vencem depois da data podem ser excluídas junto.
 */
export function FinalizarContrato({
  contratoId,
  hoje,
  parcelasFuturas,
}: {
  contratoId: string
  hoje: string
  /** Vencimentos das ordens ainda não autorizadas (para contar as que vencem depois da data). */
  parcelasFuturas: string[]
}) {
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(hoje)
  const [motivo, setMotivo] = useState("")
  const [estado, acao, pendente] = useActionState(finalizarContratoAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const depois = parcelasFuturas.filter((v) => v > data).length

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CircleCheckBig />
          Finalizar contrato
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar contrato</DialogTitle>
          <DialogDescription>
            Para o contrato que acabou — cumprido, rescindido ou substituído. Ele sai de vigentes e vencidos e fica
            como <strong>Finalizado</strong>, sem pendência. Dá para reabrir depois, se foi engano.
          </DialogDescription>
        </DialogHeader>
        <form action={acao} {...envio} className="grid gap-3">
          <input type="hidden" name="contrato_id" value={contratoId} />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="grid gap-1.5">
              <Label htmlFor="fin-data">Finalizado em *</Label>
              <Input id="fin-data" name="data" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fin-motivo">Motivo *</Label>
              <select
                id="fin-motivo"
                name="motivo"
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o motivo
                </option>
                {MOTIVOS_FINALIZACAO_CONTRATO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fin-obs">Observação{motivo === "Outro motivo" ? " *" : ""}</Label>
            <Input
              id="fin-obs"
              name="observacao"
              maxLength={500}
              required={motivo === "Outro motivo"}
              placeholder="Ex.: substituído pelo contrato 2026.0301…; distrato assinado em 20/11"
            />
          </div>
          {depois > 0 && (
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="checkbox" name="excluir_futuras" defaultChecked className="mt-0.5 size-4" />
              <span>
                <strong>
                  Excluir {depois} {depois === 1 ? "parcela ainda não autorizada" : "parcelas ainda não autorizadas"}
                </strong>{" "}
                que {depois === 1 ? "vence" : "vencem"} depois desta data.
                <span className="text-muted-foreground block text-xs">
                  O que já foi autorizado ou pago fica como está e é pago normalmente. A exclusão fica no histórico de
                  cada ordem.
                </span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <CircleCheckBig />}
              Finalizar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Reabrir o contrato finalizado por engano. */
export function ReabrirContrato({ contratoId }: { contratoId: string }) {
  const [estado, acao, pendente] = useActionState(reabrirContratoAction, {})
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: "Reabrir este contrato?",
        descricao: "Ele volta a seguir a vigência (vigente, vencendo ou vencido). As parcelas excluídas na finalização não voltam.",
        confirmar: "Reabrir",
      }),
  })
  return (
    <form action={acao} {...envio} className="grid gap-1">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        Reabrir
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
