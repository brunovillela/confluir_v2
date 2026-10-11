"use client"

import { useState, useSyncExternalStore } from "react"
import { Copy, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const semInscricao = () => () => {}

/**
 * Compartilhar a notícia (A87). Não há página pública de notícia: o link é o
 * do portal, que pede login — o colega associado entra e lê. Por isso o
 * "Compartilhar" do sistema leva também a manchete e o começo do texto, que
 * chegam a quem não é associado mesmo sem o login. No celular, o
 * "Compartilhar" do sistema; em qualquer aparelho, "Copiar link". Se o
 * navegador bloquear a área de transferência, o link aparece num campo já
 * selecionado (mesmo jeito de hospedagem/reserva/[id]/compartilhar-reserva).
 * Nada aqui grava: vale também na visualização pela gestão.
 */
export function CompartilharNoticia({
  id,
  manchete,
  resumo,
}: {
  id: string
  manchete: string
  resumo: string | null
}) {
  // Só no navegador se sabe se há o "Compartilhar" do sistema; no servidor, não.
  const podeCompartilhar = useSyncExternalStore(
    semInscricao,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  )
  const [manual, setManual] = useState<string | null>(null)

  const link = () => `${window.location.origin}/portal/noticias/${id}`

  async function compartilhar() {
    try {
      await navigator.share({
        title: manchete,
        text: resumo ? `${manchete}\n\n${resumo}` : manchete,
        url: link(),
      })
    } catch {
      // Cancelado pela pessoa ou recusado pelo navegador: nada a fazer.
    }
  }

  async function copiar() {
    const endereco = link()
    try {
      await navigator.clipboard.writeText(endereco)
      setManual(null)
      toast.success("Link copiado. Quem é associado abre a notícia depois de entrar no portal.")
    } catch {
      setManual(endereco)
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
          <Copy />
          Copiar link
        </Button>
      </div>
      {manual && (
        <Input
          readOnly
          value={manual}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link da notícia para copiar"
          className="max-w-md"
        />
      )}
    </div>
  )
}
