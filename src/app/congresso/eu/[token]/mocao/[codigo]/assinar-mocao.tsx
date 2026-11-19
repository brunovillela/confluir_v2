"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, PenLine } from "lucide-react"

import { LeitorQr } from "@/components/leitor-qr"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"

import { assinarLinkAction, retirarAssinaturaLinkAction } from "@/app/painel/representacao/congressos/mocoes-actions"

/**
 * Assinar em poucos toques: a regra (local e quem vê os nomes) aparece antes;
 * se a moção exige o código da sala, a pessoa lê o QR do telão ou digita.
 */
export function AssinarMocao({
  token,
  codigo,
  textoHash,
  jaAssinou,
  pode,
  motivo,
  precisaCodigo,
  podeRetirar,
  regras,
}: {
  token: string
  codigo: string
  textoHash: string
  jaAssinou: boolean
  pode: boolean
  motivo: string | null
  precisaCodigo: boolean
  podeRetirar: boolean
  regras: string
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [sala, setSala] = useState("")
  const [pendente, iniciar] = useTransition()

  const assinar = (codigoSala: string | null) =>
    iniciar(async () => {
      const r = await assinarLinkAction(token, codigo, { textoHash, codigoSala })
      setMsg(r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: r.ok ?? "Assinado." })
    })

  if (jaAssinou) {
    return (
      <div className="grid gap-2">
        <p className="inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-5" />
          Você assinou esta moção.
        </p>
        {podeRetirar && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            disabled={pendente}
            onClick={async () => {
              if (!(await confirmar("Retirar a sua assinatura? Fica registrado que você retirou."))) return
              iniciar(async () => {
                const r = await retirarAssinaturaLinkAction(token, codigo)
                setMsg(r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: r.ok ?? "Retirada." })
              })
            }}
          >
            Retirar a minha assinatura
          </Button>
        )}
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.texto}</p>}
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{regras}</p>
      {pode ? (
        <Button
          className="h-12 justify-self-start text-base"
          disabled={pendente}
          onClick={async () => {
            if (!(await confirmar("Assinar esta moção? A assinatura grava o texto que você leu."))) return
            assinar(null)
          }}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <PenLine />}
          Assinar
        </Button>
      ) : precisaCodigo ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">{motivo}</p>
          <LeitorQr rotulo="Ler o código da sala e assinar" aoLer={(t) => assinar(t)} />
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const v = sala.trim()
              if (!v) return
              assinar(v.toUpperCase())
            }}
          >
            <Input
              value={sala}
              onChange={(e) => setSala(e.target.value)}
              placeholder="Código lido do telão"
              aria-label="Código da sala"
              className="w-56 font-mono"
            />
            <Button type="submit" variant="outline" disabled={pendente || sala.trim().length < 6}>
              Assinar com o código
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{motivo}</p>
      )}
      {msg && <p role="status" className={`text-sm font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.texto}</p>}
    </div>
  )
}
