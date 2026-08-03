import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { listarAcessos, previaOnboarding } from "@/lib/db/acessos"

import { ConcederAcesso, OnboardingLote } from "./usuarios-forms"

export const metadata: Metadata = { title: "Usuários e permissões — Confluir" }

export default async function UsuariosPage() {
  await requirePermissao("permissoes", ["configuracoes"])
  const [acessos, previa] = await Promise.all([
    listarAcessos(),
    previaOnboarding(),
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Usuários e permissões
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quem tem perfil de acesso ao painel e o que cada um pode ver e editar
        </p>
      </div>

      <GrupoColapsavel titulo="Conceder acesso a uma pessoa">
        <ConcederAcesso />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Convidar funcionários em lote"
        descricao="Cria login e envia o convite de primeiro acesso aos funcionários do quadro"
        resumo={
          <Badge variant="secondary">{previa.aptos.length} aptos</Badge>
        }
      >
        <OnboardingLote
          emailOk={previa.emailConfigurado}
          aptos={previa.aptos}
          jaComLogin={previa.jaComLogin}
          semEmail={previa.semEmail}
        />
      </GrupoColapsavel>

      <Card>
        <CardContent>
          {acessos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ShieldCheck className="mx-auto mb-2 size-5" />
              Nenhum acesso concedido ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acessos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/painel/institucional/usuarios/${a.id}`}
                        className="text-primary hover:underline"
                      >
                        {a.nome ?? "(sem nome)"}
                      </Link>
                      {a.ehAdmin && (
                        <Badge variant="secondary" className="ml-2">
                          admin
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{a.email ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {a.totalPermissoes}
                    </TableCell>
                    <TableCell>
                      {a.temLogin ? (
                        <Badge variant="outline" className="border-success/40 text-success-fg">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Sem login
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        O login (conta de acesso) é uma etapa à parte da integração — aqui se
        define o perfil de permissões. “Sem login” = perfil pronto, mas a pessoa
        ainda não pode entrar.
      </p>
    </>
  )
}
