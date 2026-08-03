import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  empregadoresPorIntegrante,
  liberacoesDoIntegrante,
  obterFichaDiretor,
  obterIntegrante,
} from "@/lib/db/diretoria"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import type { EmpresaOpcao } from "@/components/empresa-combobox"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"

import { FichaDiretorForm } from "./ficha-form"

export const metadata: Metadata = { title: "Ficha do diretor — Confluir" }

export default async function DiretorPage({
  params,
}: {
  params: Promise<{ id: string; integranteId: string }>
}) {
  await requirePermissao("diretoria_mandatos")
  const { id: mandatoId, integranteId } = await params

  const integrante = await obterIntegrante(integranteId)
  if (!integrante) notFound()

  const [ficha, fontes, liberacoes, empregadoresMapa] = await Promise.all([
    obterFichaDiretor(integranteId),
    listarFontesPagadoras(),
    liberacoesDoIntegrante(integranteId),
    empregadoresPorIntegrante(integrante.mandatoId),
  ])
  const empregadores = empregadoresMapa[integranteId] ?? []
  const empresas: EmpresaOpcao[] = fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
    cnpj_cpf: f.cnpj_cpf,
    bloqueado: false,
  }))

  return (
    <>
      <RotuloTrilha
        valores={{
          [mandatoId]: integrante.mandatoNome ?? "Mandato",
          [integranteId]: integrante.nome ?? "Diretor",
        }}
      />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/institucional/diretoria/${mandatoId}`}>
            <ArrowLeft />
            Mandato
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {integrante.nome ?? "(sem nome)"}
          </h1>
          {integrante.cargo && (
            <Badge variant="secondary">{integrante.cargo}</Badge>
          )}
          {integrante.ehFiliado && <Badge variant="outline">Filiado</Badge>}
          {integrante.temUsuario && (
            <Badge variant="outline">Acesso ao painel</Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {integrante.mandatoNome ?? "Mandato"}
          {integrante.cpf && <> · CPF {formatarCnpjCpf(integrante.cpf)}</>}
        </p>
      </div>

      <FichaDiretorForm
        integranteId={integranteId}
        mandatoId={mandatoId}
        ficha={ficha}
        empresas={empresas}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liberações sindicais</CardTitle>
            <CardDescription>{liberacoes.length} registro(s)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {liberacoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma liberação. Cadastre pela página do mandato.
              </p>
            ) : (
              <ul className="grid gap-2">
                {liberacoes.map((l) => (
                  <li
                    key={l.id}
                    className="border-border flex items-start justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {l.tipo ?? "Liberação"}
                        {l.vigente && (
                          <Badge
                            variant="outline"
                            className="border-success/40 text-success-fg ml-2 align-middle"
                          >
                            Vigente
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {l.empresaNome ?? "—"} ·{" "}
                        {l.inicio ? formatarData(l.inicio) : "?"} –{" "}
                        {l.fim ? formatarData(l.fim) : "—"}
                      </p>
                    </div>
                    {l.documentoUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={l.documentoUrl} target="_blank" rel="noreferrer">
                          <FileText className="size-4" />
                        </a>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empregadores vinculados</CardTitle>
            <CardDescription>
              Inferidos pelos vínculos de filiação (CPF → fonte pagadora)
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {empregadores.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum vínculo de fonte pagadora encontrado para o CPF.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {empregadores.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <Building2 className="text-muted-foreground size-4" />
                    <Link
                      href={`/painel/representacao/empregadores/${e.id}`}
                      className="text-primary hover:underline"
                    >
                      {e.nome}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
