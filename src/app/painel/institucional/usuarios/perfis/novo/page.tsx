import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { PerfilForm } from "../perfil-forms"

export const metadata: Metadata = { title: "Novo perfil — Confluir" }

export default async function NovoPerfilPage() {
  await requirePermissao("permissoes", ["configuracoes"])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/usuarios/perfis">
            <ArrowLeft />
            Perfis de acesso
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo perfil</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Depois de criar, você escolhe as permissões que ele concede.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <PerfilForm />
        </CardContent>
      </Card>
    </>
  )
}
