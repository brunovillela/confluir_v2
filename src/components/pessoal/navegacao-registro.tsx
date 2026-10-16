import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"

type Destino = { href: string; rotulo: string } | null

/**
 * Anterior/próximo do nível 3, em dois eixos: dentro da remessa (o próximo
 * funcionário — conferir em sequência) e na pessoa (o mês anterior/seguinte).
 */
export function NavegacaoRegistro({
  eixos,
}: {
  eixos: { titulo: string; anterior: Destino; proximo: Destino }[]
}) {
  const visiveis = eixos.filter((e) => e.anterior || e.proximo)
  if (visiveis.length === 0) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {visiveis.map((e) => (
        <div key={e.titulo} className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5">
          <Botao destino={e.anterior} lado="anterior" />
          <span className="text-muted-foreground text-center text-xs">{e.titulo}</span>
          <Botao destino={e.proximo} lado="proximo" />
        </div>
      ))}
    </div>
  )
}

function Botao({ destino, lado }: { destino: Destino; lado: "anterior" | "proximo" }) {
  if (!destino) return <span className="w-28" aria-hidden />
  return (
    <Button variant="ghost" size="sm" asChild className="max-w-[45%]">
      <Link href={destino.href} title={destino.rotulo}>
        {lado === "anterior" && <ChevronLeft />}
        <span className="truncate">{destino.rotulo}</span>
        {lado === "proximo" && <ChevronRight />}
      </Link>
    </Button>
  )
}
