import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_TIPO_BENEFICIARIO } from "@/lib/custeio-constantes"
import { buscarFinalidade, listarFinalidades } from "@/lib/db/custeio"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { podeAcessar } from "@/lib/permissoes"

import { FinalidadeForm } from "./finalidade-form"

export const metadata: Metadata = {
  title: "Finalidades de custeio — Confluir",
}

export default async function FinalidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; editar?: string }>
}) {
  const sessao = await requirePermissao("custeio_institucional", [
    "custeio_institucional_edicao",
  ])
  const podeEditar = podeAcessar(
    sessao.permissoes,
    "custeio_institucional_edicao"
  )
  const brutos = await searchParams

  const [finalidades, centros] = await Promise.all([
    listarFinalidades(true),
    listarCentrosCusto(),
  ])
  const nomeCentro = new Map(
    centros.map((c) => [
      c.id,
      [c.acesso, c.nome_da_conta].filter(Boolean).join(" — "),
    ])
  )
  const centrosOpcoes = centros.map((c) => ({
    id: c.id,
    nome: [c.acesso, c.nome_da_conta].filter(Boolean).join(" — "),
  }))

  const emEdicao = brutos.editar
    ? await buscarFinalidade(brutos.editar)
    : null
  const aqui = "/painel/institucional/custeios/finalidades"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/custeios">
            <ArrowLeft />
            Custeio institucional
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Finalidades de custeio
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          As finalidades classificam cada custeio e definem o centro de custo
          padrão herdado pelas ordens.
        </p>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Finalidade salva.</AlertDescription>
        </Alert>
      )}

      {podeEditar && emEdicao && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar finalidade</CardTitle>
          </CardHeader>
          <CardContent>
            <FinalidadeForm
              finalidade={emEdicao}
              centrosCusto={centrosOpcoes}
              aoCancelarHref={aqui}
            />
          </CardContent>
        </Card>
      )}

      {podeEditar && !emEdicao && (
        <GrupoColapsavel
          titulo="Nova finalidade"
          descricao="Cadastre finalidades específicas da sua organização"
        >
          <FinalidadeForm centrosCusto={centrosOpcoes} aoCancelarHref={aqui} />
        </GrupoColapsavel>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finalidades cadastradas</CardTitle>
          <CardDescription>{finalidades.length} finalidade(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {finalidades.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma finalidade cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Beneficiário sugerido</TableHead>
                  <TableHead>Centro de custo padrão</TableHead>
                  <TableHead>Situação</TableHead>
                  {podeEditar && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalidades.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell className="text-sm">
                      {ROTULO_TIPO_BENEFICIARIO[f.tipo_beneficiario_sugerido] ??
                        "Livre"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {f.centro_custo_despesa_id
                        ? (nomeCentro.get(f.centro_custo_despesa_id) ?? "—")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {f.ativa ? (
                        <Badge variant="outline">Ativa</Badge>
                      ) : (
                        <Badge variant="secondary">Inativa</Badge>
                      )}
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`${aqui}?editar=${f.id}`}>Editar</Link>
                        </Button>
                      </TableCell>
                    )}
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
