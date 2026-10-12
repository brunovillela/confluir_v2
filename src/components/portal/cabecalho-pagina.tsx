import { createElement } from "react"

import { iconeDaSecao } from "./navegacao-portal"
import { VoltarPortal } from "./voltar-portal"

/**
 * Cabeçalho das páginas do portal (A184), igual em todas: o ícone da seção
 * (o mesmo da lateral), o h1, o subtítulo em text-xs — um degrau abaixo do
 * título, como no resto do sistema — e, quando houver, as ações à direita.
 * Nas subpáginas, o "voltar" da seção vem em cima (A173).
 *
 * Antes só Carteirinha e Contribuição tinham ícone, o subtítulo saía em dois
 * tamanhos e só Avisos tinha lugar para um botão.
 */
export function CabecalhoPagina({
  titulo,
  subtitulo,
  secao,
  acoes,
  voltar,
  className,
}: {
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  /** Rota da seção no menu ("/portal/hospedagem"): dá o ícone. */
  secao: string
  /** Botões e links da página, à direita do título (embaixo, no celular estreito). */
  acoes?: React.ReactNode
  /** Subpágina: para onde a seta volta e o nome da seção. */
  voltar?: { base: string; rotulo: string }
  className?: string
}) {
  // createElement: o ícone vem do mapa do menu, não é um componente criado aqui.
  const Icone = iconeDaSecao(secao)
  return (
    <div className={className}>
      {voltar && <VoltarPortal base={voltar.base} rotulo={voltar.rotulo} />}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
          {/* mt-1.5: o ícone (20 px) centrado na primeira linha do h1 (32 px de altura de linha). */}
          {Icone && createElement(Icone, { "aria-hidden": true, className: "text-muted-foreground mt-1.5 size-5 shrink-0" })}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{titulo}</h1>
            {subtitulo && <p className="text-muted-foreground mt-1 text-xs">{subtitulo}</p>}
          </div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{acoes}</div>}
      </div>
    </div>
  )
}
