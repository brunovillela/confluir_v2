import type { Metadata } from "next"
import Link from "next/link"
import { BellRing, ChevronDown, QrCode } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { SituacaoCupomBadge } from "@/app/painel/hospedagem/situacao-cupom-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import {
  cadastroDoFiliado,
  contatosDosHoteis,
  cuponsDoFiliado,
  hoteisParaPedido,
  registrosDoCpf,
  tarifasDosHoteis,
} from "@/lib/db/filiado-portal"
import { listarHoteis } from "@/lib/db/hospedagem"
import { regrasDeUtilizacaoHospedagem } from "@/lib/db/hospedagem-condicoes"
import {
  ROTULO_SITUACAO_RESERVA,
  configDoHotel,
  direitoHospedagem,
  ehGarantida,
  esperasDaPessoa,
  lerRegraNaoComparecimento,
  reservasGarantidasDaPessoa,
  type EsperaDaPessoa,
  type ReservaGarantida,
  type SituacaoReserva,
} from "@/lib/db/hospedagem-garantida"
import {
  dataBR,
  dataHoraBR,
  descreverRegraNaoComparecimento,
  descreverRegrasGarantida,
  hojeEmSP,
  sexoValido,
} from "@/lib/hospedagem-garantida-constantes"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"

import {
  CancelarEsperaBotao,
  CancelarMeuCupomBotao,
  CancelarReservaBotao,
  ConfirmarOfertaBotao,
  SolicitarCupomForm,
  type HotelDoPortal,
} from "./cupom-portal"
import { AvaliacoesPendentes } from "./avaliacoes-pendentes"
import { ContatoDoHotel } from "./contato-hotel"
import { linhaDasTarifas, motivoDaCota } from "./direito"
import { RegrasUtilizacao } from "./regras-utilizacao"
import { pendenciasDaPessoa } from "@/lib/db/hospedagem-avaliacoes"
import { avaliacoesPendentesSoLeitura } from "@/lib/db/portal-inicio"

export const metadata: Metadata = { title: "Hospedagem — Portal do Associado" }

/** Pedido da fila encerrado há mais que isso sai da lista (achado A162). */
const DIAS_ESPERA_ENCERRADA = 30
/** "Anteriores" de Minhas reservas: só as mais recentes. */
const LIMITE_ANTERIORES = 20
/** Reservas que ainda vão acontecer (ou estão acontecendo). */
const PROXIMAS: SituacaoReserva[] = ["confirmada", "aguardando_confirmacao", "hospedado"]

function varianteDaReserva(s: SituacaoReserva) {
  if (s === "confirmada" || s === "hospedado") return "success" as const
  if (s === "nao_compareceu") return "destructive" as const
  if (s === "aguardando_confirmacao") return "warning" as const
  return "outline" as const
}

/** O que dizer de um pedido da fila, na lista. */
function textoDaEspera(e: EsperaDaPessoa, emDestaque: boolean, hoje: string): string {
  if (e.situacao === "aguardando") {
    return e.checkIn < hoje ? "A data do check-in passou sem vaga." : "Na fila, aguardando vaga."
  }
  if (e.situacao === "oferecida") {
    return emDestaque
      ? `Abriu vaga! Confirme até ${e.ofertaExpiraEm ? dataHoraBR(new Date(e.ofertaExpiraEm)) : "—"}.`
      : "O prazo para confirmar a vaga terminou."
  }
  if (e.situacao === "confirmada") return "Vaga confirmada: veja em Minhas reservas."
  if (e.situacao === "expirada") return e.motivo ?? "Pedido expirado."
  return e.motivo ?? "Pedido cancelado."
}

/** Resumo dobrável no fim de um cartão ("Ver anteriores", "Pedidos encerrados"). */
function Recolhido({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        {titulo}
        <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t">{children}</div>
    </details>
  )
}

