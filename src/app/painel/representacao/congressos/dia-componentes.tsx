"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Printer, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"

import { crachasLoteAction, desfazerTrocaAction } from "./dia-actions"

/** Recarrega os números do painel a cada `segundos`, enquanto a aba está visível. */
export function AtualizarSozinho({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, segundos * 1000)
    return () => clearInterval(t)
  }, [router, segundos])
  return null
}

export function CrachasEmLote({ congressoId }: { congressoId: string }) {
  const [pendente, iniciar] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={async () => {
          const ok = await confirmar(
            "Gerar os crachás de todos os confirmados presenciais que ainda não têm? Saem quatro por folha A4, para pré-imprimir; na mesa, basta credenciar e entregar."
          )
          if (!ok) return
          iniciar(async () => {
            const r = await crachasLoteAction({ congressoId })
            if (r.pdf) {
              const bytes = Uint8Array.from(atob(r.pdf), (c) => c.charCodeAt(0))
              window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank")
              setMsg(`${r.quantidade} crachá(s) gerado(s).${r.erro ? ` ${r.erro}` : ""}`)
            } else setMsg(r.erro ?? "Nada a gerar.")
          })
        }}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Printer />}
        Crachás em lote para pré-impressão
      </Button>
      {msg && <span className="text-muted-foreground text-xs">{msg}</span>}
    </div>
  )
}

export function DesfazerTroca({ congressoId, trocaId }: { congressoId: string; trocaId: string }) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pendente}
        onClick={async () => {
          if (!(await confirmar("Desfazer a troca? O titular volta a ter o voto, e o suplente deixa de votar."))) return
          iniciar(async () => {
            const r = await desfazerTrocaAction({ congressoId, trocaId })
            if (r.erro) setErro(r.erro)
          })
        }}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Desfazer
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </span>
  )
}
