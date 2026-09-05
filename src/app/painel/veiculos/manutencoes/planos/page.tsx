import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarVeiculos } from "@/lib/db/veiculos"
import { situacaoDosPlanos } from "@/lib/db/veiculos-manutencoes"
import { formatarData } from "@/lib/formato"

import { NovoPlanoForm, PlanoEditavel } from "../manutencao-forms"

export const metadata: Metadata = {
  title: "Preventivas programadas — Confluir",
}

export default async function PlanosPage() {
  await requirePermissao("veiculos_gestao")
  const [{ ativo, linhas }, frota] = await Promise.all([
    situacaoDosPlanos(),
    listarVeiculos({ situacao: "ativos" }),
  ])

  const veiculos = frota.map((v) => ({
    id: v.id,
    rotulo:
      [v.codigo, v.placa, v.marca_modelo].filter(Boolean).join(" · ") ||
      "(sem identificação)",
  }))

  /** Resumo legível do estado de cada programação, para o cartão fechado. */
  const resumoDe = (l: (typeof linhas)[number]): string => {
    if (l.vencido) return "vencida"
    const partes: string[] = []
    if (l.proximaData) partes.push(`próxima em ${formatarData(l.proximaData)}`)
    if (l.proximoHodometro)
      partes.push(`aos ${l.proximoHodometro.toLocaleString("pt-BR")} km`)
    return partes.join(" · ") || "sem referência ainda"
  }

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
          Preventivas programadas
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O que deve ser feito, de quanto em quanto tempo ou a cada quantos
          quilômetros. É daqui que saem os alertas na página do veículo.
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
        <>
          <Card>
            <CardContent>
              <GrupoColapsavel
                titulo="Nova programação"
                descricao="Troca de óleo, revisão dos freios, alinhamento, correia dentada."
              >
                <div className="pt-2">
                  <NovoPlanoForm veiculos={veiculos} />
                </div>
              </GrupoColapsavel>
            </CardContent>
          </Card>

          {linhas.length === 0 && (
            <Alert>
              <AlertDescription>
                Nenhuma programação cadastrada. Sem elas, o sistema não tem como
                avisar que uma manutenção está chegando.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3">
            {linhas.map((l) => (
              <PlanoEditavel
                key={l.plano.id}
                plano={l.plano}
                veiculos={veiculos}
                veiculoRotulo={l.veiculoRotulo}
                resumo={resumoDe(l)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}
