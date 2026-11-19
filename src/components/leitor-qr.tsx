"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Camera, CameraOff } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Leitor de QR pela câmera. Dois caminhos, como na porta de Eventos: o
 * BarcodeDetector nativo (Chrome/Android) e, onde ele não existe (Safari,
 * todo navegador de iPhone), a jsQR carregada sob demanda, lendo o quadro
 * reduzido para não travar celular antigo.
 *
 * `continuo`: depois de ler, volta a ler (porta de sessão); sem ele, desliga
 * a câmera na primeira leitura (mesa, participante).
 */
export function LeitorQr({
  aoLer,
  rotulo = "Ler QR",
  continuo = false,
}: {
  aoLer: (texto: string) => void | Promise<void>
  rotulo?: string
  continuo?: boolean
}) {
  const [ligado, setLigado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ultimo = useRef<{ texto: string; quando: number } | null>(null)
  const aoLerRef = useRef(aoLer)
  useEffect(() => {
    aoLerRef.current = aoLer
  }, [aoLer])

  const disponivel = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false
  )

  const parar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLigado(false)
  }, [])

  useEffect(() => parar, [parar])

  async function ligar() {
    setErro(null)
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      setLigado(true)
    } catch {
      setErro("Não foi possível abrir a câmera. Confira a permissão do navegador ou use a busca.")
      parar()
    }
  }

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!ligado || !video || !stream) return
    let vivo = true
    const iniciar = async () => {
      video.srcObject = stream
      video.play().catch(() => setErro("A câmera abriu, mas o vídeo não iniciou. Toque de novo."))
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
        }
      ).BarcodeDetector
      const nativo = Detector ? new Detector({ formats: ["qr_code"] }) : null
      let biblioteca: (() => string | null) | null = null
      if (!nativo) {
        const jsQR = (await import("jsqr")).default
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        biblioteca = () => {
          if (!ctx || !video.videoWidth) return null
          const escala = Math.min(1, 640 / video.videoWidth)
          canvas.width = Math.round(video.videoWidth * escala)
          canvas.height = Math.round(video.videoHeight * escala)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
          return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null
        }
      }
      const laco = async () => {
        if (!vivo || !streamRef.current) return
        try {
          const texto = nativo ? ((await nativo.detect(video))[0]?.rawValue ?? null) : (biblioteca?.() ?? null)
          // O mesmo QR parado na frente da câmera não conta duas vezes seguidas.
          const repetido = texto && ultimo.current?.texto === texto && Date.now() - ultimo.current.quando < 4000
          if (texto && !repetido) {
            ultimo.current = { texto, quando: Date.now() }
            if (!continuo) {
              vivo = false
              parar()
            }
            await aoLerRef.current(texto)
          }
        } catch {
          // quadro ruim: segue
        }
        if (vivo) setTimeout(laco, nativo ? 250 : 400)
      }
      laco()
    }
    iniciar()
    return () => {
      vivo = false
    }
  }, [ligado, continuo, parar])

  if (!disponivel) return null
  return (
    <div className="grid gap-2">
      {ligado ? (
        <>
          <video ref={videoRef} playsInline muted className="aspect-square w-full max-w-sm rounded-lg bg-black object-cover" />
          <Button type="button" variant="outline" onClick={parar} className="justify-self-start">
            <CameraOff />
            Fechar a câmera
          </Button>
        </>
      ) : (
        <Button type="button" variant="outline" onClick={ligar} className="justify-self-start">
          <Camera />
          {rotulo}
        </Button>
      )}
      {erro && <p className="text-destructive text-sm">{erro}</p>}
    </div>
  )
}
