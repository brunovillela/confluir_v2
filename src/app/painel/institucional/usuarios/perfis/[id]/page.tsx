import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { perfilComChaves } from "@/lib/db/perfis"

import { ChavesEditor, ExcluirPerfil, PerfilForm } from "../perfil-forms"

export const metadata: Metadata = { title: "Perfil de acesso — Confluir" }

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("permissoes", ["configuracoes"])
  const { id } = await params
  const perfil = await perfilComChaves(id)
  if (!perfil) notFound()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/usuarios/perfis">
            <ArrowLeft />
            Perfis de acesso
          </Link>
        </Button>
        {!perfil.sistema && <ExcluirPerfil perfilId={perfil.id} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
        {perfil.sistema && <Badge variant="secondary">de fábrica</Badge>}
      </div>

      <Card>
        <CardContent className="pt-6">
          <PerfilForm perfil={perfil} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 pt-6">
          <div>
            <p className="text-sm font-medium">Permissões concedidas</p>
            <p className="text-muted-foreground text-xs">
              Marque o que este perfil libera. Vale para todos que o tiverem.
            </p>
          </div>
          <ChavesEditor
            perfilId={perfil.id}
            chaves={perfil.chaves}
            concedeTudo={perfil.concede_tudo}
          />
        </CardContent>
      </Card>
    </>
  )
}
