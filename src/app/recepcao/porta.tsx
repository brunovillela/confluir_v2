"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { Camera, Check, Loader2, Search, UserCheck, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { buscarAction, confirmarChegadaAction } from "./actions"

/**
 * Tela da porta. Tudo aqui é maior que o normal do sistema porque quem opera
 * está de pé, com fila na frente e às vezes num tablet.
 */

type Pessoa = {
  inscricaoId: string
  nome: string | null
  cpf: string | null
  situacao: string
  fotoUrl: string | null
  ehConvidado: boolean
  presenteHoje: boolean
  presencaEm: string | null
}

type Aviso = { tipo: "ok" | "erro" | "info"; texto: string } | null

/** UUID solto ou dentro de uma URL (o QR carrega o endereço da pessoa). */
function extrairToken(texto: string): string | null {
  const m = texto.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  )
  return m ? m[0] : null
}

function mascararCpf(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return "—"
  // Só os dígitos do meio: o suficiente para conferir, sem expor o documento
  // inteiro numa tela que fica virada para a fila.
  return `•••.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-••`
}

export function Porta({
  eventoId,
  diaId,
  presentesIniciais,
}: {
  eventoId: string
  diaId: string
  presentesIniciais: number
}) {
  const [termo, setTermo] = useState("")
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [presentes, setPresentes] = useState(presentesIniciais)
  const [scanner, setScanner] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const buscaRef = useRef<HTMLInputElement>(null)

  // Ler QR tem dois caminhos: o BarcodeDetector nativo (Chrome/Android, mais
  // rápido e sem custo de bateria) e, onde ele não existe — Safari, e portanto
  // TODO navegador de iPhone —, a biblioteca jsQR carregada sob demanda. O que
  // decide se o botão aparece é só ter câmera.
  //
  // useSyncExternalStore em vez de efeito com setState: o servidor devolve
  // false, o cliente devolve a capacidade real, e o React concilia sem
  // disparar renderização em cascata.
  const scannerDisponivel = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false
  )

  const buscar = useCallback(
    async (valor: string, metodo: "qr" | "busca") => {
      const t = valor.trim()
      if (t.length < 3) {
        setPessoas([])
        return
      }
      setBuscando(true)
      const res = await buscarAction({ eventoId, diaId, termo: t })
      setBuscando(false)
      if (res.erro) {
        setAviso({ tipo: "erro", texto: res.erro })
        return
      }
      const achados = res.pessoas ?? []
      setPessoas(achados)
      // QR que casa com exatamente uma pessoa confirma direto: na porta, um
      // toque a menos por pessoa é fila menor.
      if (metodo === "qr" && achados.length === 1 && !achados[0].presenteHoje) {
        await confirmar(achados[0], "qr")
      } else if (achados.length === 0) {
        setAviso({ tipo: "info", texto: "Ninguém encontrado com esse dado." })
      } else {
        setAviso(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventoId, diaId]
  )

  async function confirmar(p: Pessoa, metodo: "qr" | "busca") {
    const res = await confirmarChegadaAction({
      inscricaoId: p.inscricaoId,
      diaId,
      metodo,
    })
    if (res.erro) {
      setAviso({ tipo: "erro", texto: res.erro })
      return
    }
    if (res.jaEstava) {
      setAviso({
        tipo: "info",
        texto: `${res.nome ?? "Esta pessoa"} já tinha entrado hoje.`,
      })
    } else {
      setPresentes((n) => n + 1)
      setAviso({ tipo: "ok", texto: `${res.nome ?? "Presença"} confirmada.` })
    }
    setPessoas((atual) =>
      atual.map((x) =>
        x.inscricaoId === p.inscricaoId ? { ...x, presenteHoje: true } : x
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

  /**
   * Liga o stream ao <video> e roda a leitura.
   *
   * Precisa ser um EFEITO, e não a continuação de `ligarScanner`: o elemento
   * de vídeo só existe depois que o React re-renderiza com `scanner = true`.
   * Fazendo dentro da função, `videoRef.current` ainda era null — a câmera
   * acendia (a luz do aparelho ligava) e a tela ficava preta.
   */
  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!scanner || !video || !stream) return

    let vivo = true

    const iniciar = async () => {
      video.srcObject = stream
      video.play().catch(() => {
        setAviso({
          tipo: "erro",
          texto:
            "A câmera abriu mas o vídeo não iniciou. Toque em Ler QR de novo.",
        })
      })

      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => {
            detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>
          }
        }
      ).BarcodeDetector
      const nativo = Detector ? new Detector({ formats: ["qr_code"] }) : null

      // Caminho da biblioteca: o quadro é copiado para um canvas fora da tela
      // e REDUZIDO antes da varredura. Ler 1080p em JavaScript a cada quadro
      // derruba o desempenho de celular antigo — e é justamente ele que vai
      // para a porta.
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
          const achado = jsQR(imagem.data, imagem.width, imagem.height, {
            inversionAttempts: "dontInvert",
          })
          return achado?.data ?? null
        }
      }

      const laco = async () => {
        if (!vivo || !streamRef.current) return
        try {
          const bruto = nativo
            ? ((await nativo.detect(video))[0]?.rawValue ?? null)
            : (lerComBiblioteca?.() ?? null)
          if (bruto) {
            const token = extrairToken(bruto)
            if (token) {
              vivo = false
              pararScanner()
              setTermo(token)
              await buscar(token, "qr")
              return
            }
          }
        } catch {
          // quadro ruim: segue tentando
        }
        // A biblioteca custa mais por quadro que o leitor nativo; um respiro
        // maior mantém a câmera fluida.
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
        <div className="flex items-center gap-2">
          <UserCheck className="size-5" />
          <span className="text-lg font-medium">
            {presentes} {presentes === 1 ? "pessoa" : "pessoas"} no evento
          </span>
        </div>
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
        {!scannerDisponivel && (
          <span className="text-muted-foreground text-sm">
            Este dispositivo não tem câmera disponível. Use a busca por nome ou
            CPF.
          </span>
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
          ref={buscaRef}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome ou CPF"
          className="h-14 text-lg"
          autoFocus
        />
        <Button type="submit" size="lg" className="h-14 px-6" disabled={buscando}>
          {buscando ? <Loader2 className="animate-spin" /> : <Search />}
        </Button>
      </form>

      {aviso && (
        <Alert
          variant={
            aviso.tipo === "ok"
              ? "success"
              : aviso.tipo === "erro"
                ? "destructive"
                : "info"
          }
        >
          <AlertDescription className="text-base">{aviso.texto}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3">
        {pessoas.map((p) => (
          <div
            key={p.inscricaoId}
            className="flex flex-wrap items-center gap-4 rounded-lg border p-4"
          >
            {p.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.fotoUrl}
                alt=""
                className="size-20 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="bg-muted text-muted-foreground flex size-20 shrink-0 items-center justify-center rounded-md text-xs">
                sem foto
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-medium">{p.nome ?? "—"}</p>
              <p className="text-muted-foreground text-sm tabular-nums">
                {mascararCpf(p.cpf)}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {p.situacao !== "confirmada" && (
                  <Badge variant="destructive">{p.situacao}</Badge>
                )}
                {p.ehConvidado && <Badge variant="secondary">convidado</Badge>}
                {p.presenteHoje && <Badge variant="success">já entrou</Badge>}
              </div>
            </div>

            <Button
              type="button"
              size="lg"
              className="h-14 px-6"
              disabled={p.presenteHoje || p.situacao !== "confirmada"}
              onClick={() => confirmar(p, "busca")}
            >
              <Check />
              {p.presenteHoje ? "Entrou" : "Confirmar"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
