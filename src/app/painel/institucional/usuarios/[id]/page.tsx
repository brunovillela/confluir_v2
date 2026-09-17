import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { requirePermissao } from "@/lib/auth"
import { rotuloMotivo } from "@/lib/contas-funcao-constantes"
import { obterAcesso } from "@/lib/db/acessos"
import { hojeSP } from "@/lib/db/comum"
import { AVISO_SQL_CONTAS, listarOcupacoes, ocupanteNoDia } from "@/lib/db/contas-funcao"
import { formatarData } from "@/lib/formato"
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
import { AcoesOcupacao, RegistrarOcupacao } from "../contas-funcao-forms"

export const metadata: Metadata = { title: "Permissões — Confluir" }

export default async function AcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ nova?: string; conta?: string }>
}) {
  await requirePermissao("permissoes", ["configuracoes"])
  const { id } = await params
  const { nova, conta } = await searchParams

  const acesso = await obterAcesso(id)
  if (!acesso) notFound()

  const hoje = hojeSP()
  const [perfis, perfisAtribuidos, departamentos, deptosCompras, posto] = await Promise.all([
    listarPerfis(),
    acesso.usuarioId ? perfisDoUsuario(acesso.usuarioId) : Promise.resolve([]),
    listarDepartamentos(),
    acesso.usuarioId
      ? departamentosComprasDoUsuario(acesso.usuarioId)
      : Promise.resolve({ disponivel: false, departamentoIds: [] }),
    acesso.contaFuncao && acesso.usuarioId
      ? listarOcupacoes(acesso.usuarioId)
      : Promise.resolve(null),
  ])
  const noPosto = posto ? ocupanteNoDia(posto.ocupacoes, hoje) : null

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
          {acesso.contaFuncao && <Badge variant="outline">Conta de função</Badge>}
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

      {conta && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Conta de função criada. Registre abaixo quem ocupa o posto, escolha os
            perfis de acesso do posto e clique em <strong>Conceder login</strong>.
          </AlertDescription>
        </Alert>
      )}

      {posto && (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Quem ocupa o posto</p>
                <p className="text-muted-foreground text-xs">
                  A conta é usada por quem está no posto. Cada ação feita com ela
                  é atribuída a quem ocupava o posto no dia — por isso registre
                  toda troca, inclusive as férias.
                </p>
              </div>
              {posto.disponivel && (
                <p className="text-sm">
                  Hoje:{" "}
                  <strong>
                    {noPosto ? (noPosto.pessoaNome ?? "(sem nome)") : "ninguém registrado"}
                  </strong>
                  {noPosto && noPosto.motivo !== "titular"
                    ? ` · ${rotuloMotivo(noPosto.motivo).toLowerCase()}`
                    : ""}
                </p>
              )}
            </div>

            {!posto.disponivel ? (
              <Alert variant="warning">
                <AlertDescription>{AVISO_SQL_CONTAS}</AlertDescription>
              </Alert>
            ) : (
              <>
                {posto.ocupacoes.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pessoa</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Registrado por</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posto.ocupacoes.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">
                            {o.pessoaNome ?? "(sem nome)"}
                            {o.id === noPosto?.id && (
                              <Badge
                                variant="outline"
                                className="border-success/40 text-success-fg ml-2"
                              >
                                no posto
                              </Badge>
                            )}
                            {o.observacao && (
                              <span className="text-muted-foreground block text-xs font-normal">
                                {o.observacao}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{rotuloMotivo(o.motivo)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {o.fim
                              ? `${formatarData(o.inicio)} a ${formatarData(o.fim)}`
                              : `desde ${formatarData(o.inicio)}`}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {o.registradoPorNome ?? "—"}
                          </TableCell>
                          <TableCell>
                            <AcoesOcupacao
                              acessoId={acesso.id}
                              ocupacaoId={o.id}
                              aberta={!o.fim}
                              pessoa={o.pessoaNome ?? "esta pessoa"}
                              hoje={hoje}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="rounded-lg border p-4">
                  <p className="mb-3 text-sm font-medium">Registrar quem entra no posto</p>
                  <RegistrarOcupacao acessoId={acesso.id} hoje={hoje} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 pt-6">
          <p className="text-sm font-medium">Acesso ao painel (login)</p>
          {acesso.contaFuncao && (
            <Alert variant="info">
              <AlertDescription>
                <span>
                  <strong>Na troca de quem ocupa o posto:</strong> 1) troque a senha
                  da caixa {acesso.email ?? "do e-mail"} no provedor de e-mail, para
                  quem saiu perder o acesso a ela; 2) registre a troca acima; 3) quem
                  entra usa <em>Esqueci minha senha</em> com o e-mail do posto (ou
                  gere o link aqui) e define uma senha nova — a antiga deixa de valer.
                </span>
              </AlertDescription>
            </Alert>
          )}
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
