import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, Info, ShieldCheck, Vote } from "lucide-react"

import { ContagemRegressiva } from "@/components/portal/contagem-regressiva"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import {
  assembleiasDoFiliado,
  minhasVotacoes,
  obterEmailVotacao,
} from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { PortalShell } from "../portal-shell"
import { EmailVotacaoForm } from "./email-form"

export const metadata: Metadata = { title: "Votação — Confluir" }

export default async function VotacaoPortalPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()

  const [abertas, historico, emailVot] = await Promise.all([
    filiado.ativo ? assembleiasDoFiliado(filiado.cpf) : Promise.resolve([]),
    minhasVotacoes(filiado.cpf),
    obterEmailVotacao(filiado.cpf),
  ])

  return (
    <PortalShell
      preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Votação</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Suas assembleias abertas e o histórico de participação.
        </p>
      </div>

      {!filiado.ativo && (
        <Alert variant="warning">
          <AlertDescription>
            A votação pela área do filiado é para filiações ativas.
          </AlertDescription>
        </Alert>
      )}

      {/* Assembleias abertas */}
      {abertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assembleias abertas</CardTitle>
            <CardDescription>
              Você está apto a participar destas votações.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {abertas.map((a) => (
              <div
                key={a.assembleiaId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {a.nome ?? a.tema ?? "Assembleia"}
                    <Badge variant="outline" className="ml-2 align-middle">
                      {ROTULOS_MODALIDADE[a.modalidade]}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {a.empregador && <>{a.empregador} · </>}
                    {a.online ? (
                      a.termino ? (
                        <ContagemRegressiva ate={a.termino} />
                      ) : (
                        "votação online"
                      )
                    ) : (
                      <>
                        Presencial — confira as datas
                        {a.inicio && <> · {formatarData(a.inicio)}</>}
                        {a.termino && <> a {formatarData(a.termino)}</>}
                      </>
                    )}
                  </p>
                </div>
                {a.online ? (
                  a.jaVotou ? (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success-fg"
                    >
                      Você já votou
                    </Badge>
                  ) : (
                    !preview && (
                      <Button size="sm" asChild>
                        <Link href={`/portal/votacao/${a.assembleiaId}`}>
                          <Vote />
                          Votar agora
                        </Link>
                      </Button>
                    )
                  )
                ) : a.rodadaId ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/portal/votacao/rodada/${a.rodadaId}`}>
                      <CalendarClock />
                      Ver datas
                    </Link>
                  </Button>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <CalendarClock className="size-3.5" />
                    presencial
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* E-mail de votação verificado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">E-mail de votação</CardTitle>
          <CardDescription>
            Algumas empresas não informam o CPF nas listas de aptos. Um e-mail
            verificado permite reconhecer você por ele.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview ? (
            <p className="text-muted-foreground text-sm">
              {emailVot.email
                ? `E-mail de votação: ${emailVot.email}`
                : "Nenhum e-mail de votação verificado."}
            </p>
          ) : (
            <EmailVotacaoForm
              emailAtual={emailVot.email}
              pendente={emailVot.pendente}
            />
          )}
        </CardContent>
      </Card>

      {/* Minhas votações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Minhas votações</CardTitle>
          <CardDescription>
            Assembleias em que você participou.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertDescription>
              Por segurança da votação e para evitar constrangimento ou assédio,
              o sistema <strong>nunca</strong> mostra em quem você votou — apenas
              que você participou.
            </AlertDescription>
          </Alert>

          {historico.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              <Info className="mx-auto mb-2 size-5" />
              Você ainda não tem participações registradas.
            </p>
          ) : (
            historico.map((v) => (
              <div key={v.assembleiaId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {v.nome ?? v.tema ?? "Assembleia"}
                  </p>
                  <span className="text-muted-foreground text-xs">
                    {v.quando ? `votou em ${formatarDataHora(v.quando)}` : ""}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {[v.empregador, v.tema, ROTULOS_MODALIDADE[v.modalidade]]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {v.apuracaoEncerrada && v.resultado ? (
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      Aprovado:{" "}
                      <strong className="tabular-nums">
                        {v.resultado.aprovado ?? "—"}
                      </strong>
                    </span>
                    <span>
                      Reprovado:{" "}
                      <strong className="tabular-nums">
                        {v.resultado.reprovado ?? "—"}
                      </strong>
                    </span>
                    <span>
                      Branco:{" "}
                      <strong className="tabular-nums">
                        {v.resultado.branco ?? "—"}
                      </strong>
                    </span>
                    <span>
                      Abstenção:{" "}
                      <strong className="tabular-nums">
                        {v.resultado.abstencao ?? "—"}
                      </strong>
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Resultado disponível após o encerramento da apuração.
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
