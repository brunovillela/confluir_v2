import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  contarPendentesDeVinculo,
  listarCondutores,
  listarVeiculos,
  obterAbastecimento,
} from "@/lib/db/veiculos"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"

import { EdicaoAbastecimentoForm } from "./edicao-form"

export const metadata: Metadata = { title: "Abastecimento — Confluir" }

/** Timestamp → "YYYY-MM-DDTHH:MM" na hora de São Paulo (valor do datetime-local). */
function horaLocalSP(ts: string | null): string {
  if (!ts) return ""
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ts))
  return partes.replace(" ", "T").slice(0, 16)
}

const decimal = (n: number | null, casas: number) =>
  n === null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 3, useGrouping: false })

export default async function AbastecimentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; outrosVeiculo?: string; outrosCondutor?: string }>
}) {
  await requirePermissao("veiculos_gestao")
  const { id } = await params
  const brutos = await searchParams
  const a = await obterAbastecimento(id)
  if (!a) notFound()

  const [frota, condutoresRes, pendentes] = await Promise.all([
    listarVeiculos({ situacao: "todos" }),
    listarCondutores(),
    contarPendentesDeVinculo(a.veiculo_id ? null : a.placaInformada, a.usuario_id ? null : a.condutorInformado, a.id),
  ])
  const veiculos = frota.map((v) => ({
    id: v.id,
    rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}${v.inativo ? " (inativo)" : ""}`,
  }))
  const condutores = condutoresRes.condutores
    .map((c) => ({ id: c.usuario_id, rotulo: c.usuarioNome ?? "(sem nome)" }))
    .sort((x, y) => x.rotulo.localeCompare(y.rotulo, "pt-BR"))
  // Condutor atual que não está (mais) na lista de condutores continua escolhível.
  if (a.usuario_id && !condutores.some((c) => c.id === a.usuario_id)) {
    condutores.unshift({ id: a.usuario_id, rotulo: a.usuarioNome ?? "(condutor atual)" })
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/abastecimentos">
            <ArrowLeft />
            Abastecimentos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Abastecimento</h1>
          {!a.veiculo_id && (
            <Badge variant="outline" className="border-warning/50 text-warning-fg">
              Sem veículo identificado
            </Badge>
          )}
          {!a.usuario_id && a.condutorInformado && (
            <Badge variant="outline" className="border-warning/50 text-warning-fg">
              Condutor não identificado
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatarDataHora(a.data_hora)} · {a.posto ?? "—"} · {formatarMoeda(a.valor)}
          {a.lote_id ? " · veio de importação" : ""}
        </p>
      </div>

      {brutos.salvo && (
        <Alert variant="success">
          <AlertDescription>
            Alterações salvas.
            {brutos.outrosVeiculo ? ` Mais ${brutos.outrosVeiculo} lançamento(s) com a mesma placa foram vinculados ao veículo.` : ""}
            {brutos.outrosCondutor ? ` Mais ${brutos.outrosCondutor} lançamento(s) receberam o mesmo condutor.` : ""}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do lançamento</CardTitle>
          <CardDescription>
            Corrija o que a leitura trouxe errado ou vincule o veículo e o condutor não identificados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EdicaoAbastecimentoForm
            id={a.id}
            atual={{
              veiculoId: a.veiculo_id ?? "",
              condutorId: a.usuario_id ?? "",
              dataHora: horaLocalSP(a.data_hora),
              hodometro: a.hodometro === null ? "" : String(a.hodometro),
              posto: a.posto ?? "",
              cidade: a.cidade ?? "",
              combustivel: a.combustivel ?? "",
              volume: decimal(a.volume, 0),
              valor: decimal(a.valor, 2),
            }}
            veiculos={veiculos}
            condutores={condutores}
            informado={{ placa: a.placaInformada, condutor: a.condutorInformado }}
            pendentes={pendentes}
          />
        </CardContent>
      </Card>
    </>
  )
}
