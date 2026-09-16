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
import { listarDepartamentos } from "@/lib/db/compras"
import { departamentosComprasDoUsuario } from "@/lib/db/compras-acesso"
import { listarPerfis, perfisDoUsuario } from "@/lib/db/perfis"

import {
  AcessoLogin,
  DepartamentosComprasForm,
  PerfisUsuarioForm,
  PermissoesForm,
  RevogarAcesso,
} from "../usuarios-forms"

export const metadata: Metadata = { title: "Permissões — Confluir" }

export default async function AcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ nova?: string }>
}) {
  await requirePermissao("permissoes", ["configuracoes"])
  const { id } = await params
  const { nova } = await searchParams

  const acesso = await obterAcesso(id)
  if (!acesso) notFound()

  const [perfis, perfisAtribuidos, departamentos, deptosCompras] = await Promise.all([
    listarPerfis(),
    acesso.usuarioId ? perfisDoUsuario(acesso.usuarioId) : Promise.resolve([]),
    listarDepartamentos(),
    acesso.usuarioId
      ? departamentosComprasDoUsuario(acesso.usuarioId)
      : Promise.resolve({ disponivel: false, departamentoIds: [] }),
  ])

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

      {nova && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Pessoa cadastrada. Escolha os perfis de acesso abaixo e clique em{" "}
            <strong>Conceder login</strong> para enviar o convite por e-mail.
          </AlertDescription>
        </Alert>
      )}

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
        <CardContent className="grid gap-3 pt-6">
          <div>
            <p className="text-sm font-medium">Perfis de acesso</p>
            <p className="text-muted-foreground text-xs">
              A forma recomendada de dar acesso: o perfil concede um conjunto de
              permissões. Some mais de um se precisar.
            </p>
          </div>
          {acesso.usuarioId ? (
            <PerfisUsuarioForm
              usuarioId={acesso.usuarioId}
              acessoId={acesso.id}
              perfis={perfis}
              atribuidos={perfisAtribuidos}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Este acesso não está vinculado a um usuário — não é possível
              atribuir perfis.
            </p>
          )}
        </CardContent>
      </Card>

      {acesso.usuarioId && (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <div>
              <p className="text-sm font-medium">Compras: departamentos</p>
              <p className="text-muted-foreground text-xs">
                Por quais departamentos a pessoa registra compras e vê as compras em Compras (além
                das que ela mesma registrou). Nenhum marcado = todos os departamentos. O comprador
                (setor central) continua operando todos os processos.
              </p>
            </div>
            {deptosCompras.disponivel ? (
              <DepartamentosComprasForm
                acessoId={acesso.id}
                usuarioId={acesso.usuarioId}
                departamentos={departamentos}
                marcados={deptosCompras.departamentoIds}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Rode <code>supabase/compras-restricao-departamento.sql</code> no Supabase para
                restringir compras por departamento.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 pt-6">
          <div>
            <p className="text-sm font-medium">Ajustes finos (exceções)</p>
            <p className="text-muted-foreground text-xs">
              Concessões individuais além dos perfis. Use só para exceções — o
              normal é resolver pelo perfil acima.
            </p>
          </div>
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
