"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileSearch, Loader2, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { gerarResenhaPontoAction, lerEspelhosPontoAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function GerarResenhaBotao({
  escopo,
  remessaId,
  ano,
  departamento,
  jaExiste,
}: {
  escopo: "remessa" | "ano" | "departamento"
  remessaId?: string
  ano?: string
  departamento?: string
  jaExiste: boolean
}) {
  const [estado, formAction, pendente] = useActionState(gerarResenhaPontoAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <input type="hidden" name="escopo" value={escopo} />
      {remessaId && <input type="hidden" name="remessa_id" value={remessaId} />}
      {ano && <input type="hidden" name="ano" value={ano} />}
      {departamento && <input type="hidden" name="departamento" value={departamento} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant={jaExiste ? "outline" : "default"} disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {pendente ? "Redigindo… (até 1 minuto)" : jaExiste ? "Gerar de novo" : "Gerar resenha com IA"}
      </Button>
    </form>
  )
}

/** Lê os espelhos pendentes em lotes, até acabar, mostrando o andamento. */
export function LerEspelhosBotao({ remessaId, pendentes }: { remessaId: string; pendentes: number }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [andamento, setAndamento] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const ler = () =>
    iniciar(async () => {
      setErro(null)
      let lidos = 0
      let pulados = 0
      let falhas = 0
      for (let volta = 0; volta < 20; volta++) {
        setAndamento(`Lendo espelhos… ${lidos + pulados + falhas} de ${pendentes}`)
        const r = await lerEspelhosPontoAction(remessaId)
        if (r.erro) {
          setErro(r.erro)
          break
        }
        lidos += r.lidos ?? 0
        pulados += r.pulados ?? 0
        falhas += r.erros ?? 0
        if (!r.faltam || (r.lidos ?? 0) + (r.pulados ?? 0) + (r.erros ?? 0) === 0) break
      }
      setAndamento(
        `${lidos} espelho(s) lido(s)` +
          (pulados ? `, ${pulados} escaneado(s) sem texto` : "") +
          (falhas ? `, ${falhas} com erro` : "") +
          "."
      )
      router.refresh()
    })

  return (
    <div className="grid gap-2">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={ler} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileSearch />}
          Ler marcações dos espelhos ({pendentes})
        </Button>
        {andamento && <span className="text-muted-foreground text-xs">{andamento}</span>}
      </div>
    </div>
  )
}
