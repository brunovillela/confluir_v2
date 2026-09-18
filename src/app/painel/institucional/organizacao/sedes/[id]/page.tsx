import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { listarSedes } from "@/lib/db/organizacao"

import { AbrirFormulario } from "../../abrir-formulario"
import { SedeForm } from "../../organizacao-forms"

export const metadata: Metadata = { title: "Sede — Confluir" }

/** Uma sede: endereço e telefones (rodapé dos ofícios), com "Editar sede". */
export default async function SedePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("configuracoes")
  const { id } = await params
  const { sedes } = await listarSedes()
  const sede = sedes.find((s) => s.id === id)
  if (!sede) notFound()

  const linhas: [string, string | null][] = [
    ["Logradouro", [sede.logradouro, sede.numero].filter(Boolean).join(", ") || null],
    ["Complemento", sede.complemento],
    ["Bairro", sede.bairro],
    ["Cidade", [sede.cidade, sede.estado].filter(Boolean).join("/") || null],
    ["CEP", sede.cep],
    ["Telefones", sede.telefones],
  ]

  return (
    <>
      <RotuloTrilha valores={{ sedes: "Sedes", [id]: sede.nome ?? "Sede" }} />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/organizacao">
            <ArrowLeft />
            Organização
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <MapPin className="text-muted-foreground size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{sede.nome ?? "Sede"}</h1>
      </div>

      <Card>
        <CardContent>
          <AbrirFormulario
            rotulo="Editar sede"
            resumo={
              <div className="grid gap-2">
                <p className="font-medium">Endereço e telefones</p>
                <p className="text-muted-foreground text-xs">Compõem o rodapé dos ofícios.</p>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {linhas.map(([rotulo, valor]) => (
                    <div key={rotulo}>
                      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
                      <dd>{valor ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            }
          >
            <SedeForm sede={sede} />
          </AbrirFormulario>
        </CardContent>
      </Card>
    </>
  )
}
