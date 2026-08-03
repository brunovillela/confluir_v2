import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

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
  buscarHotel,
  listarFaturas,
  listarTarifas,
  urlArquivoHospedagem,
  usuariosDoHotel,
  type FaturaLinha,
} from "@/lib/db/hospedagem"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { HotelForm } from "../hotel-form"
import { Tarifas } from "./tarifas"
import { UsuariosHotel } from "./usuarios-hotel"

async function TabelaFaturas({ faturas }: { faturas: FaturaLinha[] }) {
  const urls = new Map<string, string | null>()
  for (const f of faturas) {
    urls.set(f.id, await urlArquivoHospedagem(f.nota_fiscal))
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead className="hidden sm:table-cell">Emitida em</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Reservas</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação da ordem</TableHead>
            <TableHead>Links</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faturas.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-muted-foreground h-16 text-center text-sm"
              >
                Nenhuma fatura aqui.
              </TableCell>
            </TableRow>
          )}
          {faturas.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono text-xs font-medium">
                {f.codigo ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {formatarData(f.created_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatarData(f.ordemVencimento)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {f.servicos.toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatarMoeda(f.valorTotal)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    f.ordemSituacao === "Paga"
                      ? "border-success/40 text-success-fg"
                      : f.ordemSituacao === "Cancelada"
                        ? "border-error/40 text-error-fg"
                        : "border-warning/40 text-warning-fg"
                  }
                >
                  {f.ordemSituacao ?? "Sem ordem"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs whitespace-nowrap">
                {f.ordem_pagamento_id && (
                  <Link
                    href={`/painel/financeiro/ordens/${f.ordem_pagamento_id}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Ordem
                  </Link>
                )}
                {urls.get(f.id) && (
                  <a
                    href={urls.get(f.id)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground ml-2 inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    DANFE <ExternalLink className="size-3" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export const metadata: Metadata = { title: "Hotel parceiro — Confluir" }

export default async function HotelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("filiacao_hospedagens_gestao")

  const { id } = await params
  const [hotel, tarifas, acessos, faturas] = await Promise.all([
    buscarHotel(id),
    listarTarifas(id),
    usuariosDoHotel(id),
    listarFaturas(id),
  ])
  if (!hotel) notFound()

  const abertas = faturas.filter((f) => f.aberta)
  const fechadas = faturas.filter((f) => !f.aberta)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem/hoteis">
            <ArrowLeft />
            Hotéis parceiros
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {hotel.nome ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastro do hotel conveniado e tarifas por acomodação.
        </p>
      </div>

      <HotelForm hotel={hotel} />
      <Tarifas hotelId={hotel.id} tarifas={tarifas} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturas em aberto</CardTitle>
          <CardDescription>
            Faturamentos emitidos pelo hotel aguardando autorização ou pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaFaturas faturas={abertas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturas fechadas</CardTitle>
          <CardDescription>Faturas com a ordem de pagamento paga.</CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaFaturas faturas={fechadas} />
        </CardContent>
      </Card>
      <UsuariosHotel
        hotelId={hotel.id}
        disponivel={acessos.disponivel}
        usuarios={acessos.usuarios.map((u) => ({
          id: u.id,
          email: u.email,
          nome: u.nome,
          auth_user_id: u.auth_user_id,
          ativo: u.ativo,
        }))}
      />
    </>
  )
}
