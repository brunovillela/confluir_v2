"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Camera, Check, IdCard, Loader2, Search, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ReservaNaPorta } from "@/lib/db/hospedagem-garantida"

import { buscarReservasAction, registrarEntradaAction } from "./actions"

/**
 * Recepção do hotel. Mesmo desenho da porta dos eventos (src/app/recepcao),
 * com uma diferença deliberada: aqui o QR NÃO confirma sozinho. A entrada só é
 * registrada depois que a recepção marca que conferiu um documento oficial com
 * foto — o QR prova a reserva, o documento prova a pessoa.
 */

type Aviso = { tipo: "ok" | "erro" | "info"; texto: string } | null

function extrairToken(texto: string): string | null {
  const m = texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0] : null
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

const ROTULO: Record<ReservaNaPorta["situacao"], string> = {
  pode_entrar: "",
  ja_entrou: "já entrou",
  fora_da_data: "fora da data",
  cancelada: "cancelada",
  aguardando_confirmacao: "vaga não confirmada",
}

export function PortaHotel() {
  const [termo, setTermo] = useState("")
  const [reservas, setReservas] = useState<ReservaNaPorta[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [scanner, setScanner] = useState(false)
  const [conferidos, setConferidos] = useState<Set<string>>(new Set())
  const [metodoDaBusca, setMetodoDaBusca] = useState<"qr" | "busca">("busca")
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const scannerDisponivel = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false
  )

  const buscar = useCallback(async (valor: string, metodo: "qr" | "busca") => {
    const t = valor.trim()
    if (t.length < 3) {
      setReservas([])
      return
    }
    setBuscando(true)
    setMetodoDaBusca(metodo)
    const res = await buscarReservasAction(t)
    setBuscando(false)
    if (res.erro) {
      setAviso({ tipo: "erro", texto: res.erro })
      return
    }
    const achadas = res.reservas ?? []
    setReservas(achadas)
    setConferidos(new Set())
    setAviso(
      achadas.length === 0
        ? { tipo: "info", texto: "Nenhuma reserva encontrada com esse dado." }
        : null
    )
  }, [])

  async function confirmar(r: ReservaNaPorta) {
    setConfirmando(r.cupomId)
    const res = await registrarEntradaAction({ cupomId: r.cupomId, metodo: metodoDaBusca })
    setConfirmando(null)
    if (res.erro) {
      setAviso({ tipo: "erro", texto: res.erro })
      return
    }
    setAviso(
      res.jaEstava
        ? { tipo: "info", texto: `${res.nome ?? "Esta pessoa"} já tinha entrada registrada.` }
        : { tipo: "ok", texto: `Entrada de ${res.nome ?? "hóspede"} registrada.` }
    )
    setReservas((atual) =>
      atual.map((x) =>
        x.cupomId === r.cupomId ? { ...x, situacao: "ja_entrou" } : x
      )
    )
  }

  const pararScanner = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanner(false)
  }, [])

  useEffect(() => pararScanner, [pararScanner])

  async function ligarScanner() {
    setAviso(null)
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      setScanner(true)
    } catch {
      setAviso({
        tipo: "erro",
        texto:
          "Não foi possível abrir a câmera. Confira a permissão de câmera do navegador e use a busca por nome ou CPF.",
      })
      pararScanner()
    }
  }

  // Liga o stream ao <video> depois que o elemento existe (ver a porta dos
  // eventos: dentro de ligarScanner o videoRef ainda era null).
  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!scanner || !video || !stream) return
    let vivo = true

    const iniciar = async () => {
      video.srcObject = stream
      video.play().catch(() => {
        setAviso({ tipo: "erro", texto: "A câmera abriu mas o vídeo não iniciou. Toque em Ler QR de novo." })
      })
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => {
            detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>
          }
        }
      ).BarcodeDetector
      const nativo = Detector ? new Detector({ formats: ["qr_code"] }) : null

      let lerComBiblioteca: (() => string | null) | null = null
      if (!nativo) {
        const jsQR = (await import("jsqr")).default
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        lerComBiblioteca = () => {
          if (!ctx || !video.videoWidth) return null
          const escala = Math.min(1, 640 / video.videoWidth)
          canvas.width = Math.round(video.videoWidth * escala)
          canvas.height = Math.round(video.videoHeight * escala)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height)
          return jsQR(imagem.data, imagem.width, imagem.height, { inversionAttempts: "dontInvert" })?.data ?? null
        }
      }

      const laco = async () => {
        if (!vivo || !streamRef.current) return
        try {
          const bruto = nativo
            ? ((await nativo.detect(video))[0]?.rawValue ?? null)
            : (lerComBiblioteca?.() ?? null)
          const token = bruto ? extrairToken(bruto) : null
          if (token) {
            vivo = false
            pararScanner()
            setTermo(token)
            await buscar(token, "qr")
            return
          }
        } catch {
          // quadro ruim: segue tentando
        }
        if (vivo) setTimeout(laco, nativo ? 250 : 400)
      }
      laco()
    }
    iniciar()

    return () => {
      vivo = false
      video.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanner])

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <IdCard className="size-5 shrink-0" />
          Confira um documento oficial com foto antes de registrar a entrada.
        </p>
        {scannerDisponivel && !scanner && (
          <Button type="button" size="lg" variant="outline" onClick={ligarScanner}>
            <Camera />
            Ler QR
          </Button>
        )}
        {scanner && (
          <Button type="button" size="lg" variant="outline" onClick={pararScanner}>
            <X />
            Fechar câmera
          </Button>
        )}
      </div>

      <div
        className={
          scanner
            ? "mx-auto w-full max-w-md overflow-hidden rounded-lg border bg-black"
            : "hidden"
        }
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="aspect-[3/4] w-full object-cover sm:aspect-video"
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          buscar(termo, "busca")
        }}
        className="flex gap-2"
      >
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome ou CPF do hóspede"
          className="h-14 text-lg"
          autoFocus
        />
        <Button type="submit" size="lg" className="h-14 px-6" disabled={buscando} aria-label="Buscar">
          {buscando ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
      </form>

      {aviso && (
        <Alert
          variant={aviso.tipo === "ok" ? "success" : aviso.tipo === "erro" ? "destructive" : "info"}
        >
          <AlertDescription className="text-base">{aviso.texto}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3">
        {reservas.map((r) => {
          const podeEntrar = r.situacao === "pode_entrar"
          const conferido = conferidos.has(r.cupomId)
          return (
            <div key={r.cupomId} className="grid gap-3 rounded-lg border p-4">
              <div className="min-w-0">
                <p className="text-lg font-medium">{r.nome ?? "—"}</p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  CPF {r.cpfMascarado} · estadia {dataBR(r.checkIn)} a {dataBR(r.checkOut)}
                  {r.quarto ? ` · quarto ${r.quarto} do convênio` : ""}
                </p>
                {!podeEntrar && (
                  <Badge
                    className="mt-1"
                    variant={r.situacao === "ja_entrou" ? "success" : "destructive"}
                  >
                    {ROTULO[r.situacao]}
                  </Badge>
                )}
              </div>
              {podeEntrar && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-base">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={conferido}
                      onChange={(e) => {
                        const proximo = new Set(conferidos)
                        if (e.target.checked) proximo.add(r.cupomId)
                        else proximo.delete(r.cupomId)
                        setConferidos(proximo)
                      }}
                    />
                    Conferi o documento oficial com foto
                  </label>
                  <Button
                    type="button"
                    size="lg"
                    className="h-14 w-full px-6 sm:ml-auto sm:w-auto"
                    disabled={!conferido || confirmando === r.cupomId}
                    onClick={() => confirmar(r)}
                  >
                    {confirmando === r.cupomId ? <Loader2 className="animate-spin" /> : <Check />}
                    Registrar entrada
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
