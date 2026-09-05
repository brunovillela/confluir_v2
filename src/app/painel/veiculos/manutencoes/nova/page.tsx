import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { listarVeiculos } from "@/lib/db/veiculos"
import {
  comprasParaVinculo,
  listarPlanos,
} from "@/lib/db/veiculos-manutencoes"

import { ManutencaoForm } from "../manutencao-forms"

export const metadata: Metadata = { title: "Nova manutenção — Confluir" }

export default async function NovaManutencaoPage({
  searchParams,
}: {
  searchParams: Promise<{ veiculo?: string }>
}) {
  await requirePermissao("veiculos_manutencao", ["veiculos_gestao"])
  const { veiculo } = await searchParams

  const [frota, fornecedores, { ativo, planos }, compras] = await Promise.all([
    listarVeiculos({ situacao: "ativos" }),
    listarFornecedores(),
    listarPlanos(),
    comprasParaVinculo(),
  ])

  const veiculos = frota.map((v) => ({
    id: v.id,
    rotulo:
      [v.codigo, v.placa, v.marca_modelo].filter(Boolean).join(" · ") ||
      "(sem identificação)",
  }))

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/veiculos/manutencoes">
            <ArrowLeft />
            Manutenções
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Registrar manutenção
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Entra no prontuário do veículo. Se cumprir uma preventiva programada,
          aponte qual — é assim que o próximo vencimento é recalculado.
        </p>
      </div>

      {!ativo ? (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas de manutenção ainda não existem no banco. Rode
            <code className="mx-1">supabase/veiculos-manutencoes.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dados do serviço</CardTitle>
            <CardDescription>
              Local, descrição, garantia e nota fiscal ficam guardados juntos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ManutencaoForm
              veiculos={veiculos}
              fornecedores={fornecedores.map((f) => ({
                id: f.id,
                nome: f.nome,
                cnpj_cpf: f.cnpj_cpf,
                bloqueado: f.bloqueado,
              }))}
              planos={planos.map((p) => ({
                id: p.id,
                descricao: p.descricao,
                veiculo_id: p.veiculo_id,
              }))}
              compras={compras}
              veiculoFixo={veiculo}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
