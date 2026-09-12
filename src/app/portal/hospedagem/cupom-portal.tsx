"use client"

import { useActionState, useState } from "react"
import { BedDouble, Check, ListPlus, Loader2, Ticket, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  cancelarEsperaPortal,
  cancelarMeuCupom,
  cancelarReservaPortal,
  confirmarOfertaPortal,
  entrarNaEsperaPortal,
  solicitarCupom,
  type EstadoPedidoHospedagem,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type HotelDoPortal = {
  id: string
  nome: string | null
  /** Demanda garantida: o pedido já é a reserva. */
  garantida: boolean
  maxNoites: number
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

export function SolicitarCupomForm({
  hoteis,
  hoje,
}: {
  hoteis: HotelDoPortal[]
  hoje: string
}) {
  const [estado, formAction, pendente] = useActionState<EstadoPedidoHospedagem, FormData>(
    solicitarCupom,
    {}
  )
  const [hotelId, setHotelId] = useState("")
  const [checkIn, setCheckIn] = useState("")
  const hotel = hoteis.find((h) => h.id === hotelId)
  const garantida = hotel?.garantida === true
  const minCheckOut = somarDias(checkIn || hoje, 1)
  const maxCheckOut = hotel && checkIn ? somarDias(checkIn, hotel.maxNoites) : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitar hospedagem</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {estado.erro && (
            <div className="sm:col-span-2">
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            </div>
          )}
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="hotel_id">Hotel *</Label>
            <select
              id="hotel_id"
              name="hotel_id"
              required
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              className={SELECT}
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
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="check_in">{garantida ? "Check-in *" : "Check-in previsto *"}</Label>
            <Input
              id="check_in"
              name="check_in"
              type="date"
              min={hoje}
              required
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
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
                <Checkbox name="aceita_quarto_coletivo" />
                Aceito ficar em quarto coletivo (compartilhado com pessoas do mesmo
                sexo)
              </label>
            )}
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-2">
            {garantida
              ? `Neste hotel o pedido já é a reserva: o quarto é definido na hora e o hotel é obrigado a hospedar você. Estadia de até ${hotel?.maxNoites} noite(s). Se não puder ir, cancele dentro do prazo — reserva sem comparecimento pode gerar punição.`
              : "A retirada do cupom não garante a reserva nem o serviço — a reserva é confirmada pelo hotel. Mesmo aceitando quarto coletivo, a sua tarifa será a referente à quantidade de pessoas no quarto, conforme a reserva."}
          </p>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pendente}>
              {pendente ? (
                <Loader2 className="animate-spin" />
              ) : garantida ? (
                <BedDouble />
              ) : (
                <Ticket />
              )}
              {garantida ? "Reservar" : "Solicitar cupom"}
            </Button>
          </div>
        </form>

        {estado.espera && (
          <EntrarNaEsperaForm
            hotelId={estado.espera.hotelId}
            checkIn={estado.espera.checkIn}
            checkOut={estado.espera.checkOut}
          />
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
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
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
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        if (confirmacao && !confirm(confirmacao)) e.preventDefault()
      }}
    >
      <input type="hidden" name={campo} value={valor} />
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant={variante}
        size="sm"
        disabled={pendente}
        className={variante === "ghost" ? "text-destructive hover:text-destructive h-7 px-2" : "h-7 px-2"}
      >
        {pendente ? <Loader2 className="animate-spin" /> : icone}
        {rotulo}
      </Button>
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

export function CancelarEsperaBotao({ id }: { id: string }) {
  return (
    <BotaoAcao
      acao={cancelarEsperaPortal}
      campo="id"
      valor={id}
      rotulo="Sair da lista"
      confirmacao="Sair da lista de espera?"
      icone={<X />}
    />
  )
}

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
