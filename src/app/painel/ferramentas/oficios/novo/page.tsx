import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { assinantesVigentes } from "@/lib/db/diretoria"
import { listarEmpresas } from "@/lib/db/oficios"
import { departamentosParaEscolha, escopoOficios } from "@/lib/db/oficios-acesso"
import { listarSedes, obterOrganizacao } from "@/lib/db/organizacao"

import { criarOficioAction } from "../actions"
import { OficioForm } from "../oficio-form"

export const metadata: Metadata = { title: "Novo ofício — Confluir" }

export default async function NovoOficioPage() {
  await requirePermissao("ferramentas_oficios")

  const [empresas, { sedes }, assinantes, escopo, organizacao] = await Promise.all([
    listarEmpresas(),
    listarSedes(),
    assinantesVigentes(),
    escopoOficios(),
    obterOrganizacao(),
  ])
  const semDepartamento = !escopo.todos && escopo.departamentos.length === 0

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/oficios">
            <ArrowLeft />
            Ofícios
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Novo ofício</h1>

      {semDepartamento ? (
        <Alert variant="warning">
          <AlertDescription>
            Você não está em nenhum departamento, e cada ofício pertence a um. Peça
            o vínculo em Institucional › Organização › Departamentos.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <OficioForm
              action={criarOficioAction}
              empresas={empresas.map((e) => ({ ...e }))}
              sedes={sedes.map((s) => ({ id: s.id, nome: s.nome ?? "Sede" }))}
              assinantes={assinantes}
              departamentos={departamentosParaEscolha(escopo)}
              semDepartamentoPermitido={escopo.todos}
              entidade={organizacao?.nomeFantasia ?? organizacao?.nomeRazao ?? null}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
