import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, Clock, Info, PauseCircle } from "lucide-react"

import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { ParteIndisponivel } from "@/components/portal/guarda-parte"
import {
  AtualizarAo,
  ContagemRegressiva,
  EnquantoAberta,
} from "@/components/portal/contagem-regressiva"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { estadoVotacao, quandoCurto } from "@/lib/assembleias-constantes"
import { bloqueioDaParte, configDaParte } from "@/lib/db/portal-partes"
import { ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import {
  elegibilidadeParaVotar,
  fimDaVotacao,
  participacaoNaAssembleia,
  perguntasDaAssembleia,
  type ParticipacaoNaAssembleia,
} from "@/lib/db/votacao-portal"
import { formatarDataHora } from "@/lib/formato"
import { mensagemDaSituacao } from "@/lib/portal-partes-constantes"

import { votarNaAssembleia } from "../actions"
import { ComprovanteVoto, type ComprovanteNaTela } from "../comprovante-voto"
import { SalaVirtualAviso } from "../sala-virtual"
import { CedulaForm } from "./cedula-form"

export const metadata: Metadata = { title: "Cédula" }

function naTela(p: ParticipacaoNaAssembleia | null): ComprovanteNaTela | null {
  if (!p) return null
  return {
    codigo: p.codigo,
    quando: p.quando,
    canal: p.canal ? ROTULO_CANAL[p.canal] : null,
    emailEnviado: p.emailEnviado,
  }
}

function jaPassou(iso: string | null | undefined): boolean {
  return Boolean(iso) && Date.parse(iso as string) <= Date.now()
}

export default async function CedulaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { id } = await params
  // A guarda do layout não impede a página de rodar: desabilitada, nada se
  // consulta (ver ../page.tsx).
  const parte = await configDaParte("votacao").catch(() => null)
  if (parte?.estado === "desabilitada") {
    return <ParteIndisponivel parte="votacao" mensagem={mensagemDaSituacao("votacao", parte)} preview={preview} />
  }

  const [eleg, bloqueio] = await Promise.all([
    filiado.ativo ? elegibilidadeParaVotar(filiado.cpf, id) : Promise.resolve(null),
    // Votação suspensa (ou o portal em modo de consulta): a cédula dá lugar
    // ao aviso, porque a action recusaria o voto. Na dúvida, vale.
    bloqueioDaParte("votacao").catch(() => null),
  ])
  // Mesma regra da lista e do banner do Início: a cédula só aparece quando dá
  // para votar AGORA. Antes ela abria antes da abertura e na carência, e o
  // bloqueio só chegava depois de a pessoa responder tudo (achado A89). As
  // travas do servidor (registrarVotoFiliado) continuam valendo.
  const estado = eleg ? estadoVotacao(eleg) : null
  const [perguntas, participacao, fim] = await Promise.all([
    estado?.chave === "votar" && !bloqueio ? perguntasDaAssembleia(id) : Promise.resolve([]),
    // O comprovante de quem já votou: logo depois do voto (a action revalida
    // e esta página é refeita no servidor, já no ramo "já votou") e para quem
    // volta depois, inclusive com a votação encerrada (A46).
    filiado.ativo && (!eleg || estado?.chave === "ja_votou")
      ? participacaoNaAssembleia(filiado.cpf, id)
      : Promise.resolve(null),
    // Fora da lista: a votação pode só ter encerrado — dizer quando, em vez
    // de insinuar erro de cadastro (A93).
    eleg ? Promise.resolve(null) : fimDaVotacao(id),
  ])
  // A data só vai na frase quando o término já passou: com a apuração
  // encerrada antes do fim previsto, "encerrou em" uma data futura confundia.
  const encerrada = fim?.encerrada === true
  const encerrouEm = encerrada && jaPassou(fim?.termino) ? quandoCurto(fim?.termino) : null

  return (
    <>
      <CabecalhoPagina
        secao="/portal/votacao"
        voltar={{ base: "/portal/votacao", rotulo: "Votação" }}
        titulo={eleg?.nome ?? "Cédula de votação"}
        subtitulo={eleg?.empregador ?? undefined}
      />

      {eleg?.sala && <SalaVirtualAviso sala={eleg.sala} />}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Cédula
          </CardTitle>
          {/* A instrução só vale quando as perguntas estão na tela. */}
          {estado?.chave === "votar" && !bloqueio && perguntas.length > 0 && (
            <CardDescription>Escolha uma opção em cada pergunta.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {preview && (
            <Alert variant="warning">
              <AlertDescription>
                Visualização da gestão — a cédula está aqui para você acompanhar
                o filiado, mas o voto só pode ser dado por ele, na conta dele.
              </AlertDescription>
            </Alert>
          )}
          {!eleg || !estado ? (
            participacao ? (
              <>
                <ComprovanteVoto
                  comprovante={naTela(participacao)}
                  titulo="Você votou nesta assembleia"
                  voltarHref="/portal/votacao"
                />
                {encerrouEm && (
                  <p className="text-muted-foreground text-sm">
                    A votação encerrou em {encerrouEm}.
                  </p>
                )}
              </>
            ) : encerrada ? (
              <Alert variant="info">
                <Clock />
                <AlertDescription>
                  {encerrouEm ? (
                    <>
                      A votação desta assembleia encerrou em{" "}
                      <strong>{encerrouEm}</strong> (horário de Brasília).
                    </>
                  ) : (
                    "A votação desta assembleia está encerrada."
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="warning">
                <AlertDescription>
                  Você não está apto a votar nesta assembleia, ou a votação não está
                  aberta.
                </AlertDescription>
              </Alert>
            )
          ) : estado.chave === "ja_votou" ? (
            <ComprovanteVoto
              comprovante={naTela(participacao)}
              voltarHref="/portal/votacao"
            />
          ) : estado.chave === "presencial" ? (
            <>
              <Alert variant="warning">
                <AlertDescription>
                  Esta assembleia é só presencial — não há cédula online. Confira
                  as datas de cada encontro.
                </AlertDescription>
              </Alert>
              {eleg.rodadaId && (
                <Button variant="outline" asChild className="w-fit">
                  <Link href={`/portal/votacao/rodada/${eleg.rodadaId}`}>
                    <CalendarClock />
                    Ver datas
                  </Link>
                </Button>
              )}
            </>
          ) : estado.chave === "nao_abriu" ? (
            // Sem contagem regressiva: só a data e a hora exatas. Quando a
            // abertura chega com a tela aberta, a página se refaz sozinha e a
            // cédula aparece (A93).
            <>
              <Alert variant="info">
                <AlertDescription>
                  A votação ainda não começou. Ela abre em{" "}
                  <strong>{formatarDataHora(eleg.abreEm)}</strong>. Volte a partir
                  desse horário para votar.
                </AlertDescription>
              </Alert>
              {eleg.abreEm && <AtualizarAo instante={eleg.abreEm} />}
            </>
          ) : estado.chave === "carencia" ? (
            // Mesmo texto da lista (motivo + data de liberação).
            <Alert variant="warning">
              <AlertTitle>{estado.rotulo}</AlertTitle>
              <AlertDescription>{estado.detalhe}</AlertDescription>
            </Alert>
          ) : bloqueio ? (
            // Fora do CedulaForm, que /votar e a urna também usam. Quem já
            // votou continua vendo o comprovante (ramo "ja_votou" acima).
            <Alert variant="warning">
              <PauseCircle />
              <AlertTitle>Voto pelo portal pausado</AlertTitle>
              <AlertDescription>
                A cédula não está disponível aqui por enquanto — veja o aviso no
                topo da página. Se você recebeu o link pessoal de votação por
                e-mail, ele continua valendo.
              </AlertDescription>
            </Alert>
          ) : perguntas.length === 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                A cédula desta assembleia ainda não tem perguntas.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {eleg.termino && (
                // A hora exata do fim, não só a contagem: é com ela que a
                // pessoa se organiza (A93).
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                  <Clock className="text-muted-foreground size-4 shrink-0" />
                  <span>
                    Aberta até <strong>{quandoCurto(eleg.termino)}</strong>{" "}
                    <span className="text-muted-foreground">(horário de Brasília)</span>
                  </span>
                  <span className="text-muted-foreground">
                    · <ContagemRegressiva ate={eleg.termino} />
                  </span>
                </p>
              )}
              {estado.detalhe && (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {estado.detalhe}
                </p>
              )}
              {eleg.termino ? (
                <EnquantoAberta
                  ate={eleg.termino}
                  depois={
                    <Alert variant="info">
                      <Clock />
                      <AlertDescription>
                        A votação desta assembleia encerrou em{" "}
                        <strong>{quandoCurto(eleg.termino)}</strong> (horário de
                        Brasília).
                      </AlertDescription>
                    </Alert>
                  }
                >
                  <CedulaForm
                    assembleiaId={id}
                    perguntas={perguntas}
                    acao={votarNaAssembleia}
                    voltarHref="/portal/votacao"
                    preview={preview}
                  />
                </EnquantoAberta>
              ) : (
                <CedulaForm
                  assembleiaId={id}
                  perguntas={perguntas}
                  acao={votarNaAssembleia}
                  voltarHref="/portal/votacao"
                  preview={preview}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
