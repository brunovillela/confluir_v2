"use client"

import { startTransition, useActionState, useState } from "react"
import Link from "next/link"
import { BedDouble, Check, ListPlus, Loader2, Ticket, X } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import type { ContatoHotel } from "@/lib/db/filiado-portal"
import type { CotaHospedagem, FaltasHospedagem } from "@/lib/db/hospedagem-garantida"
import { formatarData } from "@/lib/formato"

import {
  cancelarEsperaPortal,
  cancelarMeuCupom,
  cancelarReservaPortal,
  confirmarOfertaPortal,
  entrarNaEsperaPortal,
  solicitarCupom,
  type EstadoPedidoHospedagem,
} from "./actions"
import { ContatoDoHotel } from "./contato-hotel"
import {
  bloqueioPorFaltas,
  linhaDasTarifas,
  motivoDaCota,
  motivoDasFaltas,
  resumoDaCota,
} from "./direito"

export type HotelDoPortal = {
  id: string
  nome: string | null
  /** Demanda garantida: o pedido já é a reserva. */
  garantida: boolean
  maxNoites: number
  /** Último dia do convênio (AAAA-MM-DD): limite do check-in (A75). */
  vigenciaTermino: string | null
  /** Parte do associado conforme as pessoas no quarto (A8). */
  tarifas: { pessoas: number; valor: number }[]
  /** Endereço e telefone do hotel (A40). */
  contato: ContatoHotel | null
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

/** O portal não edita o sexo do cadastro: a correção é pedida em Atendimento. */
const LINK_CORRIGIR_SEXO = `/portal/atendimento?assunto=cadastro&titulo=${encodeURIComponent(
  "Informar o sexo no meu cadastro"
)}`

const MOTIVO_SEXO =
  "Este hotel reserva o quarto na hora, pelo sexo do cadastro — e o seu está sem essa informação."
/** Mesmo motivo, quando todos os hotéis do pedido são de reserva na hora (nenhum escolhido). */
const MOTIVO_SEXO_TODOS =
  "Os hotéis parceiros reservam o quarto na hora, pelo sexo do cadastro — e o seu está sem essa informação."

/** Pedir a correção do sexo: em Atendimento, ou ao sindicato com o Atendimento fora do portal. */
function CorrigirSexo({ atendimento, oQue = "a correção" }: { atendimento: boolean; oQue?: string }) {
  return atendimento ? (
    <Link href={LINK_CORRIGIR_SEXO}>Peça {oQue} em Atendimento</Link>
  ) : (
    <>Peça {oQue} ao sindicato</>
  )
}

/** "Ver todas as regras": abre a seção recolhida no fim da página e rola até ela. */
function abrirRegras() {
  const grupo = document.querySelector<HTMLDetailsElement>("#regras-hospedagem details")
  if (grupo) grupo.open = true
}

/**
 * Pedido de hospedagem. O que a action recusaria aparece ANTES de enviar
 * (achado A38): condição da entidade, suspensão ou direito desabilitado
 * escondem o formulário; cota do mês, falta que consome o período, sexo
 * ausente e avaliação pendente desligam o botão com o motivo ao lado dele.
 * A action continua conferindo tudo — isto é a mesma regra, dita antes.
 * Hospedagem suspensa (ou o portal em consulta): nem o formulário nem a
 * lista de espera aparecem, só o aviso.
 */
export function SolicitarCupomForm({
  hoteis,
  hoje,
  agora,
  preview = false,
  suspensao = null,
  atendimento = true,
  bloqueio = null,
  travaAvaliacao = null,
  cota = null,
  faltas = null,
  sexoAusente = false,
  regraFaltas = null,
  observacao = null,
}: {
  hoteis: HotelDoPortal[]
  hoje: string
  /** Instante (ISO) da página: servidor e navegador avaliam as faltas igual. */
  agora: string
  /** "Ver como filiado": escolher hotel e datas funciona; enviar, não. */
  preview?: boolean
  /** Pedidos parados (Área do associado): o texto da recusa, o mesmo da action. */
  suspensao?: string | null
  /** O Atendimento está no portal: os "peça em Atendimento" viram link. */
  atendimento?: boolean
  /** Condição da entidade que vale para qualquer data (lista, fonte, regime). */
  bloqueio?: string | null
  /** Avaliação de hospedagem pendente: trava o pedido até ser feita. */
  travaAvaliacao?: string | null
  cota?: CotaHospedagem | null
  /** Regra de não comparecimento ligada (só hotéis de reserva na hora). */
  faltas?: FaltasHospedagem | null
  /** Cadastro sem sexo (obrigatório nos hotéis de reserva na hora). */
  sexoAusente?: boolean
  /** A regra de não comparecimento em frase, para junto do "Reservar". */
  regraFaltas?: string | null
  /** Aviso do sindicato (Configurações de filiação), lido antes de pedir. */
  observacao?: string | null
}) {
  const [estado, formAction, pendente] = useActionState<EstadoPedidoHospedagem, FormData>(
    solicitarCupom,
    {}
  )
  // Campos controlados: um erro devolvido pela action não apaga o que foi escolhido.
  const [hotelId, setHotelId] = useState("")
  const [checkIn, setCheckIn] = useState("")
  const [checkOut, setCheckOut] = useState("")
  const [coletivo, setColetivo] = useState(false)
  const hotel = hoteis.find((h) => h.id === hotelId)
  const garantida = hotel?.garantida === true
  const instante = new Date(agora)

  // Datas: check-in de hoje até o fim do convênio; na reserva na hora, até
  // N noites e com a última noite ainda dentro do convênio.
  const maxCheckIn = hotel?.vigenciaTermino ?? undefined
  const minCheckOut = somarDias(checkIn || hoje, 1)
  const limitesCheckOut = [
    hotel && checkIn ? somarDias(checkIn, hotel.maxNoites) : null,
    hotel?.vigenciaTermino ? somarDias(hotel.vigenciaTermino, 1) : null,
  ].filter((v): v is string => !!v)
  const maxCheckOut = limitesCheckOut.length ? limitesCheckOut.sort()[0] : undefined

  const soGarantida = hoteis.length > 0 && hoteis.every((h) => h.garantida)
  const algumaGarantida = hoteis.some((h) => h.garantida)
  const faltasEmQualquerData = bloqueioPorFaltas(faltas, hoje, instante)

  // Nada pode ser pedido: o formulário dá lugar ao motivo.
  const bloqueioTotal =
    bloqueio ??
    (soGarantida ? (faltasEmQualquerData ?? (sexoAusente ? MOTIVO_SEXO_TODOS : null)) : null)
  const bloqueioPorSexo = !bloqueio && soGarantida && !faltasEmQualquerData && sexoAusente

  // O que barra ESTE pedido (hotel e data escolhidos): botão desligado, com a razão.
  const motivo =
    travaAvaliacao ??
    (garantida && sexoAusente ? MOTIVO_SEXO : null) ??
    (garantida ? faltasEmQualquerData : null) ??
    (checkIn ? motivoDaCota(cota, checkIn) : null) ??
    (garantida && checkIn ? motivoDasFaltas(faltas, checkIn, instante) : null)

  const linhaValor = hotel ? linhaDasTarifas(hotel.tarifas) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Solicitar hospedagem
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {observacao && (
          <div className="border-primary grid gap-0.5 border-l-2 pl-3">
            <p className="text-xs font-medium">Aviso do sindicato</p>
            <p className="text-muted-foreground text-sm whitespace-pre-line">{observacao}</p>
          </div>
        )}

        {suspensao ? (
          <Alert variant="info">
            <AlertTitle>Novos pedidos estão suspensos</AlertTitle>
            <AlertDescription>
              <p>{suspensao}</p>
              <p>
                Cancelar um cupom ou uma reserva e sair da lista de espera continuam
                funcionando.
              </p>
            </AlertDescription>
          </Alert>
        ) : hoteis.length === 0 ? (
          <Alert variant="info">
            <AlertDescription>
              Nenhum hotel parceiro está com o convênio em vigor no momento. Quando houver,
              o pedido é feito aqui.
            </AlertDescription>
          </Alert>
        ) : bloqueioTotal ? (
          <Alert variant="warning">
            <AlertTitle>Você não pode pedir hospedagem agora</AlertTitle>
            <AlertDescription>
              <p>{bloqueioTotal}</p>
              {bloqueioPorSexo ? (
                <p>
                  <CorrigirSexo atendimento={atendimento} oQue="a correção do cadastro" />.
                </p>
              ) : atendimento ? (
                <p>
                  Se acha que há engano,{" "}
                  <Link
                    href={`/portal/atendimento?assunto=outro&titulo=${encodeURIComponent("Hospedagem")}`}
                  >
                    fale com o sindicato em Atendimento
                  </Link>
                  .
                </p>
              ) : (
                <p>Se acha que há engano, fale com o sindicato.</p>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {cota && (
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">
                  {resumoDaCota(cota, checkIn || hoje)}.
                </span>{" "}
                Limite do sindicato: {cota.limite}{" "}
                {cota.limite === 1 ? "cupom" : "cupons"} por{" "}
                {cota.periodo === "ano" ? "ano" : "mês"}, contado pela data de check-in.
              </p>
            )}
            {algumaGarantida && sexoAusente && (
              <Alert variant="info">
                <AlertDescription>
                  Os hotéis de reserva na hora pedem o sexo do cadastro, e o seu está sem
                  essa informação. <CorrigirSexo atendimento={atendimento} />.
                </AlertDescription>
              </Alert>
            )}

            <form
              // Pelo onSubmit, e não por `action`: o React 19 limpa o formulário
              // depois de uma action — o seletor de hotel voltava a mostrar o
              // primeiro da lista (com o estado ainda no escolhido: o reenvio ia
              // para outro hotel) e o quarto coletivo, a desmarcado (A149). Na
              // visualização da gestão, nada é enviado.
              onSubmit={(e) => {
                e.preventDefault()
                if (preview) return
                const dados = new FormData(e.currentTarget)
                startTransition(() => formAction(dados))
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <ErroNoCampo estado={estado} />
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="hotel_id">Hotel *</Label>
                <SelectNativo
                  id="hotel_id"
                  name="hotel_id"
                  required
                  value={hotelId}
                  onChange={(e) => setHotelId(e.target.value)}
                >
                  <option value="" disabled>
                    Escolha o hotel parceiro
                  </option>
                  {hoteis.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nome ?? "(sem nome)"}
                      {h.garantida ? " — reserva na hora" : ""}
                    </option>
                  ))}
                </SelectNativo>
                {hotel && (
                  <div className="bg-muted/40 mt-1 grid gap-2 rounded-lg border p-3 text-sm">
                    {/* Sem tarifa cadastrada: nunca "sem custo" por dedução (A8). */}
                    {linhaValor ? (
                      <p>
                        <span className="text-muted-foreground">
                          Sua parte, paga no hotel na entrada:{" "}
                        </span>
                        {linhaValor}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Valor da sua parte: confirme com o sindicato.
                      </p>
                    )}
                    <ContatoDoHotel contato={hotel.contato} />
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="check_in">{garantida ? "Check-in *" : "Check-in previsto *"}</Label>
                <Input
                  id="check_in"
                  name="check_in"
                  type="date"
                  min={hoje}
                  max={maxCheckIn}
                  required
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
                {hotel?.vigenciaTermino && (
                  <p className="text-muted-foreground text-xs">
                    Convênio válido até {formatarData(hotel.vigenciaTermino)}.
                  </p>
                )}
              </div>
              {garantida && (
                <div className="grid gap-1.5">
                  <Label htmlFor="check_out">Check-out *</Label>
                  <Input
                    id="check_out"
                    name="check_out"
                    type="date"
                    min={minCheckOut}
                    max={maxCheckOut}
                    required
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              )}
              <div className="grid content-end pb-1 sm:col-span-2">
                {garantida ? (
                  <>
                    <input type="hidden" name="aceita_quarto_coletivo" value="on" />
                    <label className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Checkbox checked disabled />
                      Quarto compartilhado com pessoas do mesmo sexo (obrigatório neste hotel)
                    </label>
                  </>
                ) : (
                  <label className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Checkbox
                      name="aceita_quarto_coletivo"
                      checked={coletivo}
                      onCheckedChange={(v) => setColetivo(v === true)}
                    />
                    Aceito ficar em quarto coletivo (compartilhado com pessoas do mesmo
                    sexo)
                  </label>
                )}
              </div>
              <p className="text-muted-foreground text-xs sm:col-span-2">
                {garantida
                  ? `Neste hotel o pedido já é a reserva: o quarto é definido na hora e o hotel é obrigado a hospedar você. Estadia de até ${hotel?.maxNoites} noite(s). Se não puder ir, cancele dentro do prazo. ${regraFaltas ?? "Reserva sem comparecimento pode gerar punição."} `
                  : "A retirada do cupom não garante a reserva nem o serviço — a reserva é confirmada pelo hotel. Mesmo aceitando quarto coletivo, a sua tarifa será a referente à quantidade de pessoas no quarto, conforme a reserva. "}
                <a
                  href="#regras-hospedagem"
                  onClick={abrirRegras}
                  className="text-foreground underline underline-offset-3"
                >
                  Ver todas as regras
                </a>
              </p>

              {/* Erros e motivos JUNTO do botão (A149): é ali que está o olhar
                  de quem acabou de tocar. Erro de um campo vai para o campo. */}
              {motivo && (
                <div className="sm:col-span-2">
                  <Alert variant="warning" id="motivo-pedido">
                    <AlertDescription>
                      {motivo}
                      {garantida && sexoAusente && !travaAvaliacao && (
                        <>
                          {" "}
                          <CorrigirSexo atendimento={atendimento} />.
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
              {estado.erro && !estado.campo && (
                <div className="sm:col-span-2">
                  <Alert variant="destructive">
                    <AlertDescription>{estado.erro}</AlertDescription>
                  </Alert>
                </div>
              )}
              <div className="flex justify-end sm:col-span-2">
                <AcaoVisualizacao
                  preview={preview}
                  nota="Somente o próprio associado pode solicitar um cupom."
                >
                  <Button
                    type="submit"
                    disabled={pendente || !!motivo}
                    aria-describedby={motivo ? "motivo-pedido" : undefined}
                  >
                    {pendente ? (
                      <Loader2 className="animate-spin" />
                    ) : garantida ? (
                      <BedDouble />
                    ) : (
                      <Ticket />
                    )}
                    {garantida ? "Reservar" : "Solicitar cupom"}
                  </Button>
                </AcaoVisualizacao>
              </div>
            </form>

            {estado.espera && (
              <EntrarNaEsperaForm
                hotelId={estado.espera.hotelId}
                checkIn={estado.espera.checkIn}
                checkOut={estado.espera.checkOut}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function EntrarNaEsperaForm({
  hotelId,
  checkIn,
  checkOut,
}: {
  hotelId: string
  checkIn: string
  checkOut: string
}) {
  const [estado, formAction, pendente] = useActionState(entrarNaEsperaPortal, {})

  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="grid gap-2 rounded-lg border p-3">
      <input type="hidden" name="hotel_id" value={hotelId} />
      <input type="hidden" name="check_in" value={checkIn} />
      <input type="hidden" name="check_out" value={checkOut} />
      <p className="text-sm">
        Quer entrar na lista de espera para essas datas? Se abrir vaga, você
        recebe um e-mail e um aviso aqui no portal com um botão para confirmar.
      </p>
      {/* Alert: o role="alert" faz o leitor de tela dizer que não deu (A139). */}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ListPlus />}
          Entrar na lista de espera
        </Button>
      </div>
    </form>
  )
}

function BotaoAcao({
  acao,
  campo,
  valor,
  rotulo,
  confirmacao,
  variante = "ghost",
  icone,
}: {
  acao: (prev: { erro?: string; ok?: string }, fd: FormData) => Promise<{ erro?: string; ok?: string }>
  campo: string
  valor: string
  rotulo: string
  confirmacao?: string
  variante?: "ghost" | "default" | "outline"
  icone: React.ReactNode
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  // role="status": o leitor de tela anuncia que deu certo sem interromper.
  if (estado.ok)
    return (
      <span role="status" className="text-success-fg text-xs">
        {estado.ok}
      </span>
    )
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirmacao) confirmarEnvio(e, confirmacao)
      }}
    >
      <input type="hidden" name={campo} value={valor} />
      {/* Tamanho padrão (32 px, 44 px no toque pela extensão do Button):
          confirmar e cancelar reserva são as ações que mais pesam aqui (A119). */}
      <Button
        type="submit"
        variant={variante}
        disabled={pendente}
        aria-describedby={estado.erro ? `${campo}-${valor}-erro` : undefined}
        className={variante === "ghost" ? "text-destructive hover:text-destructive" : undefined}
      >
        {pendente ? <Loader2 className="animate-spin" /> : icone}
        {rotulo}
      </Button>
      {/* O erro numa linha própria, embaixo do botão, e anunciado (A139):
          antes ficava espremido à esquerda dele, mudo para o leitor de tela. */}
      {estado.erro && (
        <p id={`${campo}-${valor}-erro`} role="alert" className="text-destructive max-w-64 text-xs">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

export function CancelarMeuCupomBotao({ id }: { id: string }) {
  return (
    <BotaoAcao
      acao={cancelarMeuCupom}
      campo="id"
      valor={id}
      rotulo="Cancelar"
      confirmacao="Cancelar este cupom?"
      icone={<X />}
    />
  )
}

export function CancelarReservaBotao({ id }: { id: string }) {
  return (
    <BotaoAcao
      acao={cancelarReservaPortal}
      campo="id"
      valor={id}
      rotulo="Cancelar reserva"
      confirmacao="Cancelar esta reserva? A vaga vai para a lista de espera."
      icone={<X />}
    />
  )
}

export function CancelarEsperaBotao({
  id,
  rotulo = "Sair da lista",
  confirmacao = "Sair da lista de espera?",
}: {
  id: string
  rotulo?: string
  confirmacao?: string
}) {
  return (
    <BotaoAcao
      acao={cancelarEsperaPortal}
      campo="id"
      valor={id}
      rotulo={rotulo}
      confirmacao={confirmacao}
      icone={<X />}
    />
  )
}

/** Confirma a vaga da lista de espera; deu certo, abre a página da reserva (QR). */
export function ConfirmarOfertaBotao({ token }: { token: string }) {
  return (
    <BotaoAcao
      acao={confirmarOfertaPortal}
      campo="token"
      valor={token}
      rotulo="Confirmar reserva"
      variante="default"
      icone={<Check />}
    />
  )
}
