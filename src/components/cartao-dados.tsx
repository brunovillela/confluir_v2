import Link from "next/link"
import type { ReactNode } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type CampoDados = {
  rotulo: string
  valor: ReactNode
  /** Ocupa a linha inteira (textos longos). */
  largo?: boolean
}

/**
 * Os dados de um registro para LER, com o botão "Editar" que leva ao
 * formulário (`editarHref`, em geral `?editar=1` na própria página) — padrão
 * do Confluir: formulário não fica aberto por padrão (ver
 * [[confluir-ux-formularios]]). Campo sem valor aparece como "—". Sem
 * `editarHref` (quem só consulta), o botão não aparece.
 */
export function CartaoDados({
  titulo,
  descricao,
  editarHref,
  campos,
  children,
}: {
  titulo: string
  descricao?: ReactNode
  editarHref?: string
  campos: CampoDados[]
  /** Conteúdo extra abaixo dos campos. */
  children?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle className="text-base">{titulo}</CardTitle>
          {descricao && <CardDescription>{descricao}</CardDescription>}
        </div>
        {editarHref && (
          <Button variant="outline" size="sm" asChild>
            <Link href={editarHref}>
              <Pencil />
              Editar
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.rotulo} className={c.largo ? "sm:col-span-2" : undefined}>
              <dt className="text-muted-foreground text-xs">{c.rotulo}</dt>
              <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                {c.valor === null || c.valor === undefined || c.valor === "" ? "—" : c.valor}
              </dd>
            </div>
          ))}
        </dl>
        {children}
      </CardContent>
    </Card>
  )
}
