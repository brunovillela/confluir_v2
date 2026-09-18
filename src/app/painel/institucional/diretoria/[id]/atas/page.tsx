import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_TIPO_REUNIAO } from "@/lib/atas-constantes"
import { listarAtas } from "@/lib/db/atas"
import { obterMandato } from "@/lib/db/diretoria"
import { formatarData } from "@/lib/formato"

import { CabecalhoMandato } from "../cabecalho-mandato"

export const metadata: Metadata = { title: "Atas do mandato — Confluir" }

/** Atas de reunião do mandato. */
export default async function AtasDoMandatoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { id } = await params
  const mandato = await obterMandato(id)
  if (!mandato) notFound()
  const atas = await listarAtas({ mandatoId: id })

  return (
    <>
      <CabecalhoMandato
        mandatoId={mandato.id}
        mandato={mandato.mandato}
        titulo="Atas de reunião"
        descricao="Reuniões deste mandato, com a ata em PDF"
        acoes={
          <Button size="sm" asChild>
            <Link href={`/painel/institucional/atas/novo?mandato=${mandato.id}`}>
              <Plus />
              Nova ata
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent>
          {atas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma ata registrada neste mandato.
            </p>
          ) : (
            <ul className="grid gap-2">
              {atas.map((a) => (
                <li key={a.id} className="border-b pb-2 last:border-b-0 last:pb-0">
                  <Link
                    href={`/painel/institucional/atas/${a.id}`}
                    className="text-primary line-clamp-1 font-medium hover:underline"
                  >
                    {a.titulo ?? "(sem título)"}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {a.data ? formatarData(a.data) : "sem data"} · {ROTULO_TIPO_REUNIAO[a.tipo]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
