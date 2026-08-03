import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Captura de tela dentro de um artigo. Enquanto o print não foi coletado
 * (ex.: aguardando telas com dados fictícios/anonimizados), basta omitir
 * `src` — o componente mostra um marcador com o texto alternativo, deixando
 * claro onde a imagem entra sem quebrar o artigo.
 *
 * As imagens ficam em /public/ajuda/<area>/<arquivo>.png — passe apenas o
 * caminho a partir de /ajuda, ex.: src="pessoal/funcionarios-lista.png".
 */
export function Print({
  src,
  alt,
  legenda,
  className,
}: {
  src?: string
  alt: string
  legenda?: string
  className?: string
}) {
  return (
    <figure className={cn("my-5", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/ajuda/${src}`}
          alt={alt}
          className="w-full rounded-lg border shadow-sm"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="border-muted-foreground/30 text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center"
        >
          <ImageOff className="size-6" />
          <span className="text-sm font-medium">Captura pendente</span>
          <span className="max-w-md text-xs">{alt}</span>
        </div>
      )}
      {legenda && (
        <figcaption className="text-muted-foreground mt-2 text-center text-xs">
          {legenda}
        </figcaption>
      )}
    </figure>
  )
}
