"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { LeitorQr } from "@/components/leitor-qr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectNativo } from "@/components/ui/select-nativo"

import { presencaNaSalaAction } from "./actions"

/**
 * Registrar presença lendo o código que muda no telão da sala. Sem câmera, dá
 * para digitar as 6 letras do código e escolher a sessão.
 */
export function PresencaSala({ token, sessoes }: { token: string; sessoes: { id: string; titulo: string }[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [manual, setManual] = useState(false)
  const [sessao, setSessao] = useState(sessoes[0]?.id ?? "")
  const [codigo, setCodigo] = useState("")
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function enviar(texto: string) {
    iniciar(async () => {
      const r = await presencaNaSalaAction({ token, texto })
      setMsg(r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: r.ok ?? "Presença registrada." })
      if (!r.erro) router.refresh()
    })
  }

  return (
    <div className="grid gap-3">
      <LeitorQr rotulo="Registrar presença na sala" aoLer={enviar} />
      {pendente && <Loader2 className="size-5 animate-spin" />}
      {msg && <p className={`text-sm font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.texto}</p>}
      {!manual ? (
        <button type="button" className="text-muted-foreground justify-self-start text-xs underline underline-offset-2" onClick={() => setManual(true)}>
          Sem câmera? Digitar o código
        </button>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            enviar(`CGRS:${sessao}:${codigo.trim().toUpperCase()}`)
          }}
        >
          <SelectNativo value={sessao} onChange={(e) => setSessao(e.target.value)} className="max-w-56" aria-label="Sessão">
            {sessoes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titulo}
              </option>
            ))}
          </SelectNativo>
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código" maxLength={8} className="w-28 font-mono uppercase" aria-label="Código da sala" />
          <Button type="submit" variant="outline" disabled={pendente || codigo.trim().length < 6}>
            Registrar
          </Button>
        </form>
      )}
    </div>
  )
}
