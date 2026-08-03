"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { criarServico } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type HotelOpcao = { id: string; nome: string | null }

export type CupomOpcao = {
  id: string
  hotel_id: string | null
  filiadoNome: string | null
  check_in: string | null
  sexo: string | null
  aceita_quarto_coletivo: boolean | null
}

export type TarifaOpcao = {
  hotel_id: string | null
  pessoas_por_quarto: number | null
  custo_por_filiado: number | null
  custo_entidade: number | null
}

function dataBr(v: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "")
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"
}

function moeda(v: number | null) {
  return v === null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Nova reserva: hotel, período e os cupons aguardando que entram como
 * hóspedes. Quarto coletivo exige hóspedes do mesmo sexo que aceitaram
 * quarto coletivo no cupom; o preço registrado é a tarifa acordada para a
 * quantidade efetiva de pessoas no quarto (validação final no servidor).
 */
export function ServicoForm({
  hoteis,
  cuponsAguardando,
  tarifas,
  hotelFixo,
  action = criarServico,
}: {
  hoteis: HotelOpcao[]
  cuponsAguardando: CupomOpcao[]
  tarifas: TarifaOpcao[]
  /** Interface do hotel: hotel já definido pela sessão, sem select. */
  hotelFixo?: string
  action?: typeof criarServico
}) {
  const [estado, formAction, pendente] = useActionState(action, {})
  const [hotelId, setHotelId] = useState(hotelFixo ?? "")
  const [coletivo, setColetivo] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  const cuponsDoHotel = cuponsAguardando.filter((c) => c.hotel_id === hotelId)
  const tarifasDoHotel = tarifas
    .filter((t) => t.hotel_id === hotelId)
    .sort((a, b) => (a.pessoas_por_quarto ?? 0) - (b.pessoas_por_quarto ?? 0))

  // Cupom bloqueado pelo modo coletivo sai da seleção efetiva (e do envio).
  const selecionados = cuponsDoHotel.filter(
    (c) => marcados.has(c.id) && !(coletivo && c.aceita_quarto_coletivo !== true)
  )
  const tarifaPrevista =
    selecionados.length > 0
      ? (tarifasDoHotel.find((t) => t.pessoas_por_quarto === selecionados.length) ??
        null)
      : null

  function alternar(id: string, marcado: boolean) {
    setMarcados((atual) => {
      const proximo = new Set(atual)
      if (marcado) proximo.add(id)
      else proximo.delete(id)
      return proximo
    })
  }

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da reserva</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {hotelFixo ? (
            <input type="hidden" name="hotel_id" value={hotelFixo} />
          ) : (
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="hotel_id">Hotel *</Label>
              <select
                id="hotel_id"
                name="hotel_id"
                required
                className={SELECT}
                value={hotelId}
                onChange={(e) => {
                  setHotelId(e.target.value)
                  setMarcados(new Set())
                }}
              >
                <option value="" disabled>
                  Selecione o hotel
                </option>
                {hoteis.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nome ?? "(sem nome)"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="checkin_date">Check-in *</Label>
            <Input id="checkin_date" name="checkin_date" type="date" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="checkout_date">Check-out *</Label>
            <Input id="checkout_date" name="checkout_date" type="date" required />
          </div>
          <div className="grid content-end pb-1 sm:col-span-2">
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                name="coletivo"
                checked={coletivo}
                onCheckedChange={(v) => setColetivo(v === true)}
              />
              Quarto coletivo — só hóspedes do mesmo sexo que aceitaram quarto
              coletivo no cupom
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hóspedes (cupons da reserva)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {!hotelId && (
            <p className="text-muted-foreground text-sm">
              Selecione o hotel para listar os cupons aguardando reserva.
            </p>
          )}
          {hotelId && cuponsDoHotel.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nenhum cupom aguardando reserva neste hotel — o cupom é emitido
              antes, pelo sindicato.
            </p>
          )}
          {cuponsDoHotel.map((c) => {
            const bloqueado = coletivo && c.aceita_quarto_coletivo !== true
            return (
              <label
                key={c.id}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                  bloqueado
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-muted/40 cursor-pointer"
                }`}
              >
                <Checkbox
                  name="cupons"
                  value={c.id}
                  disabled={bloqueado}
                  checked={!bloqueado && marcados.has(c.id)}
                  onCheckedChange={(v) => alternar(c.id, v === true)}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.filiadoNome ?? "(sem nome)"}
                </span>
                <span className="text-muted-foreground text-xs">
                  check-in {dataBr(c.check_in)}
                  {c.sexo && <> · {c.sexo}</>}
                  {c.aceita_quarto_coletivo === true
                    ? " · aceita coletivo"
                    : " · não aceita coletivo"}
                </span>
              </label>
            )
          })}

          {hotelId && (
            <div className="text-muted-foreground mt-2 border-t pt-3 text-xs">
              {tarifasDoHotel.length === 0 ? (
                <p>Este hotel não tem tarifas acordadas cadastradas.</p>
              ) : (
                <p>
                  Tarifas acordadas:{" "}
                  {tarifasDoHotel
                    .map(
                      (t) =>
                        `${t.pessoas_por_quarto} pessoa${(t.pessoas_por_quarto ?? 0) === 1 ? "" : "s"} = ${moeda(t.custo_por_filiado)}/hóspede + ${moeda(t.custo_entidade)} entidade`
                    )
                    .join(" · ")}
                </p>
              )}
              {selecionados.length > 0 && (
                <p className="text-foreground mt-1 font-medium">
                  {selecionados.length} hóspede{selecionados.length === 1 ? "" : "s"}{" "}
                  selecionado{selecionados.length === 1 ? "" : "s"} —{" "}
                  {tarifaPrevista
                    ? `tarifa aplicada: ${moeda(tarifaPrevista.custo_por_filiado)} por hóspede + ${moeda(tarifaPrevista.custo_entidade)} da entidade`
                    : "sem tarifa acordada para essa quantidade de pessoas"}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={hotelFixo ? "/hotel/inicio" : "/painel/hospedagem/servicos"}>
            Cancelar
          </Link>
        </Button>
        <Button
          type="submit"
          disabled={pendente || (selecionados.length > 0 && !tarifaPrevista)}
        >
          {pendente && <Loader2 className="animate-spin" />}
          Efetivar reserva
        </Button>
      </div>
    </form>
  )
}