/**
 * Ordem da página (achado A37): o que pede ação (vaga da lista de espera,
 * avaliação pendente) → o pedido, com o que o barraria dito antes → as
 * reservas, a fila e os cupons → as regras, recolhidas no fim.
 *
 * Só LÊ (achado A134): a lista de espera é processada onde a vaga muda e pelo
 * tick da Comunicação (lib/db/hospedagem-garantida.ts) — abrir a página não
 * reserva, não cancela nem manda e-mail. Uma oferta vencida que o tick ainda
 * não derrubou já aparece encerrada aqui (a situação é derivada do relógio).
 */
export default async function PortalHospedagemPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; hotel?: string; pagina?: string; porPagina?: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const params = await searchParams
  const { salvo } = params
  const agora = new Date()
  const hoje = hojeEmSP(agora)

  const [cupons, hoteis, regras, registros, cadastro] = await Promise.all([
    cuponsDoFiliado(filiado.cpf),
    listarHoteis(),
    regrasDeUtilizacaoHospedagem(),
    registrosDoCpf(filiado.cpf),
    cadastroDoFiliado(filiado.cpf),
  ])
  const ativos = hoteis.filter((h) => h.ativo !== false)
  const temGarantida = hoteis.some(ehGarantida)

  const [avaliacoesPendentes, paraPedido, reservas, esperas, tarifas, contatos, regraFaltasObj] =
    await Promise.all([
      // Estadias concluídas sem avaliação (abre as pendências na hora — menos
      // na visualização da gestão, que não grava nada; mesmo jeito do Início).
      preview ? avaliacoesPendentesSoLeitura(registros) : pendenciasDaPessoa(registros),
      hoteisParaPedido(ativos),
      reservasGarantidasDaPessoa(registros, hoteis),
      esperasDaPessoa(registros, hoteis),
      tarifasDosHoteis(ativos.map((h) => h.id)),
      contatosDosHoteis(ativos),
      temGarantida ? lerRegraNaoComparecimento() : Promise.resolve(null),
    ])
  const garantidosNoPedido = paraPedido.filter((p) => ehGarantida(p.hotel))
  const direito =
    paraPedido.length > 0
      ? await direitoHospedagem({
          cpf: filiado.cpf,
          registros,
          hoje,
          comFaltas: garantidosNoPedido.length > 0,
        })
      : { condicoesHoje: null, cota: null, faltas: null }
  const regraFaltas = regraFaltasObj ? descreverRegraNaoComparecimento(regraFaltasObj) : null

  // Condição da entidade que não depende da data. A cota, sim: o formulário
  // reavalia pela data escolhida — aqui ela não esconde o pedido.
  const bloqueio =
    direito.condicoesHoje && direito.condicoesHoje !== motivoDaCota(direito.cota, hoje)
      ? direito.condicoesHoje
      : null
  const pendente = avaliacoesPendentes[0]
  const travaAvaliacao = pendente
    ? `Antes de um novo pedido, avalie sua hospedagem${pendente.hotelNome ? ` no ${pendente.hotelNome}` : ""} — leva menos de um minuto, no cartão "Avalie sua hospedagem" no alto desta página.`
    : null

  const hoteisDoPedido: HotelDoPortal[] = paraPedido.map(({ hotel, vigenciaTermino }) => ({
    id: hotel.id,
    nome: hotel.nome,
    garantida: ehGarantida(hotel),
    maxNoites: configDoHotel(hotel).maxNoites,
    vigenciaTermino,
    tarifas: tarifas.get(hotel.id) ?? [],
    contato: contatos.get(hotel.id) ?? null,
  }))

  // Vaga da lista de espera ainda de pé: a reserva guardada aguarda confirmação.
  const reservaPorId = new Map(reservas.map((r) => [r.id, r]))
  const ofertas = esperas.filter(
    (e) =>
      e.situacao === "oferecida" &&
      !!e.cupomId &&
      reservaPorId.get(e.cupomId)?.situacao === "aguardando_confirmacao"
  )
  const emDestaque = new Set(ofertas.map((e) => e.id))
  // Pedido na fila com o check-in já passado também está encerrado — o tick
  // só o marca se o hotel segue ativo e de reserva na hora.
  const esperasAtivas = esperas.filter(
    (e) => (e.situacao === "aguardando" && e.checkIn >= hoje) || emDestaque.has(e.id)
  )
  const corte = agora.getTime() - DIAS_ESPERA_ENCERRADA * 86_400_000
  const esperasEncerradas = esperas.filter(
    (e) =>
      !esperasAtivas.includes(e) &&
      !!e.atualizadaEm &&
      new Date(e.atualizadaEm).getTime() >= corte
  )

  const proximas = reservas
    .filter((r) => PROXIMAS.includes(r.situacao))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const anteriores = reservas.filter((r) => !PROXIMAS.includes(r.situacao))
  const mostrarReservas = reservas.length > 0 || garantidosNoPedido.length > 0

  const hotelDoPedido = salvo === "1" && params.hotel ? ativos.find((h) => h.id === params.hotel) : null
  const contatoDoPedido = hotelDoPedido ? (contatos.get(hotelDoPedido.id) ?? null) : null

  // Página concorrida (formulário + lista): 10 por página.
  const paginacao = lerPaginacao(params, 10)
  const paginaAtual = paginar(cupons, paginacao)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hospedagem</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cupons de hospedagem subsidiada nos hotéis parceiros do sindicato.
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertTitle>Pedido registrado</AlertTitle>
          <AlertDescription>
            <p>
              Próximo passo: o hotel monta a reserva. Quando ele confirmar, o cupom aparece
              como Reservado em Meus cupons, com as datas, quantas pessoas ficaram no quarto e
              o valor da sua parte — e você recebe um aviso no sino.
            </p>
            {contatoDoPedido && (
              <div className="grid gap-1">
                <p>Dúvidas sobre a reserva? Fale com o {hotelDoPedido?.nome ?? "hotel"}:</p>
                <ContatoDoHotel contato={contatoDoPedido} />
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Precisa da sua ação: a vaga da lista de espera tem prazo de horas (A7). */}
      {ofertas.map((e) => (
        <Alert key={e.id} variant="warning">
          <BellRing />
          <AlertTitle>Abriu vaga para você no {e.hotelNome ?? "hotel parceiro"}</AlertTitle>
          <AlertDescription>
            <p>
              Check-in em {dataBR(e.checkIn)} e check-out em {dataBR(e.checkOut)}. A vaga fica
              guardada até{" "}
              <strong>{e.ofertaExpiraEm ? dataHoraBR(new Date(e.ofertaExpiraEm)) : "—"}</strong>
              ; sem confirmação, passa para a próxima pessoa da lista.
            </p>
            <AcaoVisualizacao preview={preview} nota="Somente o próprio associado pode confirmar.">
              <div className="flex flex-wrap items-center gap-2">
                <ConfirmarOfertaBotao token={e.token} />
                <CancelarEsperaBotao
                  id={e.id}
                  rotulo="Não vou poder ir"
                  confirmacao="Recusar esta vaga? Ela passa para a próxima pessoa da lista."
                />
              </div>
            </AcaoVisualizacao>
          </AlertDescription>
        </Alert>
      ))}

      <AvaliacoesPendentes pendencias={avaliacoesPendentes} preview={Boolean(preview)} />

      <SolicitarCupomForm
        hoteis={hoteisDoPedido}
        hoje={hoje}
        agora={agora.toISOString()}
        preview={preview}
        bloqueio={bloqueio}
        travaAvaliacao={travaAvaliacao}
        cota={direito.cota}
        faltas={direito.faltas}
        sexoAusente={garantidosNoPedido.length > 0 && !sexoValido(cadastro?.sexo)}
        regraFaltas={regraFaltas}
        observacao={regras.observacao}
      />

      {mostrarReservas && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Minhas reservas</CardTitle>
            <CardDescription className="text-xs">
              Reservas nos hotéis de reserva na hora. Na chegada, apresente o QR Code e um
              documento oficial com foto.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {proximas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma reserva próxima.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="tabela-cards">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hotel</TableHead>
                      <TableHead>Estadia</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proximas.map((r) => (
                      <LinhaDaReserva key={r.id} r={r} preview={preview} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {anteriores.length > 0 && (
              <Recolhido titulo={`Ver anteriores (${anteriores.length})`}>
                <ul className="divide-y">
                  {anteriores.slice(0, LIMITE_ANTERIORES).map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{r.hotelNome ?? "Hotel parceiro"}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {dataBR(r.checkIn)} a {dataBR(r.checkOut)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant={varianteDaReserva(r.situacao)}>
                          {ROTULO_SITUACAO_RESERVA[r.situacao]}
                        </Badge>
                        <Button variant="ghost" asChild>
                          <Link href={`/portal/hospedagem/reserva/${r.id}`}>Ver</Link>
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
                {anteriores.length > LIMITE_ANTERIORES && (
                  <p className="text-muted-foreground border-t px-3 py-2 text-xs">
                    Mostrando as {LIMITE_ANTERIORES} mais recentes.
                  </p>
                )}
              </Recolhido>
            )}
          </CardContent>
        </Card>
      )}

      {(esperasAtivas.length > 0 || esperasEncerradas.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lista de espera</CardTitle>
            <CardDescription className="text-xs">
              Quando abre vaga, ela fica guardada por algumas horas para você
              confirmar. Sem confirmação, passa para a próxima pessoa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {esperasAtivas.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum pedido na fila agora.</p>
            )}
            {esperasAtivas.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {e.hotelNome ?? "Hotel parceiro"} · {dataBR(e.checkIn)} a{" "}
                    {dataBR(e.checkOut)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {textoDaEspera(e, emDestaque.has(e.id), hoje)}
                  </p>
                </div>
                <AcaoVisualizacao preview={preview} nota="">
                  <div className="flex flex-wrap items-center gap-1">
                    {emDestaque.has(e.id) && <ConfirmarOfertaBotao token={e.token} />}
                    <CancelarEsperaBotao id={e.id} />
                  </div>
                </AcaoVisualizacao>
              </div>
            ))}
            {esperasEncerradas.length > 0 && (
              <Recolhido titulo={`Pedidos encerrados (${esperasEncerradas.length})`}>
                <ul className="divide-y">
                  {esperasEncerradas.map((e) => (
                    <li key={e.id} className="grid gap-0.5 px-3 py-2 text-sm">
                      <span className="font-medium">
                        {e.hotelNome ?? "Hotel parceiro"} · {dataBR(e.checkIn)} a{" "}
                        {dataBR(e.checkOut)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {textoDaEspera(e, false, hoje)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Recolhido>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meus cupons</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="tabela-cards">
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Estadia</TableHead>
                  <TableHead>Quarto coletivo</TableHead>
                  <TableHead>Sua parte</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginaAtual.total === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Você ainda não tem cupons.
                    </TableCell>
                  </TableRow>
                )}
                {paginaAtual.linhas.map((c) => {
                  const e = c.estadia
                  // O hotel confirmou outra data de entrada: é o que mais precisa ser visto.
                  const ajustado =
                    !!e?.checkIn && !!c.check_in && e.checkIn !== c.check_in.slice(0, 10)
                  return (
                    <TableRow key={c.id}>
                      <TableCell data-rotulo="Hotel" className="max-w-56 font-medium">
                        <span className="block truncate">{c.hotelNome ?? "—"}</span>
                        {e?.codigo && (
                          <span className="text-muted-foreground block text-xs font-normal">
                            Reserva {e.codigo}
                          </span>
                        )}
                      </TableCell>
                      <TableCell data-rotulo="Estadia" className="text-muted-foreground">
                        {e?.checkIn ? (
                          <span className="grid gap-0.5">
                            <span className="text-foreground">
                              {formatarData(e.checkIn)}
                              {e.checkOut ? ` a ${formatarData(e.checkOut)}` : ""}
                              {e.pessoas
                                ? ` · ${e.pessoas} ${e.pessoas === 1 ? "pessoa" : "pessoas"} no quarto`
                                : ""}
                            </span>
                            {ajustado && (
                              <span className="text-warning-fg text-xs">
                                O hotel ajustou a entrada (você pediu {formatarData(c.check_in)})
                              </span>
                            )}
                          </span>
                        ) : (
                          `Check-in previsto: ${formatarData(c.check_in)}`
                        )}
                      </TableCell>
                      <TableCell
                        data-rotulo="Quarto coletivo"
                        className={
                          c.aceita_quarto_coletivo === true
                            ? "text-muted-foreground"
                            : "text-muted-foreground max-sm:hidden!"
                        }
                      >
                        {c.aceita_quarto_coletivo === true ? "Aceita" : "Não"}
                      </TableCell>
                      <TableCell
                        data-rotulo="Sua parte"
                        className={
                          c.tarifa_hospede === null
                            ? "text-muted-foreground tabular-nums max-sm:hidden!"
                            : "text-muted-foreground tabular-nums"
                        }
                      >
                        {c.tarifa_hospede === null
                          ? "—"
                          : c.tarifa_hospede.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                      </TableCell>
                      <TableCell data-rotulo="Situação">
                        <SituacaoCupomBadge
                          cancelado={c.cancelado}
                          servicoId={c.servico_id}
                        />
                      </TableCell>
                      <TableCell>
                        {c.situacao === "aguardando" && (
                          <AcaoVisualizacao preview={preview} nota="">
                            <CancelarMeuCupomBotao id={c.id} />
                          </AcaoVisualizacao>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4">
            <Paginacao
              total={paginaAtual.total}
              pagina={paginaAtual.pagina}
              totalPaginas={paginaAtual.totalPaginas}
              porPagina={paginacao.porPagina}
              padrao={10}
            />
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            O valor cobrado é o da ocupação que o hotel confirmar — quantas pessoas ficaram
            no quarto —, conforme as tarifas do convênio. Os valores já incluem os impostos e
            a sua parte é paga no hotel, na entrada.
          </p>
        </CardContent>
      </Card>

      <RegrasUtilizacao
        configuradas={regras.configuradas}
        porHotel={garantidosNoPedido.map(({ hotel }) => ({
          nome: hotel.nome ?? "Hotel parceiro",
          regras: descreverRegrasGarantida(configDoHotel(hotel)),
        }))}
        naoComparecimento={regraFaltas}
        valores={hoteisDoPedido.map((h) => ({
          nome: h.nome ?? "Hotel parceiro",
          linha: linhaDasTarifas(h.tarifas),
        }))}
      />
    </>
  )
}

/** Linha de "Minhas reservas" (próximas): QR, confirmação da vaga e cancelamento. */
function LinhaDaReserva({ r, preview }: { r: ReservaGarantida; preview: boolean }) {
  return (
    <TableRow>
      <TableCell data-rotulo="Hotel" className="max-w-48 truncate font-medium">
        {r.hotelNome ?? "—"}
      </TableCell>
      <TableCell data-rotulo="Estadia" className="text-muted-foreground whitespace-nowrap">
        {dataBR(r.checkIn)} a {dataBR(r.checkOut)}
      </TableCell>
      <TableCell data-rotulo="Situação">
        <span className="grid justify-items-end gap-0.5 sm:justify-items-start">
          <Badge variant={varianteDaReserva(r.situacao)}>
            {ROTULO_SITUACAO_RESERVA[r.situacao]}
          </Badge>
          {r.situacao === "aguardando_confirmacao" && r.confirmarAte && (
            <span className="text-muted-foreground text-xs">
              guardada até {dataHoraBR(new Date(r.confirmarAte))}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-1">
          {(r.situacao === "confirmada" || r.situacao === "hospedado") && (
            <Button variant="outline" asChild>
              <Link href={`/portal/hospedagem/reserva/${r.id}`}>
                <QrCode />
                QR Code
              </Link>
            </Button>
          )}
          {r.situacao === "aguardando_confirmacao" && r.esperaToken && (
            <AcaoVisualizacao preview={preview} nota="">
              <ConfirmarOfertaBotao token={r.esperaToken} />
            </AcaoVisualizacao>
          )}
          {r.podeCancelar && (
            <AcaoVisualizacao preview={preview} nota="">
              <CancelarReservaBotao id={r.id} />
            </AcaoVisualizacao>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
