import type { ComponentType } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Card de navegação para um hub de módulo/área. Padrão único do sistema: ícone
 * laranja (`text-primary`) no topo, título, descrição menor e, opcionalmente,
 * um indicador (ex.: "128 registros") ou o selo "Em breve". Substitui os
 * `CardArea`/`AreaCard` que eram duplicados em cada hub.
 */
export function CartaoArea({
  titulo,
  descricao,
  href,
  icone: Icone,
  indicador,
  emBreve,
}: {
  titulo: string
  descricao: string
  href?: string | null
  icone: ComponentType<{ className?: string }>
  indicador?: string | null
  emBreve?: boolean
}) {
  const clicavel = Boolean(href) && !emBreve

  const conteudo = (
    <Card
      className={
        clicavel
          ? "group-hover:border-primary/40 h-full transition-colors"
          : "h-full opacity-70"
      }
    >
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <Icone className="text-primary size-6" />
          {emBreve && <Badge variant="secondary">Em breve</Badge>}
        </div>
        <p className="mt-3 font-medium">{titulo}</p>
        <p className="text-muted-foreground mt-1 text-xs">{descricao}</p>
        {indicador && (
          <p className="text-muted-foreground mt-2 text-xs tabular-nums">
            {indicador}
          </p>
        )}
      </CardContent>
    </Card>
  )

  if (!clicavel) return <div className="group">{conteudo}</div>
  return (
    <Link href={href!} className="group block">
      {conteudo}
    </Link>
  )
}
