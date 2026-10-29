import type { Metadata } from "next"
import { BadgeCheck, Landmark } from "lucide-react"

import { ContaBancariaResumo, SituacaoAlteracaoBadge, camposAlterados } from "@/components/conta-bancaria-resumo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { lerDocumentoTitular } from "@/lib/cpf"
import { minhasAlteracoes, minhasContas, type AlteracaoDadosBancarios } from "@/lib/db/meus-dados-bancarios"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { AcoesConta, CancelarPedido, IncluirConta } from "./contas-form"
import { contaPropriaPermitida } from "./elegivel"

export const metadata: Metadata = { title: "Meus dados bancários — Confluir" }

const ACAO: Record<AlteracaoDadosBancarios["acao"], string> = {
  incluir: "Inclusão",
  alterar: "Alteração",
  excluir: "Exclusão",
}

/**
 * Meu perfil → Dados bancários: o funcionário ou diretor inclui, altera e
 * exclui a própria conta. Cada pedido só vale depois que o Financeiro
 * confirma — aí a conta ganha o selo "Financeiro ciente".
 */
export default async function MeusDadosBancariosPage() {
  const { usuario } = await requireSessaoPainel()
  const { pode, cpf } = await contaPropriaPermitida(usuario.id)
  if (!pode) {
    return (
      <>
        <VoltarPerfil />
        <h1 className="text-2xl font-semibold tracking-tight">Meus dados bancários</h1>
        <Alert variant="info">
          <AlertDescription>
            Os dados bancários pelo perfil são de funcionários do sindicato e de integrantes da diretoria.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  const { disponivel, lista } = await minhasAlteracoes(usuario.id)
  const contas = await minhasContas(usuario.id, lista)
  const inclusoesPendentes = lista.filter((a) => a.acao === "incluir" && a.situacao === "aguardando")
  const titularSugerido = lerDocumentoTitular(cpf).documento

  return (
    <>
      <VoltarPerfil />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meus dados bancários</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Onde caem os seus pagamentos (salário, diárias, reembolsos, custeios). Toda inclusão, alteração ou exclusão vai
          ao Financeiro e só vale depois que ele confirmar — até lá, os pagamentos seguem na conta atual.
        </p>
      </div>

      {!disponivel ? (
        <Alert variant="warning">
          <AlertDescription>Esta área ainda não foi ativada no sistema — procure o Financeiro.</AlertDescription>
        </Alert>
      ) : (
        <>
          <IncluirConta titularSugerido={titularSugerido} />

          {contas.length === 0 && inclusoesPendentes.length === 0 && (
            <p className="text-muted-foreground text-sm">Você ainda não tem conta cadastrada.</p>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {contas.map((c) => (
              <Card key={c.id} className="gap-3 py-4">
                <CardContent className="grid gap-3 px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Landmark className="text-muted-foreground size-4" />
                    <span className="font-medium">{c.banco ?? (c.pix ? "Chave Pix" : "Conta")}</span>
                    {c.principal && <Badge variant="secondary">Principal</Badge>}
                    {c.ciente && (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                        title={`Confirmado em ${formatarDataHora(c.ciente.em)}${c.ciente.por ? ` por ${c.ciente.por}` : ""}`}
                      >
                        <BadgeCheck />
                        Financeiro ciente · {formatarData(c.ciente.em)}
                      </Badge>
                    )}
                  </div>
                  <ContaBancariaResumo conta={c} />
                  {c.pendente ? (
                    <div className="border-warning/40 bg-warning/5 grid gap-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-warning-fg text-sm font-medium">
                          {c.pendente.acao === "excluir" ? "Exclusão" : "Alteração"} aguardando o Financeiro
                        </span>
                        <CancelarPedido id={c.pendente.id} />
                      </div>
                      {c.pendente.acao === "alterar" && (
                        <ContaBancariaResumo conta={c.pendente.dados} destaque={camposAlterados(c, c.pendente.dados)} />
                      )}
                    </div>
                  ) : (
                    <AcoesConta contaId={c.id} valores={c} principal={c.principal} titularSugerido={titularSugerido} />
                  )}
                </CardContent>
              </Card>
            ))}

            {inclusoesPendentes.map((a) => (
              <Card key={a.id} className="border-warning/40 gap-3 border-dashed py-4">
                <CardContent className="grid gap-3 px-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <Landmark className="text-muted-foreground size-4" />
                      Conta nova
                      <SituacaoAlteracaoBadge situacao="aguardando" />
                    </span>
                    <CancelarPedido id={a.id} />
                  </div>
                  <ContaBancariaResumo conta={a.dados} />
                </CardContent>
              </Card>
            ))}
          </div>

          {lista.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico de pedidos</CardTitle>
                <CardDescription>Tudo o que você pediu e o que o Financeiro decidiu</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido em</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead className="hidden md:table-cell">Conta</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="hidden sm:table-cell">Decisão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((a) => {
                      const c = a.dados ?? a.anteriores
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap tabular-nums">{formatarDataHora(a.criadaEm)}</TableCell>
                          <TableCell>{ACAO[a.acao]}</TableCell>
                          <TableCell className="text-muted-foreground hidden max-w-64 truncate md:table-cell">
                            {[c?.banco, [c?.agencia, c?.conta].filter(Boolean).join(" / "), c?.pix].filter(Boolean).join(" · ") || "—"}
                          </TableCell>
                          <TableCell>
                            <SituacaoAlteracaoBadge situacao={a.situacao} />
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">
                            {a.decididaEm && a.situacao !== "cancelada"
                              ? `${formatarData(a.decididaEm)}${a.decididaPor ? ` · ${a.decididaPor}` : ""}`
                              : "—"}
                            {a.motivo && <span className="text-destructive block">{a.motivo}</span>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}
