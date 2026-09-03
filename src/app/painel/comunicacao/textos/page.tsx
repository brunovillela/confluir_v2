import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Radio, ScrollText } from "lucide-react"

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
import {
  listarTextos,
  objetivoPorValor,
  obterPolitica,
} from "@/lib/db/comunicacao-textos"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Assistente de redação — Confluir" }

export default async function TextosPage() {
  await requirePermissao("noticias")

  const [{ ativo, linhas }, { politica }] = await Promise.all([
    listarTextos(),
    obterPolitica(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao">
            <ArrowLeft />
            Comunicação
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Assistente de redação
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              A IA escreve a partir da política editorial da entidade, das
              convenções do canal escolhido e dos fatos que você informar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/painel/comunicacao/textos/novo">
                <Plus />
                Novo texto
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/comunicacao/textos/politica">
                <ScrollText />
                Política editorial
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/comunicacao/textos/canais">
                <Radio />
                Locais de distribuição
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do assistente ainda não existem no banco. Rode
            <code className="mx-1">supabase/comunicacao-assistente-textos.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {ativo && !politica.politica.trim() && (
        <Alert>
          <AlertDescription>
            A política editorial ainda não foi escrita. O texto sai genérico sem
            ela — vale preencher antes, é uma vez só.
          </AlertDescription>
        </Alert>
      )}

      {ativo && (
        <Card>
          <CardHeader>
            <CardTitle>Textos solicitados</CardTitle>
            <CardDescription>
              {linhas.length === 0
                ? "Nenhum texto ainda. Comece pelo botão Novo texto."
                : `${linhas.length} pedido(s). As regerações ficam agrupadas no pedido de origem.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linhas.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assunto</TableHead>
                      <TableHead>Objetivo</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead className="text-right">Caracteres</TableHead>
                      <TableHead>Solicitado por</TableHead>
                      <TableHead>Quando</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Link
                            href={`/painel/comunicacao/textos/${t.id}`}
                            className="font-medium hover:underline"
                          >
                            {t.assunto || t.titulo || "(sem assunto)"}
                          </Link>
                          {t.versao > 1 && (
                            <Badge variant="secondary" className="ml-2">
                              v{t.versao}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {objetivoPorValor(t.objetivo)?.rotulo ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.canal_nome ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(t.texto_final ?? t.texto_gerado ?? "").length || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.solicitadoPorNome ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatarDataHora(t.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
