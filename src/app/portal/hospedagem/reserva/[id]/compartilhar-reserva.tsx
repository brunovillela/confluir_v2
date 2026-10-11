"use client"

import { useState, useSyncExternalStore } from "react"
import { Check, Copy, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"

const semInscricao = () => () => {}

/**
 * Guardar ou mandar a reserva (achado A41): o link abre o QR Code sem login
 * — serve para salvar no celular ou mandar no WhatsApp. No celular, o
 * "Compartilhar" do sistema; em qualquer aparelho, "Copiar link". Se o
 * navegador bloquear a área de transferência, o link aparece num campo já
 * selecionado para copiar à mão (mesmo jeito de components/copiar-link.tsx).
 */
export function CompartilharReserva({
  link,
  titulo,
  texto,
}: {
  link: string
  titulo: string
  texto: string
}) {
  // Só no navegador se sabe se há o "Compartilhar" do sistema; no servidor, não.
  const podeCompartilhar = useSyncExternalStore(
    semInscricao,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )
  const [copiado, setCopiado] = useState(false)
  const [manual, setManual] = useState(false)

  async function compartilhar() {
    try {
      await navigator.share({ title: titulo, text: texto, url: link })
    } catch {
      // Cancelado pela pessoa ou recusado pelo navegador: nada a fazer.
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setManual(true)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {podeCompartilhar && (
          <Button type="button" variant="outline" onClick={compartilhar}>
            <Share2 />
            Compartilhar
          </Button>
        )}
        <Button type="button" variant="outline" onClick={copiar}>
          {copiado ? <Check className="text-success-fg" /> : <Copy />}
          {copiado ? "Link copiado" : "Copiar link"}
        </Button>
      </div>
      {manual && (
        <input
          readOnly
          value={link}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link da reserva para copiar"
          className="border-input bg-background h-11 w-full rounded-md border px-2 text-sm"
        />
      )}
    </div>
  )
}
