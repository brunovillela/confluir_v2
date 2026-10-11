import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, FileCheck2, Info, ShieldCheck, Vote } from "lucide-react"

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
import { estadoVotacao, ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import { ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import {
  assembleiasDoFiliado,
  minhasVotacoes,
  obterEmailVotacao,
} from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"


import { EmailVotacaoForm } from "./email-form"

export const metadata: Metadata = { title: "Votação — Confluir" }

export default async function VotacaoPortalPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()

  const [abertas, historico, emailVot] = await Promise.all([
    filiado.ativo ? assembleiasDoFiliado(filiado.cpf) : Promise.resolve([]),
    minhasVotacoes(filiado.cpf),
    obterEmailVotacao(filiado.cpf),
  ])

  return (
    <>
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
            {abertas.map((a) => {
              // A mesma regra do banner do Início e da cédula — as três telas
              // não podem dizer coisas diferentes (achado A3).
              const estado = estadoVotacao(a)
              // Votar e ver as datas no tamanho padrão: 44 px no toque (A119).
              const verDatas = a.rodadaId ? (
                <Button variant="outline" asChild>
                  <Link href={`/portal/votacao/rodada/${a.rodadaId}`}>
                    <CalendarClock />
                    Ver datas
                  </Link>
                </Button>
              ) : null
              // A contagem "encerra em" só faz sentido para quem pode votar
              // agora; antes da abertura ela enganava.
              const complemento =
                estado.chave === "votar" ? (
                  a.termino ? (
                    <ContagemRegressiva ate={a.termino} />
                  ) : (
                    "votação online"
                  )
                ) : estado.chave === "presencial" ? (
                  <>
                    Presencial — confira as datas
                    {a.inicio && <> · {formatarData(a.inicio)}</>}
                    {a.termino && <> a {formatarData(a.termino)}</>}
                  </>
                ) : null
              return (
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
                    {(a.empregador || complemento) && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {a.empregador}
                        {a.empregador && complemento && " · "}
                        {complemento}
                      </p>
                    )}
                    {estado.chave === "votar" && estado.detalhe && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {estado.detalhe}
                      </p>
                    )}
                  </div>
                  {estado.chave === "ja_votou" ? (
                    <Badge variant={estado.variante}>{estado.rotulo}</Badge>
                  ) : estado.chave === "nao_abriu" || estado.chave === "carencia" ? (
                    // Recusa EXPLICADA: sumir com o botão faria a pessoa achar
                    // que o sistema está quebrado.
                    <div className="flex max-w-xs flex-col items-start gap-1 sm:items-end sm:text-right">
                      <Badge variant={estado.variante}>{estado.rotulo}</Badge>
                      <p className="text-muted-foreground text-xs">
                        {estado.detalhe}
                      </p>
                      {/* Híbrida que ainda vai abrir: as datas das urnas já
                          podem ser conferidas. Na carência, não — ela é do
                          direito de votar, valha a porta que for. */}
                      {estado.chave === "nao_abriu" && estado.comUrna && verDatas}
                    </div>
                  ) : estado.chave === "votar" ? (
                    // gap-y-3: se "Ver datas" quebrar de linha, as áreas de toque não se sobrepõem.
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                      <Button asChild>
                        <Link href={`/portal/votacao/${a.assembleiaId}`}>
                          <Vote />
                          Votar agora
                        </Link>
                      </Button>
                      {estado.comUrna && verDatas}
                    </div>
                  ) : (
                    verDatas ?? (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <CalendarClock className="size-3.5" />
                        presencial
                      </span>
                    )
                  )}
                </div>
              )
            })}
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
          <EmailVotacaoForm
            emailAtual={emailVot.email}
            pendente={emailVot.pendente}
            preview={preview}
          />
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
              // id: o aviso "resultado publicado" aponta para #votacao-<id>; scroll-mt
              // tira o item de baixo do cabeçalho fixo.
              <div key={v.assembleiaId} id={`votacao-${v.assembleiaId}`} className="scroll-mt-20 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {v.nome ?? v.tema ?? "Assembleia"}
                  </p>
                  <span className="text-muted-foreground text-xs">
                    {v.quando ? `votou em ${formatarDataHora(v.quando)}` : ""}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {[
                    v.empregador,
                    v.tema,
                    ROTULOS_MODALIDADE[v.modalidade],
                    v.urna ? `urna: ${v.urna}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {v.comprovante && (
                  <div className="bg-muted/40 mt-2 grid gap-1 rounded-md border p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        Comprovante{" "}
                        <span className="text-foreground font-mono tracking-wider">
                          {v.comprovante.codigo}
                        </span>
                      </span>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/comprovante/${v.comprovante.codigo}`}>
                          <FileCheck2 />
                          Ver comprovante
                        </Link>
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      {ROTULO_CANAL[v.comprovante.canal]}
                      {v.comprovante.quando
                        ? ` · voto computado em ${formatarDataHora(v.comprovante.quando)}`
                        : ""}
                    </p>
                    {v.comprovante.hash && (
                      <p className="text-muted-foreground font-mono break-all">
                        SHA-256 {v.comprovante.hash}
                      </p>
                    )}
                  </div>
                )}
                {v.apuracaoEncerrada && v.resultado ? (
                  <div className="mt-2 grid gap-2">
                    {v.resultado.map((p) => (
                      <div key={p.perguntaId} className="text-xs">
                        {p.pergunta && (
                          <p className="font-medium">{p.pergunta}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {p.itens.map((it, i) => (
                            <span key={i}>
                              {it.rotulo}:{" "}
                              <strong className="tabular-nums">
                                {it.quantidade.toLocaleString("pt-BR")}
                              </strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
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
    </>
  )
}
