"use client"

import { useActionState, useRef, useState } from "react"
import { Camera, Loader2, Trash2 } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"
import { iniciais } from "@/lib/texto"

import { removerFotoAction, trocarFotoAction } from "./actions"

const LADO = 512

/**
 * Recorta o centro da imagem num quadrado de 512 px e gera JPEG: a foto
 * aparece em círculo de no máximo 64 px, e a do celular (3–8 MB) passaria do
 * limite da server action. Se o navegador não conseguir ler a imagem (HEIC,
 * por exemplo), envia a original e o servidor valida o tipo.
 */
async function prepararFoto(arquivo: File): Promise<File> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = falha
      i.src = url
    })
    const lado = Math.min(img.naturalWidth, img.naturalHeight)
    const destino = Math.min(LADO, lado)
    const canvas = document.createElement("canvas")
    canvas.width = destino
    canvas.height = destino
    const ctx = canvas.getContext("2d")
    if (!ctx) return arquivo
    ctx.fillStyle = "#fff" // PNG transparente não vira fundo preto no JPEG
    ctx.fillRect(0, 0, destino, destino)
    ctx.drawImage(
      img,
      (img.naturalWidth - lado) / 2,
      (img.naturalHeight - lado) / 2,
      lado,
      lado,
      0,
      0,
      destino,
      destino
    )
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88))
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : arquivo
  } catch {
    return arquivo
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Avatar do cabeçalho do perfil com a câmera para trocar; `children` é o bloco do nome. */
export function FotoPerfil({
  nome,
  fotoUrl,
  children,
}: {
  nome: string | null
  fotoUrl: string | null
  children: React.ReactNode
}) {
  const [estadoTroca, trocar, trocando] = useActionState<EstadoForm, FormData>(trocarFotoAction, {})
  const [estadoRemocao, remover, removendo] = useActionState<EstadoForm, FormData>(removerFotoAction, {})
  const [preparando, setPreparando] = useState(false)
  const [ultimo, setUltimo] = useState<"troca" | "remocao" | null>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const ocupado = preparando || trocando || removendo
  const estado = ultimo === "remocao" ? estadoRemocao : ultimo === "troca" ? estadoTroca : {}

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative shrink-0">
        <Avatar className="size-16">
          {fotoUrl && <AvatarImage src={fotoUrl} alt="" className="object-cover" />}
          <AvatarFallback className="text-lg">{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={ocupado}
          aria-label={fotoUrl ? "Trocar foto" : "Adicionar foto"}
          title={fotoUrl ? "Trocar foto" : "Adicionar foto"}
          className="bg-primary text-primary-foreground ring-background hover:bg-primary/90 absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full ring-2 transition-colors disabled:opacity-70"
        >
          {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        </button>
        <form ref={formulario} action={trocar} className="hidden">
          <input
            ref={entrada}
            name="foto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const original = e.target.files?.[0]
              if (!original || !entrada.current) return
              setPreparando(true)
              const pronta = await prepararFoto(original)
              const dt = new DataTransfer()
              dt.items.add(pronta)
              entrada.current.files = dt.files
              setPreparando(false)
              setUltimo("troca")
              formulario.current?.requestSubmit()
            }}
          />
        </form>
      </div>
      <div className="grid gap-1">
        {children}
        <div className="flex flex-wrap items-center gap-x-3">
          {fotoUrl && (
            <form action={remover} onSubmit={() => setUltimo("remocao")}>
              <Button
                type="submit"
                variant="link"
                size="sm"
                disabled={ocupado}
                className="text-muted-foreground h-auto p-0 text-xs"
              >
                <Trash2 className="size-3" />
                Remover foto
              </Button>
            </form>
          )}
          {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
        </div>
      </div>
    </div>
  )
}
