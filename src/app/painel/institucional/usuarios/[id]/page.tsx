import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterAcesso } from "@/lib/db/acessos"

import { AcessoLogin, PermissoesForm, RevogarAcesso } from "../usuarios-forms"

export const metadata: Metadata = { title: "Permissões — Confluir" }

export default async function AcessoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("permissoes", ["configuracoes"])
  const { id } = await params

  const acesso = await obterAcesso(id)
  if (!acesso) notFound()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/usuarios">
            <ArrowLeft />
            Usuários e permissões
          </Link>
        </Button>
        <RevogarAcesso acessoId={acesso.id} />
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {acesso.nome ?? "(sem nome)"}
          </h1>
          {acesso.temLogin ? (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Login ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Sem login
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {acesso.email ?? "sem e-mail"}
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6">
          <p className="text-sm font-medium">Acesso ao painel (login)</p>
          {!acesso.temLogin && (
            <Alert variant="warning">
              <AlertDescription>
                Esta pessoa tem o perfil de permissões, mas ainda não tem conta
                de login. Crie o acesso e compartilhe o link para ela definir a
                senha.
              </AlertDescription>
            </Alert>
          )}
          {acesso.temLogin && (
            <p className="text-muted-foreground text-sm">
              Login ativo. Se necessário, gere um link para a pessoa redefinir a
              senha.
            </p>
          )}
          {acesso.email ? (
            <AcessoLogin acessoId={acesso.id} temLogin={acesso.temLogin} />
          ) : (
            <p className="text-destructive text-sm">
              O usuário não tem e-mail cadastrado — necessário para o login.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <PermissoesForm
            acessoId={acesso.id}
            flags={acesso.flags}
            alcada={acesso.alcada}
          />
        </CardContent>
      </Card>
    </>
  )
}
