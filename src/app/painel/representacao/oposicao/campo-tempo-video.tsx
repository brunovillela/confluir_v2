"use client"

import { useId, useRef, useState } from "react"
import { Clock, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatarTempoVideo, lerTempoVideo } from "@/lib/oposicao-constantes"
import { carregarYoutubeApi, idDoYoutube } from "@/lib/youtube-api"

/**
 * Tempo mínimo do vídeo de sensibilização (08/11/2026): em minutos e
 * segundos ("3:20"), não mais em segundos soltos. "Usar a duração do vídeo"
 * lê a duração no próprio YouTube (player escondido) a partir do endereço
 * digitado no campo ao lado.
 */
export function CampoTempoVideo({ nome, idUrl, segundos }: { nome: string; idUrl: string; segundos: number | null }) {
  const id = useId()
  const [valor, setValor] = useState(formatarTempoVideo(segundos))
  const [lendo, setLendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const lido = lerTempoVideo(valor)
  const invalido = valor.trim() !== "" && lido == null

  async function usarDuracao() {
    setAviso(null)
    const url = (document.getElementById(idUrl) as HTMLInputElement | null)?.value ?? ""
    const video = idDoYoutube(url)
    if (!video) {
      setAviso("Informe primeiro um vídeo do YouTube no campo ao lado.")
      return
    }
    setLendo(true)
    try {
      const YT = await carregarYoutubeApi()
      const alvo = document.createElement("div")
      caixa.current?.appendChild(alvo)
      const duracao = await new Promise<number>((resolver, rejeitar) => {
        const limite = setTimeout(() => rejeitar(new Error("tempo")), 10_000)
        const player = new YT.Player(alvo, {
          videoId: video,
          width: 1,
          height: 1,
          events: {
            onReady: (e) => {
              clearTimeout(limite)
              const d = e.target.getDuration()
              player.destroy()
              if (d > 0) resolver(d)
              else rejeitar(new Error("sem duração"))
            },
            onError: () => {
              clearTimeout(limite)
              player.destroy()
              rejeitar(new Error("vídeo"))
            },
          },
        })
      })
      setValor(formatarTempoVideo(Math.floor(duracao)))
    } catch {
      setAviso("Não foi possível ler a duração do vídeo. Confira o endereço ou digite o tempo.")
    } finally {
      setLendo(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Tempo mínimo (min:s)</Label>
      {/* O valor enviado é o texto; o servidor converte para segundos. */}
      <Input
        id={id}
        name={nome}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="3:20"
        inputMode="numeric"
        aria-invalid={invalido || undefined}
        aria-describedby={`${id}-dica`}
      />
      <p id={`${id}-dica`} className={invalido ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
        {invalido ? "Use minutos:segundos, como 3:20." : aviso ?? "Vale com a decisão “Exigir o tempo mínimo”."}
      </p>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={usarDuracao} disabled={lendo}>
        {lendo ? <Loader2 className="animate-spin" /> : <Clock />}
        Usar a duração do vídeo
      </Button>
      <div ref={caixa} className="sr-only" aria-hidden />
    </div>
  )
}
