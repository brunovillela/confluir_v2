import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, Clock, FileCheck2, PauseCircle, ShieldCheck, Vote } from "lucide-react"

import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import {
  AtualizarAo,
  ContagemRegressiva,
  EnquantoAberta,
} from "@/components/portal/contagem-regressiva"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { ParteIndisponivel } from "@/components/portal/guarda-parte"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import {
  estadoVotacao,
  hojeEmBrasilia,
  quandoCurto,
  ROTULOS_MODALIDADE,
} from "@/lib/assembleias-constantes"
import { bloqueioDaParte, configDaParte, estadoDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import { ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import {
  assembleiasDoFiliado,
  minhasVotacoes,
  obterEmailVotacao,
} from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { mensagemDaSituacao, opcoesPadrao } from "@/lib/portal-partes-constantes"

import { EmailVotacaoForm } from "./email-form"
import { SalaVirtualAviso } from "./sala-virtual"

export const metadata: Metadata = { title: "Votação" }

/** Menos de 24 h para o fim: o selo "Último dia" dá a urgência (A93). */
function ultimoDia(termino: string | null): boolean {
  if (!termino) return false
  const resta = Date.parse(termino) - Date.now()
  return resta > 0 && resta < 24 * 60 * 60 * 1000
}

const LINK_ATENDIMENTO = `/portal/atendimento?assunto=cadastro&titulo=${encodeURIComponent(
  "Votação não aparece no portal"
)}`

export default async function VotacaoPortalPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  // O layout guarda a seção, mas não impede a página de rodar (nem de ir no
  // RSC) e não se refaz ao navegar dentro dela: desabilitada, nada se consulta.
  const parte = await configDaParte("votacao").catch(() => null)
  if (parte?.estado === "desabilitada") {
    return <ParteIndisponivel parte="votacao" mensagem={mensagemDaSituacao("votacao", parte)} preview={preview} />
  }

  // Filiados › Área do associado: com a Votação suspensa (ou o portal em modo
  // de consulta), a lista e o histórico continuam, mas o "Votar agora" e o
  // cadastro do e-mail saem — as actions recusariam. Na dúvida, vale.
  const [abertas, historico, emailVot, bloqueio, opcoes, atendimento] = await Promise.all([
    filiado.ativo ? assembleiasDoFiliado(filiado.cpf) : Promise.resolve([]),
    minhasVotacoes(filiado.cpf),
    obterEmailVotacao(filiado.cpf),
    bloqueioDaParte("votacao").catch(() => null),
    opcoesDaParte("votacao").catch(() => opcoesPadrao("votacao")),
    estadoDaParte("atendimento").catch(() => "habilitada" as const),
  ])
  const comEmailVotacao = opcoes.email_votacao
  const comAtendimento = atendimento !== "desabilitada"

  return (
    <>
      <CabecalhoPagina
        secao="/portal/votacao"
        titulo="Votação"
        subtitulo="Suas assembleias abertas e o histórico de participação."
      />

      {!filiado.ativo && (
        <Alert variant="warning">
          <AlertDescription>
            A votação pela área do filiado é para filiações ativas.
          </AlertDescription>
        </Alert>
      )}

      {/* Sem assembleia aberta: a página começa explicando, não pelo
          formulário de e-mail (A90). Inativo já tem o aviso acima. */}
      {filiado.ativo && abertas.length === 0 && (
        <Card>
          <CardContent className="grid gap-3 text-sm">
            <p className="flex items-start gap-3">
              <Vote className="text-muted-foreground mt-0.5 size-5 shrink-0" />
              <span className="grid gap-1">
                <span className="font-medium">
                  Nenhuma assembleia aberta para você no momento
                </span>
                <span className="text-muted-foreground">
                  Aqui você vota nas assembleias online e confere as datas das
                  presenciais. Quando a entidade abrir uma votação em que você
                  está apto — pela lista de trabalhadores da sua empresa —, ela
                  aparece nesta página e você recebe um aviso. As votações de que
                  você já participou ficam em Minhas votações, logo abaixo.
                </span>
              </span>
            </p>
            {/* Cada caminho só aparece se a seção/parte de destino existe. */}
            {(comEmailVotacao || comAtendimento) && (
              <p className="text-muted-foreground border-t pt-3">
                Recebeu um aviso de votação e ela não aparece aqui?{" "}
                {comEmailVotacao && (
                  <a href="#email-votacao" className="text-primary font-medium underline underline-offset-4">
                    Confira seu e-mail de votação
                  </a>
                )}
                {comEmailVotacao && comAtendimento && " ou "}
                {comAtendimento && (
                  <Link href={LINK_ATENDIMENTO} className="text-primary font-medium underline underline-offset-4">
                    {comEmailVotacao ? "fale com o Atendimento" : "Fale com o Atendimento"}
                  </Link>
                )}
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assembleias abertas */}
      {abertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Assembleias abertas
            </CardTitle>
            <CardDescription>
              Você está apto a participar destas votações. Horários de Brasília.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {abertas.map((a) => {
              // A mesma regra do banner do Início e da cédula — as três telas
              // não podem dizer coisas diferentes (achado A3).
              const estado = estadoVotacao(a)
              // O término vem em ISO (UTC): o fim do dia em Brasília já é o dia
              // seguinte em UTC, e formatarData lê só a data do texto — saía
              // "12/10 a 13/10" numa assembleia de um dia só.
              const diaDoFim = a.termino ? hojeEmBrasilia(new Date(a.termino)) : null
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
              // agora; antes da abertura ela enganava. Junto dela, a hora
              // exata do fim — é com ela que a pessoa se organiza (A93).
              const complemento =
                estado.chave === "votar" ? (
                  a.termino ? (
                    <>
                      <ContagemRegressiva ate={a.termino} atualizarAoZerar={false} />
                      {" · "}até {quandoCurto(a.termino)}
                    </>
                  ) : (
                    "votação online"
                  )
                ) : estado.chave === "presencial" ? (
                  <>
                    Presencial — confira as datas
                    {a.inicio && (
                      <>
                        {" · "}
                        {formatarData(a.inicio)}
                        {a.horaInicio && <> às {a.horaInicio}</>}
                      </>
                    )}
                    {/* Sem dia de início, "a 13/10" ficava solto: vira "até". */}
                    {diaDoFim && diaDoFim !== a.inicio?.slice(0, 10) && (
                      <>{a.inicio ? " a " : " · até "}{formatarData(diaDoFim)}</>
                    )}
                  </>
                ) : null
              const botaoVotar = bloqueio ? (
                // Votação suspensa no portal: a cédula recusaria. Explicado no
                // lugar do botão, como o "ainda não abriu" — o link pessoal
                // (/votar) não depende do portal.
                <div className="flex max-w-xs flex-col items-start gap-1 sm:items-end sm:text-right">
                  <Badge variant="warning">
                    <PauseCircle />
                    Voto pelo portal pausado
                  </Badge>
                  <p className="text-muted-foreground text-xs">
                    Veja o aviso no topo da página. Se você recebeu o link
                    pessoal de votação por e-mail, ele continua valendo.
                  </p>
                  {estado.comUrna && verDatas}
                </div>
              ) : (
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
              )
              return (
                <div key={a.assembleiaId} className="grid gap-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {a.nome ?? a.tema ?? "Assembleia"}
                        <Badge variant="outline" className="ml-2 align-middle">
                          {ROTULOS_MODALIDADE[a.modalidade]}
                        </Badge>
                        {estado.chave === "votar" && ultimoDia(a.termino) && (
                          <Badge variant="warning" className="ml-2 align-middle">
                            <Clock />
                            Último dia
                          </Badge>
                        )}
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
                        {/* Quando a abertura chega com a tela aberta, a página
                            se refaz e o botão de votar aparece. */}
                        {estado.chave === "nao_abriu" && a.abreEm && (
                          <AtualizarAo instante={a.abreEm} />
                        )}
                      </div>
                    ) : estado.chave === "votar" ? (
                      a.termino ? (
                        // Contagem a zero: o botão sai e a linha diz que
                        // encerrou, em vez de levar a uma recusa que parecia
                        // erro de cadastro (A93).
                        <EnquantoAberta
                          ate={a.termino}
                          depois={
                            <div className="flex max-w-xs flex-col items-start gap-1 sm:items-end sm:text-right">
                              <Badge variant="outline">Votação encerrada</Badge>
                              <p className="text-muted-foreground text-xs">
                                Encerrou em {quandoCurto(a.termino)}.
                              </p>
                            </div>
                          }
                        >
                          {botaoVotar}
                        </EnquantoAberta>
                      ) : (
                        botaoVotar
                      )
                    ) : (
                      verDatas ?? (
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                          <CalendarClock className="size-3.5" />
                          presencial
                        </span>
                      )
                    )}
                  </div>
                  {/* Sala da reunião online, para quem está apto (A47). */}
                  {a.sala && <SalaVirtualAviso sala={a.sala} />}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Minhas votações */}
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Minhas votações
          </CardTitle>
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
            <EstadoVazio icone={Vote} titulo="Você ainda não tem participações registradas." />
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
                      {/* A página pública do comprovante tem "Voltar ao
                          portal" para quem está logado (A151). */}
                      <Button variant="outline" asChild>
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
                    {/* O resumo inteiro (64 caracteres) virava três linhas
                        no celular. Aqui, o começo — o bastante para bater
                        com o e-mail; o completo está em "Ver comprovante"
                        (A166). */}
                    {v.comprovante.hash && (
                      <p className="text-muted-foreground" title={v.comprovante.hash}>
                        Resumo SHA-256{" "}
                        <span className="font-mono">{v.comprovante.hash.slice(0, 12)}…</span>{" "}
                        (completo no comprovante)
                      </p>
                    )}
                  </div>
                )}
                {/* Entidade que só divulga o resultado em ata ou edital desliga
                    o placar em Filiados › Área do associado: nem o placar nem
                    a promessa de que ele vem. */}
                {!opcoes.mostrar_resultado ? null : v.apuracaoEncerrada && v.resultado ? (
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
                    {v.resultadoHash && (
                      <details className="text-muted-foreground text-xs">
                        <summary className="cursor-pointer">
                          Conferência do resultado (SHA-256{" "}
                          <span className="font-mono">{v.resultadoHash.slice(0, 12)}…</span>)
                        </summary>
                        <p className="mt-1">
                          Calculado no encerramento da apuração. É o mesmo hash
                          do relatório oficial: se o resultado mudasse, o hash
                          mudaria.
                        </p>
                        <p className="mt-1 font-mono break-all">{v.resultadoHash}</p>
                      </details>
                    )}
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

      {/* E-mail de votação: tarefa rara, que só serve a quem a empresa
          mandou sem CPF — vira seção secundária, recolhida, no fim (A91).
          Abre sozinha só quando pode ser a explicação do "não aparece".
          Sai inteira quando a gestão desliga o e-mail de votação. */}
      {filiado.ativo && comEmailVotacao && (
        <Card id="email-votacao" className="scroll-mt-20">
          <CardContent>
            <Accordion
              type="single"
              collapsible
              defaultValue={!emailVot.email && abertas.length === 0 ? "email" : undefined}
            >
              <AccordionItem value="email">
                <AccordionTrigger className="min-h-11 items-center">
                  {emailVot.email
                    ? "E-mail de votação"
                    : "Não encontrou sua votação? Cadastre seu e-mail de votação"}
                </AccordionTrigger>
                {/* h-auto: o AccordionContent fixa a altura medida ao abrir, e o
                    Radix não mede de novo — o campo do código, os avisos e o
                    "Trocar" que aparecem depois ficavam cortados. */}
                <AccordionContent className="grid h-auto gap-4 [&_p:not(:last-child)]:mb-0">
                  <p className="text-muted-foreground">
                    Algumas empresas mandam a lista de quem vota só com o e-mail,
                    sem CPF. Informe o e-mail que sua empresa tem no cadastro
                    (geralmente o corporativo): confirmado, ele faz as votações
                    dessa lista aparecerem aqui. Se for o mesmo do seu cadastro na
                    entidade, ele vale na hora.
                  </p>
                  <EmailVotacaoForm
                    emailAtual={emailVot.email}
                    pendente={emailVot.pendente}
                    emailCadastro={filiado.email}
                    preview={preview}
                    pausado={Boolean(bloqueio)}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </>
  )
}
