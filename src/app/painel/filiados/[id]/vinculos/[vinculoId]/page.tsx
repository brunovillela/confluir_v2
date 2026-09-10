import { tenantAtual } from "@/lib/tenant"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileDown } from "lucide-react"

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
import { documentosDoVinculo } from "@/lib/db/filiacao-documentos"
import { formatarData } from "@/lib/formato"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { esquemaAusente } from "@/lib/db/comum"
import { pendenciasDoVinculo } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

import { DocumentoDoVinculo } from "../documentos"
import { ExcluirVinculo } from "../excluir-vinculo"
import { VinculoForm, type VinculoFormDados } from "../vinculo-form"

export const metadata: Metadata = { title: "Vínculo de filiação — Confluir" }

const COLS_VINCULO =
  "id, filiado_id, fonte_pagadora_id, cargo, lotacao, matricula, data_entrada_admissao, data_saida_demissao, data_filiacao, data_desfiliacao, regime_trabalho"

/**
 * `condicao_na_fonte` nasce em supabase/vinculos-condicao-fonte-regime.sql;
 * antes do SQL a página continua abrindo, só sem esse campo preenchido.
 */
async function lerVinculo(vinculoId: string) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const completo = await admin
    .from("filiacao_vinculos")
    .select(`${COLS_VINCULO}, condicao_na_fonte`)
    .eq("id", vinculoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!completo.error) return completo
  if (!esquemaAusente(completo.error)) return completo
  const basico = await admin
    .from("filiacao_vinculos")
    .select(COLS_VINCULO)
    .eq("id", vinculoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  return { ...basico, data: basico.data ? { ...basico.data, condicao_na_fonte: null } : null }
}

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
    lerVinculo(vinculoId),
    listarFontesPagadoras(),
  ])
  if (!filiado || !vinculo || vinculo.filiado_id !== id) notFound()

  const documentos = await documentosDoVinculo(vinculoId)
  const pendencias = pendenciasDoVinculo({
    fonte_pagadora_id: (vinculo.fonte_pagadora_id as string | null) ?? null,
    matricula: (vinculo.matricula as string | null) ?? null,
    cargo: (vinculo.cargo as string | null) ?? null,
    lotacao: (vinculo.lotacao as string | null) ?? null,
    data_entrada_admissao: (vinculo.data_entrada_admissao as string | null) ?? null,
    data_filiacao: (vinculo.data_filiacao as string | null) ?? null,
    condicao_na_fonte: (vinculo.condicao_na_fonte as string | null) ?? null,
    regime_trabalho: (vinculo.regime_trabalho as string | null) ?? null,
    temFicha: documentos.some((d) => d.tipo === "ficha" && d.valor !== null),
  })

  // Nome da fonte para a confirmação de exclusão dizer de QUAL vínculo se
  // trata — "excluir o vínculo" sem dizer qual é pedir erro.
  const fonteNome = vinculo.fonte_pagadora_id
    ? (fontes.find((f) => f.id === vinculo.fonte_pagadora_id)?.nome_fantasia ??
      fontes.find((f) => f.id === vinculo.fonte_pagadora_id)?.nome_razao ??
      null)
    : null

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

      {pendencias.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>Vínculo incompleto.</strong> Faltam: {pendencias.join(", ")}.
            Saída na fonte, carta de desligamento e desfiliação só valem quando
            o vínculo termina; regime de trabalho só para trabalhador da ativa.
          </AlertDescription>
        </Alert>
      )}
      <VinculoForm
        filiadoId={id}
        fontes={fontes.map((f) => ({
          id: f.id,
          nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
          fundoPensao: f.fundo_pensao === true,
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

      <ExcluirVinculo
        filiadoId={id}
        vinculoId={vinculoId}
        fonteNome={fonteNome}
        dataFiliacao={formatarData(
          (vinculo.data_filiacao as string | null) ?? null
        )}
        dataDesfiliacao={
          vinculo.data_desfiliacao
            ? formatarData(vinculo.data_desfiliacao as string)
            : null
        }
        temFicha={documentos.some((d) => d.tipo === "ficha" && d.valor !== null)}
        temCarta={documentos.some((d) => d.tipo === "carta" && d.valor !== null)}
      />
    </>
  )
}
