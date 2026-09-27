import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { opcoesContratos } from "@/lib/db/contratos"
import {
  AVISO_SQL_MINUTAS,
  listarMinutas,
  parametrosDoContrato,
} from "@/lib/db/contratos-minutas"
import {
  AVISO_SQL_CONFIG,
  listarClausulasFixas,
  listarTiposMinuta,
} from "@/lib/db/contratos-minutas-config"
import { assinantesVigentes } from "@/lib/db/diretoria"
import { listarSedes } from "@/lib/db/organizacao"

import { NovaMinutaForm } from "./nova-minuta-form"

export const metadata: Metadata = { title: "Nova minuta — Confluir" }
// A IA redige o contrato inteiro na server action desta página: pode levar
// um ou dois minutos.
export const maxDuration = 300

export default async function NovaMinutaPage({
  searchParams,
}: {
  searchParams: Promise<{ contrato?: string }>
}) {
  await requirePermissao("aquisicoes_contratos_edicao")
  const { contrato } = await searchParams

  const [{ disponivel }, fornecedores, assinantes, { sedes }, contratos, doContrato, config, fixas] =
    await Promise.all([
      listarMinutas(),
      listarFornecedores(),
      assinantesVigentes(),
      listarSedes(),
      opcoesContratos(),
      contrato ? parametrosDoContrato(contrato) : Promise.resolve(null),
      listarTiposMinuta(),
      listarClausulasFixas(),
    ])
  const tipos = config.tipos.filter((t) => t.ativo)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos/minutas">
            <ArrowLeft />
            Minutas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova minuta</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quanto mais dados você informar, menos a minuta fica com “[PREENCHER]”. A IA não inventa o que
          não foi dito.
        </p>
      </div>

      {!disponivel || !config.disponivel ? (
        <Alert variant="warning">
          <AlertDescription>{!disponivel ? AVISO_SQL_MINUTAS : AVISO_SQL_CONFIG}</AlertDescription>
        </Alert>
      ) : tipos.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            Nenhum tipo de contrato ativo.{" "}
            <Link href="/painel/compras/contratos/minutas/configuracao" className="underline">
              Configure os tipos
            </Link>{" "}
            antes de criar minutas.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <NovaMinutaForm
              tipos={tipos}
              clausulas={fixas.clausulas}
              fornecedores={fornecedores.map((f) => ({
                id: f.id,
                nome: f.nome,
                cnpj_cpf: f.cnpj_cpf,
                bloqueado: false,
              }))}
              assinantes={assinantes}
              sedes={sedes.map((s) => ({ id: s.id, nome: s.nome ?? "Sede", cidade: s.cidade }))}
              contratos={contratos.map((c) => ({
                id: c.id,
                rotulo: [c.codigo, c.objeto].filter(Boolean).join(" — ") || "(sem objeto)",
              }))}
              contratoId={doContrato ? (contrato ?? null) : null}
              inicial={doContrato ?? {}}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
