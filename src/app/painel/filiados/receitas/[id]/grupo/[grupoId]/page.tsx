import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeCheck, Building2, ChevronRight } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { grupoParaRecebimento, obterGrupo } from "@/lib/db/grupos-empresariais"
import { detalheRemessa } from "@/lib/db/receitas"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { EnviarContribuicoes } from "../../[fonteId]/enviar-contribuicoes"

export const metadata: Metadata = { title: "Relação do grupo — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Contribuição centralizada (09/10/2026): o grupo empresarial manda UMA
 * relação para todas as empresas dele. Cada linha é casada no grupo e gravada
 * na fonte do trabalhador — a remessa continua fechando por empresa.
 */
export default async function GrupoNaRemessaPage({
  params,
}: {
  params: Promise<{ id: string; grupoId: string }>
}) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const { id, grupoId } = await params
  if (!UUID.test(id) || !UUID.test(grupoId)) notFound()

  const [detalhe, grupo, recebimento] = await Promise.all([
    detalheRemessa(id),
    obterGrupo(grupoId),
    grupoParaRecebimento(grupoId),
  ])
  if (!detalhe || !grupo) notFound()
  const { remessa } = detalhe

  const porFonte = new Map(detalhe.fontes.map((f) => [f.id, f]))
  const representadas = grupo.membros.filter((m) => m.empresaId)
  const linhas = representadas.map((m) => ({ membro: m, dados: porFonte.get(m.empresaId!) }))
  const pagantes = linhas.reduce((s, l) => s + (l.dados?.pagantes ?? 0), 0)
  const total = linhas.reduce((s, l) => s + (l.dados?.total ?? 0), 0)
  const pagadora =
    "erro" in recebimento ? null : grupo.membros.find((m) => m.empresaId === recebimento.pagadoraId)

  return (
    <>
      <RotuloTrilha valores={{ [id]: `Remessa ${remessa.rotulo}`, [grupoId]: grupo.nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/receitas/${id}`}>
            <ArrowLeft />
            Remessa {remessa.rotulo}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{grupo.nome}</h1>
          <Badge variant="info">Contribuição centralizada</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Remessa {remessa.rotulo}
          {remessa.tipo ? ` · ${remessa.tipo}` : ""} · {representadas.length} empresa
          {representadas.length === 1 ? "" : "s"} representada{representadas.length === 1 ? "" : "s"} ·{" "}
          {pagantes.toLocaleString("pt-BR")} pagante{pagantes === 1 ? "" : "s"} ·{" "}
          {formatarMoeda(total)}
        </p>
      </div>

      {"erro" in recebimento ? (
        <Alert variant="warning">
          <AlertDescription>
            {recebimento.erro}{" "}
            <Link
              href={`/painel/representacao/empregadores/grupos/${grupo.id}`}
              className="underline underline-offset-2"
            >
              Abrir o grupo
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empresas do grupo nesta remessa</CardTitle>
              <CardDescription>
                O depósito do grupo é registrado na empresa pagadora
                {pagadora ? (
                  <>
                    {" "}
                    (
                    <Link
                      href={`/painel/filiados/receitas/${id}/${recebimento.pagadoraId}`}
                      className="underline underline-offset-2"
                    >
                      {pagadora.nome}
                    </Link>
                    )
                  </>
                ) : null}
                . Cada empresa abre a conferência dela.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Pagantes</TableHead>
                    <TableHead className="text-right">Valor informado</TableHead>
                    <TableHead>Recebimento</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(({ membro, dados }) => (
                    <TableRow key={membro.id}>
                      <TableCell className="max-w-64 font-medium">
                        <span className="block truncate">{membro.nome}</span>
                        {membro.empresaId === recebimento.pagadoraId && (
                          <Badge variant="outline" className="mt-0.5">
                            Pagadora
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(dados?.pagantes ?? 0).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(dados?.total ?? 0)}
                      </TableCell>
                      <TableCell>
                        {dados?.recebimento?.data || dados?.recebimento?.valor ? (
                          <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
                            <BadgeCheck className="text-success-fg size-3.5" />
                            {formatarData(dados.recebimento.data)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/painel/filiados/receitas/${id}/${membro.empresaId}`}
                          aria-label={`Abrir a conferência de ${membro.nome}`}
                        >
                          <ChevronRight className="text-muted-foreground size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {grupo.membros.length > representadas.length && (
                <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
                  <Building2 className="size-3.5" />
                  {grupo.membros.length - representadas.length} empresa(s) do grupo sem
                  trabalhadores representados não entram na remessa.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enviar a relação do grupo</CardTitle>
              <CardDescription>
                Uma lista só para todas as empresas. Cada trabalhador é procurado no grupo inteiro
                (CPF, matrícula em qualquer empresa do grupo, nome) e o pagamento vai para a empresa
                do vínculo dele. Quem não for encontrado, ou não tiver vínculo em aberto no grupo,
                fica na empresa pagadora para conferência.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnviarContribuicoes
                remessaId={id}
                fonteId={recebimento.pagadoraId}
                ativosNaoPagantes={[]}
                grupoId={grupo.id}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
