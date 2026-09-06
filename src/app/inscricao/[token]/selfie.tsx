"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, Check, Loader2, RefreshCw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { enviarFotoAction } from "./actions"

/**
 * Captura de selfie com guia de centralização.
 *
 * O guia oval não recorta nem valida nada — ele existe para a pessoa se
 * enquadrar sozinha. Reconhecimento facial precisa do rosto centralizado,
 * frontal e iluminado, e pedir isso com uma moldura funciona melhor que pedir
 * com texto.
 *
 * A imagem é reduzida a 720px de largura e exportada em JPEG antes de subir:
 * uma selfie de celular moderno tem vários megabytes, e o que a catraca precisa
 * cabe em muito menos.
 */
const LARGURA_SAIDA = 720

export function CapturaSelfie({
  token,
  jaTemFoto,
}: {
  token: string
  jaTemFoto: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [ligada, setLigada] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(jaTemFoto)

  const desligar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLigada(false)
  }, [])

  // Desligar a câmera ao sair da tela não é detalhe: a luz do celular fica
  // acesa e a pessoa acha que está sendo filmada.
  useEffect(() => desligar, [desligar])

  async function ligar() {
    setErro(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setLigada(true)
    } catch {
      setErro(
        "Não foi possível abrir a câmera. Verifique a permissão do navegador — em alguns celulares é preciso autorizar em Configurações do site."
      )
    }
  }

  function capturar() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const escala = LARGURA_SAIDA / video.videoWidth
    canvas.width = LARGURA_SAIDA
    canvas.height = Math.round(video.videoHeight * escala)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Espelha na horizontal: a pré-visualização é espelhada (como espelho), e
    // sem isto a foto sai invertida em relação ao que a pessoa viu.
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    setPrevia(canvas.toDataURL("image/jpeg", 0.85))
    desligar()
  }

  async function enviar() {
    if (!canvasRef.current) return
    setEnviando(true)
    setErro(null)
    const blob = await new Promise<Blob | null>((r) =>
      canvasRef.current!.toBlob(r, "image/jpeg", 0.85)
    )
    if (!blob) {
      setEnviando(false)
      setErro("Não foi possível preparar a imagem. Tente novamente.")
      return
    }
    const fd = new FormData()
    fd.append("token", token)
    fd.append("foto", blob, "selfie.jpg")
    const res = await enviarFotoAction(fd)
    setEnviando(false)
    if (res.erro) return setErro(res.erro)
    setPronto(true)
  }

  if (pronto) {
    return (
      <Alert variant="success">
        <Check />
        <AlertDescription>
          Foto recebida. Se quiser trocar,{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setPronto(false)
              setPrevia(null)
            }}
          >
            tire outra
          </button>
          .
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-3">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg border bg-black">
        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previa} alt="Prévia da sua foto" className="w-full" />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full -scale-x-100"
            />
            {/* Guia de centralização: oval no meio, com o resto escurecido. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: "rgba(0,0,0,0.45)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 32% 42% at 50% 46%, transparent 98%, black 100%)",
                maskImage:
                  "radial-gradient(ellipse 32% 42% at 50% 46%, transparent 98%, black 100%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[46%] h-[84%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/80"
            />
            {!ligada && (
              <div className="text-muted-foreground flex aspect-[3/4] items-center justify-center text-sm">
                Câmera desligada
              </div>
            )}
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <p className="text-muted-foreground text-center text-xs">
        Encaixe o rosto no oval, de frente, com boa luz e sem óculos escuros ou
        boné.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {!ligada && !previa && (
          <Button type="button" onClick={ligar}>
            <Camera />
            Abrir câmera
          </Button>
        )}
        {ligada && (
          <Button type="button" onClick={capturar}>
            <Camera />
            Tirar foto
          </Button>
        )}
        {previa && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPrevia(null)
                ligar()
              }}
              disabled={enviando}
            >
              <RefreshCw />
              Tirar de novo
            </Button>
            <Button type="button" onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 className="animate-spin" /> : <Check />}
              {enviando ? "Enviando…" : "Usar esta foto"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
