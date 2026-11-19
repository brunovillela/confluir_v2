import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, UserCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { revisarAcessos, ROTULO_MOTIVO, type MotivoRevisao } from "@/lib/db/acessos-revisao"

import { RevogarAcesso } from "../usuarios-forms"

export const metadata: Metadata = { title: "Revisão de acessos — Confluir" }

const ROTA = "/painel/gestao/usuarios/revisao"
const ORDEM: MotivoRevisao[] = ["desligado", "diretor_fora", "sem_login", "nunca_entrou"]
const VARIANTE: Record<MotivoRevisao, "destructive" | "warning" | "secondary"> = {
  desligado: "destructive",
  diretor_fora: "warning",
  sem_login: "secondary",
  nunca_entrou: "secondary",
}

export default async function RevisaoAcessosPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  await requirePermissao("gestao_sistema", ["permissoes"])
  const sp = await searchParams
  const filtro = ORDEM.find((m) => m === sp.motivo) ?? null
  const revisao = await revisarAcessos()
  const itens = filtro ? revisao.itens.filter((i) => i.motivos.includes(filtro)) : revisao.itens

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/gestao/usuarios">
            <ArrowLeft />
            Usuários e permissões
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <UserCheck className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Revisão de acessos</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Quem continua com acesso ao painel e talvez não precise mais. Confira cada caso: a revogação é sempre manual.
        </p>
      </div>

      {!revisao.disponivel && (
        <Alert>
          <AlertDescription>O último login ainda não pode ser consultado (a atualização do banco está pendente). Desligados e diretores aparecem normalmente.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ORDEM.map((m) => (
          <Link
            key={m}
            href={filtro === m ? ROTA : `${ROTA}?motivo=${m}`}
            className={`rounded-lg border p-3 transition-colors hover:border-primary/40 ${filtro === m ? "border-primary" : ""}`}
          >
            <p className="text-muted-foreground text-xs">{ROTULO_MOTIVO[m]}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{revisao.contagem[m]}</p>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtro ? ROTULO_MOTIVO[filtro] : "Para conferir"}</CardTitle>
          <CardDescription className="text-xs">
            {revisao.totalAcessos} acessos ao painel no total. Revogar remove o perfil de permissões; o cadastro da pessoa e o histórico ficam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nada a conferir{filtro ? " neste critério" : ""}.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Por que aparece</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => (
                    <TableRow key={i.acesso.id}>
                      <TableCell>
                        <Link href={`/painel/gestao/usuarios/${i.acesso.id}`} className="font-medium underline-offset-4 hover:underline">
                          {i.acesso.nome ?? "Sem nome"}
                        </Link>
                        <span className="text-muted-foreground block text-xs">
                          {i.acesso.email ?? "sem e-mail"}
                          {i.acesso.contaFuncao ? " · conta de função" : ""}
                          {i.acesso.ehAdmin ? " · administrador" : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {i.motivos.map((m) => (
                            <Badge key={m} variant={VARIANTE[m]}>
                              {ROTULO_MOTIVO[m]}
                            </Badge>
                          ))}
                        </div>
                        <span className="text-muted-foreground mt-1 block text-xs">{i.detalhes.join(" · ")}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <RevogarAcesso acessoId={i.acesso.id} voltar={ROTA} nome={i.acesso.nome} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
