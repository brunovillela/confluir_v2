"use client"

import { useState } from "react"
import { Check, Copy, Link2, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { linkDeVotoDoApto } from "./actions"

/**
 * Link pessoal de voto para mandar por fora do e-mail (WhatsApp, Telegram, no
 * balcão). Existe porque provedor de e-mail engole mensagem: a Microsoft
 * descartou 22 de 22 códigos em 23/09/2026. O link é o mesmo do aviso — vale
 * só para aquele eleitor e para de abrir a cédula depois do voto.
 */
export function LinkDeVotoBotao({ aptoId, nome }: { aptoId: string; nome: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<{ link?: string; mensagem?: string; erro?: string } | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [copiado, setCopiado] = useState<"link" | "mensagem" | null>(null)

  async function abrir(estaAberto: boolean) {
    setAberto(estaAberto)
    if (!estaAberto || dados) return
    setCarregando(true)
    try {
      setDados(await linkDeVotoDoApto(aptoId))
    } finally {
      setCarregando(false)
    }
  }

  async function copiar(texto: string, qual: "link" | "mensagem") {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(qual)
      setTimeout(() => setCopiado(null), 2500)
    } catch {
      setCopiado(null)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Link de voto para enviar"
          title="Copiar o link pessoal de voto (WhatsApp, Telegram…)"
        >
          <Link2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de voto{nome ? ` — ${nome}` : ""}</DialogTitle>
          <DialogDescription>
            Para mandar por WhatsApp, Telegram ou qualquer outro caminho quando o e-mail não
            chega. O link é pessoal: quem abrir vota no lugar desta pessoa.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Gerando o link…
          </p>
        ) : dados?.erro ? (
          <Alert variant="destructive">
            <AlertDescription>{dados.erro}</AlertDescription>
          </Alert>
        ) : dados?.link ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="link-voto">Link</Label>
              <div className="flex gap-2">
                <Input id="link-voto" readOnly value={dados.link} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copiar(dados.link!, "link")}
                >
                  {copiado === "link" ? <Check /> : <Copy />}
                  {copiado === "link" ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="msg-voto">Mensagem pronta</Label>
              <textarea
                id="msg-voto"
                readOnly
                rows={4}
                value={dados.mensagem ?? ""}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => copiar(dados.mensagem ?? "", "mensagem")}
              >
                {copiado === "mensagem" ? <Check /> : <Copy />}
                {copiado === "mensagem" ? "Mensagem copiada" : "Copiar mensagem"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Confirme com quem você está falando antes de mandar. Depois que a pessoa vota, o
              link deixa de funcionar.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
