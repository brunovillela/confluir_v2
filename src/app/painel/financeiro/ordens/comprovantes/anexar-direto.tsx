"use client"

import { useRef, useState, useTransition } from "react"
import { Loader2, Paperclip } from "lucide-react"

import { Button } from "@/components/ui/button"

import { anexarComprovanteDiretoAction } from "./actions"

/** Botão da linha: escolhe o PDF (ou foto) e anexa direto à ordem. */
export function AnexarDireto({ ordemId }: { ordemId: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="sr-only"
        aria-label="Comprovante desta ordem"
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          e.target.value = ""
          if (!arquivo) return
          const fd = new FormData()
          fd.set("ordem_id", ordemId)
          fd.set("arquivo", arquivo)
          setErro(null)
          iniciar(async () => {
            const r = await anexarComprovanteDiretoAction(fd).catch(() => ({ erro: "Falha ao enviar (arquivo grande demais?)." }))
            if (r.erro) setErro(r.erro)
          })
        }}
      />
      <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={() => entrada.current?.click()}>
        {enviando ? <Loader2 className="animate-spin" /> : <Paperclip />}
        Anexar
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  )
}
