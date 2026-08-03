import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ScrollText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { listarDepartamentos, listarFornecedores } from "@/lib/db/compras"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { listarContratos, listarUsuariosAtivos } from "@/lib/db/veiculos"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { NovoContratoForm } from "./contrato-forms"

export const metadata: Metadata = { title: "Contratos de aluguel — Confluir" }

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string }>
}) {
  const sessao = await requirePermissao("veiculos_gestao")
  const brutos = await searchParams
  const situacao =
    brutos.situacao === "finalizados" || brutos.situacao === "todos"
      ? brutos.situacao
      : "vigentes"

  const [{ contratos }, fornecedores, usuarios, departamentos, centros] =
    await Promise.all([
      listarContratos({ situacao }),
      listarFornecedores(),
      listarUsuariosAtivos(),
      listarDepartamentos(),
      listarCentrosCusto(),
    ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Contratos de aluguel
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Locação de veículos: locadora, vigência, veículos e mensalidades
        </p>
      </div>

      {contratos.some((c) => !c.finalizado && c.qtdVeiculos === 0) &&
        situacao === "vigentes" && (
          <Alert variant="info">
            <AlertDescription>
              Há contrato vigente sem veículo vinculado — o vínculo
              veículo↔contrato é feito na ficha do veículo (o legado do Bubble
              não trazia essa ligação).
            </AlertDescription>
          </Alert>
        )}

      <GrupoColapsavel
        titulo="Novo contrato"
        descricao="Locadora do cadastro de fornecedores do módulo Compras"
      >
        <NovoContratoForm
          fornecedores={fornecedores.map((f) => ({
            id: f.id,
            nome: f.nome,
            cnpj_cpf: f.cnpj_cpf,
            bloqueado: f.bloqueado,
          }))}
          usuarios={usuarios.map((u) => ({ id: u.id, rotulo: u.nome }))}
          departamentos={departamentos.map((d) => ({ id: d.id, rotulo: d.nome }))}
          centrosCusto={centros.map((c) => ({
            id: String(c.id),
            rotulo:
              [c.classificador, c.nome_da_conta].filter(Boolean).join(" - ") ||
              "(sem nome)",
          }))}
          responsavelPadraoId={sessao.usuario.id}
        />
      </GrupoColapsavel>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/veiculos/contratos"
      >
        <select
          name="situacao"
          defaultValue={situacao}
          className="border-input bg-background text-foreground h-9 max-w-52 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
        >
          <option value="vigentes">Vigentes</option>
          <option value="finalizados">Finalizados</option>
          <option value="todos">Todos</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {contratos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ScrollText className="mx-auto mb-2 size-5" />
              Nenhum contrato encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Locadora</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead className="text-right">Mensalidade</TableHead>
                  <TableHead className="text-right">Veículos</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/painel/veiculos/contratos/${c.id}`}
                        className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                      >
                        {c.numero ?? "(sem número)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="line-clamp-1">
                        {c.fornecedorNome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="text-muted-foreground line-clamp-1 text-sm">
                        {c.finalidade ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(c.vigencia_inicio)} →{" "}
                      {formatarData(c.vigencia_termino)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(c.valor_mensal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.qtdVeiculos}
                    </TableCell>
                    <TableCell>
                      {c.finalizado ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Finalizado
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success-fg"
                        >
                          Vigente
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
