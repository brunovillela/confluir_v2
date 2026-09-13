import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, MonitorPlay } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { descreverUltimoAcesso } from "@/lib/comunicacao-slides-constantes"
import { listarConjuntosSlides } from "@/lib/db/comunicacao-slides"

import { NovoConjuntoForm } from "./slides-forms"

export const metadata: Metadata = { title: "Slides para TV — Confluir" }

export default async function SlidesTvPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("noticias")
  const { excluido } = await searchParams
  const { ativo, conjuntos } = await listarConjuntosSlides()
  const agora = new Date()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao">
            <ArrowLeft />
            Comunicação
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Slides para TV</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Conjuntos de slides para as televisões da entidade. Cada conjunto tem
          um link público: abra-o no navegador da TV e ela passa os slides, com
          o logo e a faixa de notícias, atualizando sozinha quando você muda algo
          aqui.
        </p>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não foi criado — rode{" "}
            <code>supabase/comunicacao-slides-tv.sql</code> no SQL Editor do
            Supabase para ativar.
          </AlertDescription>
        </Alert>
      )}

      {excluido === "1" && (
        <Alert variant="success">
          <AlertDescription>Conjunto excluído.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Conjunto</TableHead>
              <TableHead>Orientação</TableHead>
              <TableHead className="text-right">Slides no ar</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="hidden md:table-cell">TV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conjuntos.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <MonitorPlay className="size-6" />
                    <p className="text-sm">
                      Nenhum conjunto ainda — crie o primeiro abaixo.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {conjuntos.map((c) => {
              const tv = descreverUltimoAcesso(c.ultimoAcesso, agora)
              return (
                <TableRow key={c.id}>
                  <TableCell className="max-w-64 font-medium">
                    <Link
                      href={`/painel/comunicacao/slides/${c.id}`}
                      className="block truncate hover:underline"
                    >
                      {c.nome}
                    </Link>
                    <span className="text-muted-foreground block truncate text-xs">
                      /tv/{c.slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {c.orientacao}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.noAr}
                    <span className="text-muted-foreground"> / {c.totalSlides}</span>
                  </TableCell>
                  <TableCell>
                    {c.publicado ? (
                      <Badge variant="outline" className="border-success/40 text-success-fg">
                        Publicado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Fora do ar
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {tv.noAr ? (
                      <span className="text-success-fg font-medium">{tv.rotulo}</span>
                    ) : (
                      tv.rotulo
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Novo conjunto</CardTitle>
          <CardDescription>
            Um conjunto por TV (ou grupo de TVs iguais). Para a mesma
            programação em TVs deitadas e em pé, crie um e depois use
            &quot;Duplicar&quot; com a outra orientação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovoConjuntoForm />
        </CardContent>
      </Card>
    </>
  )
}
