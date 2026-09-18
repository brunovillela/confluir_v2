import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"

/** Cabeçalho das páginas do mandato (Instâncias, Liberações, Atas). */
export function CabecalhoMandato({
  mandatoId,
  mandato,
  titulo,
  descricao,
  acoes,
}: {
  mandatoId: string
  mandato: string | null
  titulo: string
  descricao: string
  acoes?: React.ReactNode
}) {
  const nome = mandato ? `Mandato ${mandato}` : "Mandato"
  return (
    <>
      <RotuloTrilha
        valores={{ [mandatoId]: nome, instancias: "Instâncias", liberacoes: "Liberações", atas: "Atas" }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/painel/institucional/diretoria/${mandatoId}`}>
            <ArrowLeft />
            {nome}
          </Link>
        </Button>
        {acoes}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-muted-foreground mt-1 text-xs">{descricao}</p>
      </div>
    </>
  )
}
