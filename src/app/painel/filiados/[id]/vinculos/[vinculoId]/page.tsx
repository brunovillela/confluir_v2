import { tenantAtual } from "@/lib/tenant"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { documentosDoVinculo } from "@/lib/db/filiacao-documentos"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"

import { DocumentoDoVinculo } from "../documentos"
import { VinculoForm, type VinculoFormDados } from "../vinculo-form"

export const metadata: Metadata = { title: "Vínculo de filiação — Confluir" }

export default async function EditarVinculoPage({
  params,
}: {
  params: Promise<{ id: string; vinculoId: string }>
}) {
  await requirePermissao("filiacao_gestao")

  const { id, vinculoId } = await params
  const admin = await createAdminClient()
  const [{ data: filiado }, { data: vinculo }, fontes] = await Promise.all([
    admin
      .from("filiacoes")
      .select("id, nome_completo")
      .eq("id", id)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    admin
      .from("filiacao_vinculos")
      .select(
        "id, filiado_id, fonte_pagadora_id, cargo, lotacao, matricula, data_entrada_admissao, data_filiacao, data_desfiliacao, filiacao_condicao"
      )
      .eq("id", vinculoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    listarFontesPagadoras(),
  ])
  if (!filiado || !vinculo || vinculo.filiado_id !== id) notFound()

  const documentos = await documentosDoVinculo(vinculoId)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/${id}`}>
            <ArrowLeft />
            {filiado.nome_completo ?? "Filiado"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar vínculo de filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Histórico de {filiado.nome_completo ?? "—"}.
        </p>
      </div>
      <VinculoForm
        filiadoId={id}
        fontes={fontes.map((f) => ({
          id: f.id,
          nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
        }))}
        vinculo={vinculo as VinculoFormDados}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos deste vínculo</CardTitle>
          <CardDescription>
            O papel que sustenta a filiação e a desfiliação. Guardar aqui é o
            que torna o arquivo localizável — na gaveta ele existe, mas não é
            auditável.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">
              Precisa colher a assinatura?
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Baixe a ficha já preenchida com os dados do cadastro e deste
              vínculo, imprima, colha a assinatura e anexe o PDF abaixo. É o
              mesmo documento do fluxo público de filiação.
            </p>
            <Button variant="outline" size="sm" asChild className="mt-3">
              <a
                href={`/painel/filiados/${id}/vinculos/${vinculoId}/ficha`}
              >
                <FileDown />
                Baixar ficha preenchida
              </a>
            </Button>
          </div>

          {documentos.map((d) => (
            <DocumentoDoVinculo
              key={d.tipo}
              filiadoId={id}
              vinculoId={vinculoId}
              doc={{ tipo: d.tipo, url: d.url, noBubble: d.noBubble }}
            />
          ))}
        </CardContent>
      </Card>
    </>
  )
}
