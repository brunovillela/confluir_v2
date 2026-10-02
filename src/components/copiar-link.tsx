"use client"

import { useState } from "react"
import { Check, Link2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Copia um link gerado no servidor (convite, reserva…) para mandar por
 * WhatsApp ou outro meio. O link só é gerado no clique. Se o navegador
 * bloquear a área de transferência (alguns bloqueiam depois de uma espera),
 * mostra o link num campo selecionado para copiar à mão.
 */
export function CopiarLinkBotao({
  obterLink,
  rotulo = "Copiar link",
  compacto = false,
}: {
  obterLink: () => Promise<{ erro?: string; link?: string }>
  rotulo?: string
  compacto?: boolean
}) {
  const [estado, setEstado] = useState<"ocioso" | "gerando" | "copiado">("ocioso")
  const [manual, setManual] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function copiar() {
    setErro(null)
    setManual(null)
    setEstado("gerando")
    const { erro: e, link } = await obterLink()
    if (e || !link) {
      setErro(e ?? "Não foi possível gerar o link.")
      setEstado("ocioso")
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setEstado("copiado")
      setTimeout(() => setEstado("ocioso"), 2500)
    } catch {
      setManual(link)
      setEstado("ocioso")
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copiar}
        disabled={estado === "gerando"}
        className="h-7 px-2"
        title="Copia o link para enviar por WhatsApp ou outro meio"
      >
        {estado === "gerando" ? (
          <Loader2 className="animate-spin" />
        ) : estado === "copiado" ? (
          <Check className="text-success-fg" />
        ) : (
          <Link2 />
        )}
        {!compacto && (estado === "copiado" ? "Copiado!" : rotulo)}
      </Button>
      {manual && (
        <input
          readOnly
          value={manual}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link para copiar"
          className="border-input bg-background h-7 w-64 rounded-md border px-2 text-xs"
        />
      )}
      {erro && <span className="text-destructive basis-full text-right text-xs">{erro}</span>}
    </span>
  )
}
