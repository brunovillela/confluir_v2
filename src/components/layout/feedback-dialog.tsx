"use client"

import { useActionState, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { enviarFeedbackAction, type EstadoFeedback } from "@/lib/actions/feedback"

/**
 * "Relatar problema / sugerir" (onda 2, U12). O relato vira uma Demanda com
 * a tela, quem mandou, o navegador e o print; quem cuida das demandas é
 * avisado. A tela e o navegador vão sozinhos; o print pode ser colado
 * (Ctrl+V na caixa de texto) ou escolhido.
 */
export function FeedbackDialog({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [estado, action, enviando] = useActionState<EstadoFeedback, FormData>(enviarFeedbackAction, {})
  const [print, setPrint] = useState<File | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)
  const navegadorRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  // A tela e o navegador entram no envio, lidos na hora de enviar.
  const aoEnviar = () => {
    if (urlRef.current) urlRef.current.value = window.location.href
    if (navegadorRef.current) navegadorRef.current.value = navigator.userAgent
  }

  const aoColar = (e: React.ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))
    const arquivo = item?.getAsFile()
    if (!arquivo) return
    e.preventDefault()
    const dt = new DataTransfer()
    dt.items.add(new File([arquivo], `print.${arquivo.type.split("/")[1] ?? "png"}`, { type: arquivo.type }))
    if (arquivoRef.current) arquivoRef.current.files = dt.files
    setPrint(dt.files[0])
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Relatar problema ou sugerir</DialogTitle>
          <DialogDescription>
            Vira uma demanda para a equipe, com a tela em que você está. Um print ajuda muito: cole com Ctrl+V na caixa ou escolha o arquivo.
          </DialogDescription>
        </DialogHeader>

        {estado.ok ? (
          <div className="grid gap-3">
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>Obrigado! Seu relato foi registrado e a equipe foi avisada.</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" asChild>
                <Link href={`/painel/ferramentas/demandas/${estado.ok.id}`} onClick={aoFechar}>
                  Ver a demanda
                </Link>
              </Button>
              <Button onClick={aoFechar}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={action} onSubmit={aoEnviar} className="grid gap-4" encType="multipart/form-data">
            <input type="hidden" name="url" ref={urlRef} defaultValue="" />
            <input type="hidden" name="navegador" ref={navegadorRef} defaultValue="" />
            <RadioGroup name="tipo" defaultValue="problema" className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="problema" id="fb-problema" />
                Algo não funcionou
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="sugestao" id="fb-sugestao" />
                Tenho uma sugestão
              </label>
            </RadioGroup>
            <div className="grid gap-1.5">
              <Label htmlFor="fb-texto">O que aconteceu, ou qual é a ideia? *</Label>
              <Textarea
                id="fb-texto"
                name="texto"
                rows={5}
                required
                minLength={10}
                placeholder="Ex.: ao salvar a diária, a tela voltou em branco e o pedido não apareceu na lista."
                onPaste={aoColar}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fb-print">Print (opcional)</Label>
              <Input
                id="fb-print"
                ref={arquivoRef}
                name="print"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setPrint(e.target.files?.[0] ?? null)}
              />
              {print && <p className="text-muted-foreground text-xs">Anexado: {print.name}</p>}
            </div>
            <p className="text-muted-foreground text-xs break-all">Tela: {pathname}</p>
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? <Loader2 className="animate-spin" /> : <Send />}
                Enviar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
