import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, ReceiptText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { listarRpas, obterConfigRpa } from "@/lib/db/compras-rpa"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { ConfigRpaForm } from "./rpa-forms"

export const metadata: Metadata = { title: "RPA — Confluir" }

export default async function RpaPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ])
  const podeEditar = podeAcessar(
    sessao.permissoes,
    "aquisicoes_contratos_edicao"
  )
  const { excluido } = await searchParams
  const [{ ativo, linhas }, config] = await Promise.all([
    listarRpas(),
    obterConfigRpa(),
  ])

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/compras/contratos">
              <ArrowLeft />
              Contratos
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            RPA — Recibo de Pagamento a Autônomo
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Recibo emitido ao prestador autônomo, que baixa, assina e devolve —
            vale como comprovante fiscal do serviço. {linhas.length} recibo
            {linhas.length === 1 ? "" : "s"}.
          </p>
        </div>
        {podeEditar && (
          <Button asChild>
            <Link href="/painel/compras/contratos/rpa/novo">
              <Plus />
              Novo RPA
            </Link>
          </Button>
        )}
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não foi criado — rode{" "}
            <code>supabase/compras-rpa.sql</code> no SQL Editor do Supabase para
            ativar.
          </AlertDescription>
        </Alert>
      )}

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>RPA excluído.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nº</TableHead>
              <TableHead>Prestador</TableHead>
              <TableHead className="hidden sm:table-cell">Serviço em</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Retenções
              </TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="hidden lg:table-cell">Emitido por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <ReceiptText className="size-6" />
                    <p className="text-sm">Nenhum RPA emitido ainda.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {linhas.map((r) => {
              const retencoes =
                (r.inss ?? 0) + (r.irrf ?? 0) + (r.iss ?? 0)
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium tabular-nums">
                    <Link
                      href={`/painel/compras/contratos/rpa/${r.id}`}
                      className="hover:underline"
                    >
                      {r.numero ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    {r.fornecedorNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                    {r.data_servico ? formatarData(r.data_servico) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarMoeda(r.valor_bruto)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                    {formatarMoeda(retencoes)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatarMoeda(r.valor_liquido)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-40 truncate lg:table-cell">
                    {r.criadoPorNome ?? "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {podeEditar && (
        <GrupoColapsavel titulo="Tabelas de retenção (INSS, IRRF e ISS)">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Configuração das retenções
              </CardTitle>
              <CardDescription>
                Teto e alíquota do INSS, tabela progressiva do IRRF (com dedução
                por dependente) e alíquota padrão do ISS do município.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigRpaForm config={config} />
            </CardContent>
          </Card>
        </GrupoColapsavel>
      )}
    </>
  )
}
