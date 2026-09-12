import type { Metadata } from "next"
import Link from "next/link"
import { QrCode } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { SituacaoCupomBadge } from "@/app/painel/hospedagem/situacao-cupom-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  cuponsDoFiliado,
  hoteisDisponiveis,
  registrosDoCpf,
} from "@/lib/db/filiado-portal"
import { regrasDeUtilizacaoHospedagem } from "@/lib/db/hospedagem-condicoes"
import {
  ROTULO_SITUACAO_RESERVA,
  configDoHotel,
  ehGarantida,
  esperasDaPessoa,
  lerRegraNaoComparecimento,
  processarFilasDosHoteis,
  reservasGarantidasDaPessoa,
  type EsperaDaPessoa,
  type ReservaGarantida,
} from "@/lib/db/hospedagem-garantida"
import {
  dataBR,
  dataHoraBR,
  descreverRegraNaoComparecimento,
  descreverRegrasGarantida,
} from "@/lib/hospedagem-garantida-constantes"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"

import { PortalShell } from "../portal-shell"
import {
  CancelarEsperaBotao,
  CancelarMeuCupomBotao,
  CancelarReservaBotao,
  ConfirmarOfertaBotao,
  SolicitarCupomForm,
} from "./cupom-portal"
import { RegrasUtilizacao } from "./regras-utilizacao"

export const metadata: Metadata = { title: "Hospedagem — Portal do Associado" }

export default async function PortalHospedagemPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; pagina?: string; porPagina?: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const params = await searchParams
  const { salvo } = params

  const [cupons, hoteis, regras, registros] = await Promise.all([
    cuponsDoFiliado(filiado.cpf),
    hoteisDisponiveis(),
    regrasDeUtilizacaoHospedagem(),
    registrosDoCpf(filiado.cpf),
  ])

  // Demanda garantida: a fila de espera é processada aqui (sem agendador),
  // antes de ler reservas e ofertas da pessoa.
  const hoteisGarantidos = hoteis.filter(ehGarantida)
  let reservas: ReservaGarantida[] = []
  let esperas: EsperaDaPessoa[] = []
  let regraFaltas: string | null = null
  if (hoteisGarantidos.length > 0) {
    await processarFilasDosHoteis(hoteisGarantidos)
    const [r, e, regra] = await Promise.all([
      reservasGarantidasDaPessoa(registros, hoteis),
      esperasDaPessoa(registros, hoteis),
      lerRegraNaoComparecimento(),
    ])
    reservas = r
    esperas = e
    regraFaltas = descreverRegraNaoComparecimento(regra)
  }
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())

  // Página concorrida (formulário + lista): 10 por página.
  const paginacao = lerPaginacao(params, 10)
  const paginaAtual = paginar(cupons, paginacao)

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hospedagem</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cupons de hospedagem subsidiada nos hotéis parceiros do sindicato.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Cupom solicitado! Apresente-se no hotel na data prevista — a reserva
            é confirmada pelo hotel e a retirada do cupom não a garante.
          </AlertDescription>
        </Alert>
      )}

      <RegrasUtilizacao
        configuradas={regras.configuradas}
        observacao={regras.observacao}
        porHotel={hoteisGarantidos.map((h) => ({
          nome: h.nome ?? "Hotel parceiro",
          regras: descreverRegrasGarantida(configDoHotel(h)),
        }))}
        naoComparecimento={regraFaltas}
      />

      <AcaoVisualizacao
        preview={preview}
        nota="Somente o próprio associado pode solicitar um cupom."
      >
        <SolicitarCupomForm
          hoteis={hoteis.map((h) => ({
            id: h.id,
            nome: h.nome,
            garantida: ehGarantida(h),
            maxNoites: configDoHotel(h).maxNoites,
          }))}
          hoje={hoje}
        />
      </AcaoVisualizacao>

      {hoteisGarantidos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Minhas reservas</CardTitle>
            <CardDescription className="text-xs">
              Reservas nos hotéis de demanda garantida. Na chegada, apresente o
              QR Code e um documento oficial com foto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reservas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Você ainda não tem reservas.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hotel</TableHead>
                      <TableHead>Estadia</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservas.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-48 truncate font-medium">
                          {r.hotelNome ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {dataBR(r.checkIn)} a {dataBR(r.checkOut)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.situacao === "confirmada" || r.situacao === "hospedado"
                                ? "success"
                                : r.situacao === "nao_compareceu"
                                  ? "destructive"
                                  : r.situacao === "aguardando_confirmacao"
                                    ? "warning"
                                    : "outline"
                            }
                          >
                            {ROTULO_SITUACAO_RESERVA[r.situacao]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {(r.situacao === "confirmada" || r.situacao === "hospedado") && (
                              <Button variant="outline" size="sm" asChild className="h-7 px-2">
                                <Link href={`/portal/hospedagem/reserva/${r.id}`}>
                                  <QrCode />
                                  QR Code
                                </Link>
                              </Button>
                            )}
                            {r.podeCancelar && (
                              <AcaoVisualizacao preview={preview} nota="">
                                <CancelarReservaBotao id={r.id} />
                              </AcaoVisualizacao>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {esperas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lista de espera</CardTitle>
            <CardDescription className="text-xs">
              Quando abre vaga, ela fica guardada por algumas horas para você
              confirmar. Sem confirmação, passa para a próxima pessoa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {esperas.map((e) => (
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
                    {e.situacao === "aguardando" && "Na fila, aguardando vaga."}
                    {e.situacao === "oferecida" &&
                      `Abriu vaga! Confirme até ${e.ofertaExpiraEm ? dataHoraBR(new Date(e.ofertaExpiraEm)) : "—"}.`}
                    {e.situacao === "confirmada" && "Vaga confirmada: veja em Minhas reservas."}
                    {e.situacao === "expirada" && (e.motivo ?? "Pedido expirado.")}
                    {e.situacao === "cancelada" && (e.motivo ?? "Pedido cancelado.")}
                  </p>
                </div>
                {(e.situacao === "aguardando" || e.situacao === "oferecida") && (
                  <AcaoVisualizacao preview={preview} nota="">
                    <div className="flex flex-wrap items-center gap-1">
                      {e.situacao === "oferecida" && <ConfirmarOfertaBotao token={e.token} />}
                      <CancelarEsperaBotao id={e.id} />
                    </div>
                  </AcaoVisualizacao>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meus cupons</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Quarto coletivo
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Sua tarifa
                  </TableHead>
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
                {paginaAtual.linhas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-48 truncate font-medium">
                      {c.hotelNome ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(c.check_in)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {c.aceita_quarto_coletivo === true ? "Aceita" : "Não"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
                      {c.tarifa_hospede === null
                        ? "—"
                        : c.tarifa_hospede.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                    </TableCell>
                    <TableCell>
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
                ))}
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
            A tarifa aparece quando o hotel confirma a reserva, conforme a
            quantidade de pessoas no quarto. Os valores já incluem os impostos e
            a sua parte é paga no hotel, na entrada.
          </p>
        </CardContent>
      </Card>
    </PortalShell>
  )
}
