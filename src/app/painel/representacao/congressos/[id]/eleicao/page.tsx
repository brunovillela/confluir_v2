import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDaEleicao } from "@/lib/db/congressos-encerramento"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { AcoesChapa, Apuracao, EnviarEtapaSeguinte, InscreverChapa } from "../../encerramento-componentes"

export const metadata: Metadata = { title: "Eleição da delegação — Confluir" }

const SITUACAO: Record<string, string> = { inscrita: "Inscrita", homologada: "Homologada", impugnada: "Impugnada", retirada: "Retirada" }

/** Eleição da delegação para a etapa seguinte: inscrição de chapas com horário, votos e eleitos. */
export default async function EleicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "congressos_gestao")
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const e = await dadosDaEleicao(c)
  const base = `/painel/representacao/congressos/${id}`
  const concorrem = e.chapas.filter((ch) => ch.situacao === "inscrita" || ch.situacao === "homologada")
  const eleitos = e.chapas.flatMap((ch) => ch.membros.filter((m) => m.eleito).map((m) => ({ ...m, chapa: ch.numero })))
  const destino = c.etapaSeguinteNome ?? "congresso da etapa seguinte"

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, eleicao: "Eleição da delegação" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eleição da delegação</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            {e.regras.vagas} titular(es){e.regras.suplentes ? ` e ${e.regras.suplentes} suplente(s)` : ""} para o {destino} ·{" "}
            {e.regras.criterio === "maioria" ? "a chapa mais votada leva todas" : "vagas proporcionais aos votos"}
            {e.regras.inicio || e.regras.fim
              ? ` · inscrição ${e.regras.inicio ? `de ${formatarDataHora(e.regras.inicio)} ` : ""}${e.regras.fim ? `até ${formatarDataHora(e.regras.fim)}` : ""}`
              : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`${base}?aba=encerramento`}>Encerramento</Link>
        </Button>
      </div>

      {!e.regras.ha ? (
        <Alert>
          <AlertDescription>
            A configuração deste congresso não prevê eleição de delegação. Ligue em{" "}
            <Link href={`${base}?aba=configuracao`} className="underline underline-offset-2">
              Configuração › Eleição da delegação
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {!e.apurada &&
            (e.janela.aberta ? (
              <InscreverChapa congressoId={id} candidatos={e.candidatos} vagas={e.regras.vagas} suplentes={e.regras.suplentes} />
            ) : (
              <p className="text-sm">{e.janela.motivo}</p>
            ))}

          <div className="grid gap-3">
            {e.chapas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma chapa inscrita.</p>}
            {e.chapas.map((ch) => (
              <Card key={ch.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    Chapa {ch.numero} · {ch.nome}
                    <Badge variant={ch.situacao === "impugnada" || ch.situacao === "retirada" ? "destructive" : "secondary"}>{SITUACAO[ch.situacao]}</Badge>
                    {ch.votos !== null && <Badge variant="outline">{ch.votos} voto(s)</Badge>}
                    {ch.vagasTitulares !== null && <Badge variant={ch.vagasTitulares ? "success" : "outline"}>{ch.vagasTitulares} vaga(s)</Badge>}
                  </CardTitle>
                  <CardDescription>
                    Inscrita em {formatarDataHora(ch.inscritaEm)}
                    {ch.inscritaPor ? ` por ${ch.inscritaPor}` : ""}
                    {ch.motivo ? ` · ${ch.motivo}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <ol className="grid gap-0.5 text-sm sm:grid-cols-2">
                    {ch.membros.map((m) => (
                      <li key={m.id} className={m.eleito ? "font-medium" : ""}>
                        {m.condicao === "suplente" ? "Suplente " : ""}
                        {m.ordem}. {m.nome}
                        {m.base && <span className="text-muted-foreground"> · {m.base}</span>}
                        {m.eleito && <span className="text-emerald-700 dark:text-emerald-400"> · eleito(a)</span>}
                      </li>
                    ))}
                  </ol>
                  {!e.apurada && <AcoesChapa congressoId={id} chapaId={ch.id} situacao={ch.situacao} />}
                </CardContent>
              </Card>
            ))}
          </div>

          {concorrem.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Votos</CardTitle>
                <CardDescription>Lance a contagem de cada chapa. Empate no primeiro lugar não elege ninguém: o regimento decide.</CardDescription>
              </CardHeader>
              <CardContent>
                <Apuracao congressoId={id} chapas={concorrem.map((ch) => ({ id: ch.id, numero: ch.numero, nome: ch.nome, votos: ch.votos }))} apurada={e.apurada} />
              </CardContent>
            </Card>
          )}

          {eleitos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Eleitos · {eleitos.length}</CardTitle>
                <CardDescription>
                  {c.etapaSeguinteId
                    ? `Podem ir direto para a lista de participantes do ${destino}.`
                    : "Para levar os eleitos à etapa seguinte, cadastre o congresso dela na Visão geral."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <ol className="grid gap-0.5 text-sm sm:grid-cols-2">
                  {eleitos.map((m) => (
                    <li key={m.id}>
                      {m.nome}{" "}
                      <span className="text-muted-foreground">
                        · {m.condicao === "titular" ? "titular" : "suplente"} · chapa {m.chapa}
                        {m.base ? ` · ${m.base}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                {gestor && c.etapaSeguinteId && <EnviarEtapaSeguinte congressoId={id} destino={destino} />}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}
