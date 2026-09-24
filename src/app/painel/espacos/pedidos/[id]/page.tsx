import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import { listarResponsaveisPossiveis } from "@/lib/db/espacos"
import {
  ROTULO_EVENTO,
  ROTULO_SITUACAO,
  obterSolicitacao,
  pendenciasParaConfirmar,
} from "@/lib/db/espacos-esteira"
import { termoDaCessao } from "@/lib/db/espacos-termo"
import { GATILHOS_CONDICAO, totalExigencias } from "@/lib/espacos-constantes"
import { formatarDataHora } from "@/lib/formato"

import { Assumir, Autorizacao, Custeio, Fechamento, Termo, Visita } from "./passos"

export const metadata: Metadata = { title: "Pedido de uso — Confluir" }

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requirePermissao("espacos", ["espacos_gestao"])
  const podeGerir = sessao.permissoes?.espacos_gestao === true
  const podeAutorizar = sessao.permissoes?.espacos_autorizacao === true
  const { id } = await params

  const [pedido, responsaveis, termo] = await Promise.all([
    obterSolicitacao(id),
    listarResponsaveisPossiveis(),
    termoDaCessao(id),
  ])
  if (!pedido) notFound()

  const pendencias = pendenciasParaConfirmar(pedido)
  const encerrado =
    pedido.situacao === "confirmada" ||
    pedido.situacao === "recusada" ||
    pedido.situacao === "cancelada"
  const totais = totalExigencias(pedido.exigencias)
  const condicoes = GATILHOS_CONDICAO.filter(
    (g) => pedido.respostas[g.chave as keyof typeof pedido.respostas]
  )

  return (
    <>
      <RotuloTrilha
        valores={{ [id]: pedido.numero ? `Pedido nº ${pedido.numero}` : "Pedido" }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/painel/espacos/pedidos" aria-label="Voltar para os pedidos">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {pedido.numero ? `Pedido nº ${pedido.numero}` : "Pedido"} —{" "}
              {pedido.espacoNome}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {pedido.solicitante}
              {pedido.entidade ? ` · ${pedido.entidade}` : ""}
              {pedido.analistaNome ? ` · com ${pedido.analistaNome}` : ""}
            </p>
          </div>
        </div>
        <Badge variant="outline">{ROTULO_SITUACAO[pedido.situacao]}</Badge>
      </div>

      {pedido.recusaMotivo && encerrado && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>Motivo:</strong> {pedido.recusaMotivo}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          {podeGerir && !pedido.analistaId && !encerrado && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Análise</CardTitle>
              </CardHeader>
              <CardContent>
                <Assumir id={id} />
              </CardContent>
            </Card>
          )}

          <Visita
            id={id}
            visita={pedido.visita}
            responsaveis={responsaveis}
            podeGerir={podeGerir && !encerrado}
          />

          {pedido.autorizacao.exigida && (
            <Autorizacao
              id={id}
              autorizacao={pedido.autorizacao}
              podeAutorizar={podeAutorizar && !encerrado}
            />
          )}

          <Custeio
            id={id}
            custeio={pedido.custeio}
            podeGerir={podeGerir && !encerrado}
          />

          <Termo
            id={id}
            termo={termo}
            exigido={pedido.espacoExigeTermo}
            podeGerir={podeGerir && !encerrado}
          />

          <Fechamento
            id={id}
            pendencias={pendencias}
            encerrado={encerrado}
            podeGerir={podeGerir}
          />
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">O pedido</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Linha rotulo="Quando">
                {formatarDataHora(pedido.inicio)} até{" "}
                {formatarDataHora(pedido.termino)}
              </Linha>
              {pedido.montagemInicio && (
                <Linha rotulo="Montagem a partir de">
                  {formatarDataHora(pedido.montagemInicio)}
                </Linha>
              )}
              {pedido.desmontagemTermino && (
                <Linha rotulo="Desmontagem até">
                  {formatarDataHora(pedido.desmontagemTermino)}
                </Linha>
              )}
              <Linha rotulo="Público estimado">
                {pedido.publicoEstimado?.toLocaleString("pt-BR") ?? "—"}
              </Linha>
              <Linha rotulo="Finalidade">
                <span className="whitespace-pre-line">{pedido.finalidade ?? "—"}</span>
              </Linha>
              {condicoes.length > 0 && (
                <Linha rotulo="Condições declaradas">
                  <span className="flex flex-wrap gap-1">
                    {condicoes.map((c) => (
                      <Badge key={c.chave} variant="outline">
                        {c.rotulo}
                      </Badge>
                    ))}
                  </span>
                </Linha>
              )}
              {pedido.observacoes && (
                <Linha rotulo="Observações">
                  <span className="whitespace-pre-line">{pedido.observacoes}</span>
                </Linha>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contato</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Linha rotulo="Solicitante">{pedido.solicitante}</Linha>
              {pedido.cpf && <Linha rotulo="CPF">{formatarCpf(pedido.cpf)}</Linha>}
              <Linha rotulo="E-mail">{pedido.email ?? "—"}</Linha>
              <Linha rotulo="Telefone">{pedido.telefone ?? "—"}</Linha>
              {pedido.representanteNome && (
                <Linha rotulo="Responsável no dia">
                  {pedido.representanteNome}
                  {pedido.representanteTelefone
                    ? ` · ${pedido.representanteTelefone}`
                    : ""}
                </Linha>
              )}
            </CardContent>
          </Card>

          {pedido.exigencias.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" />
                  Exigências acordadas
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {pedido.exigencias.map((e, i) => (
                  <div key={i} className="rounded-md border p-2">
                    <p className="font-medium">{e.motivo}</p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        e.bombeiros > 0 &&
                          `${e.bombeiros} bombeiro${e.bombeiros === 1 ? " civil" : "s civis"}`,
                        e.segurancas > 0 &&
                          `${e.segurancas} segurança${e.segurancas === 1 ? "" : "s"}`,
                        e.observacao,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
                <p className="font-medium">
                  Total: {totais.bombeiros} bombeiro
                  {totais.bombeiros === 1 ? " civil" : "s civis"} e{" "}
                  {totais.segurancas} segurança
                  {totais.segurancas === 1 ? "" : "s"}.
                </p>
                <p className="text-muted-foreground text-xs">
                  Congeladas no momento do pedido — mudar a regra do espaço não
                  altera o que foi acordado aqui.
                </p>
              </CardContent>
            </Card>
          )}

          {pedido.eventos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Histórico</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-xs">
                  {pedido.eventos.map((e, i) => (
                    <li key={i} className="border-l-2 pl-2">
                      <p className="font-medium">
                        {ROTULO_EVENTO[e.tipo] ?? e.tipo.replace(/_/g, " ")}
                      </p>
                      <p className="text-muted-foreground">
                        {formatarDataHora(e.quando)}
                        {e.quem ? ` · ${e.quem}` : ""}
                      </p>
                      {e.detalhe && <p className="mt-0.5">{e.detalhe}</p>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}
