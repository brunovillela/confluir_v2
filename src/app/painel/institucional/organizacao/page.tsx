import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, MapPin } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { listarSedes, obterOrganizacao } from "@/lib/db/organizacao"

import { OrganizacaoForm, SedeForm } from "./organizacao-forms"

export const metadata: Metadata = { title: "Organização — Confluir" }

export default async function OrganizacaoPage() {
  await requirePermissao("configuracoes")

  const [org, { disponivel, sedes }] = await Promise.all([
    obterOrganizacao(),
    listarSedes(),
  ])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organização</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Identidade da entidade e endereços — usados nos ofícios
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {org ? (
            <OrganizacaoForm
              dados={{
                nomeRazao: org.nomeRazao,
                nomeFantasia: org.nomeFantasia,
                cnpjCpf: org.cnpjCpf,
                siteUrl: org.siteUrl,
                emailContato: org.emailContato,
                noticiasUrl: org.noticiasUrl,
                noticiasFeedUrl: org.noticiasFeedUrl,
              }}
              logoUrl={org.logoUrl}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Registro da organização não encontrado.
            </p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="text-muted-foreground size-4" />
          Sedes
        </h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Endereço e telefones de cada sede compõem o rodapé dos ofícios
        </p>

        {!disponivel && (
          <Alert variant="warning">
            <AlertDescription>
              O campo de telefones das sedes usa uma coluna nova — rode{" "}
              <code>supabase/organizacao-diretoria.sql</code> no Supabase.
            </AlertDescription>
          </Alert>
        )}

        {disponivel && (
          <div className="grid gap-3">
            {sedes.map((sede) => (
              <GrupoColapsavel
                key={sede.id}
                titulo={sede.nome ?? "Sede"}
                descricao={
                  sede.cidade
                    ? `${sede.logradouro ?? ""}${sede.numero ? `, ${sede.numero}` : ""} — ${sede.cidade}/${sede.estado ?? ""}`
                    : "Endereço não preenchido"
                }
              >
                <SedeForm sede={sede} />
              </GrupoColapsavel>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
