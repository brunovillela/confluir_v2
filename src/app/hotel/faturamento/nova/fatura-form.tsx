"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { criarFaturaHotel } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ServicoFaturavel = {
  id: string
  codigo: string | null
  checkin_date: string | null
  checkout_date: string | null
  comparecidos: number
  custo_entidade: number | null
  temRelatorio: boolean
}

export type ContaOpcao = {
  id: string
  tipo: "pix" | "deposito"
  rotulo: string
}

const FORMAS = ["Pix", "Pix (QR Code)", "Depósito bancário (TED)", "Boleto"] as const
type Forma = (typeof FORMAS)[number]

function dataBr(v: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "")
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"
}

function moeda(v: number | null) {
  return v === null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function FaturaForm({
  servicos,
  contas,
  vencimentoMinimo,
}: {
  servicos: ServicoFaturavel[]
  contas: ContaOpcao[]
  vencimentoMinimo: string
}) {
  const [estado, formAction, pendente] = useActionState(criarFaturaHotel, {})
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [forma, setForma] = useState<Forma>("Pix")

  const total = servicos
    .filter((s) => marcados.has(s.id))
    .reduce((acc, s) => acc + (s.custo_entidade ?? 0), 0)

  const contasDaForma = contas.filter((c) =>
    forma === "Pix" ? c.tipo === "pix" : c.tipo === "deposito"
  )

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
          <CardTitle className="text-base">Serviços a faturar</CardTitle>
          <CardDescription>
            Só entram serviços com hóspede vinculado por cupom e comparecimento
            registrado, ainda sem fatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {servicos.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nenhum serviço faturável no momento — registre o comparecimento
              dos hóspedes nas reservas para liberar o faturamento.
            </p>
          )}
          {servicos.map((s) => (
            <label
              key={s.id}
              className="hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <Checkbox
                name="servicos"
                value={s.id}
                checked={marcados.has(s.id)}
                onCheckedChange={(v) => alternar(s.id, v === true)}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
                {s.codigo ?? "(sem código)"}
              </span>
              <span className="text-muted-foreground text-xs">
                {dataBr(s.checkin_date)} → {dataBr(s.checkout_date)} ·{" "}
                {s.comparecidos} hóspede{s.comparecidos === 1 ? "" : "s"}
                {!s.temRelatorio && " · sem relatório"}
              </span>
              <span className="font-medium tabular-nums">
                {moeda(s.custo_entidade)}
              </span>
            </label>
          ))}
          {marcados.size > 0 && (
            <p className="mt-2 border-t pt-3 text-sm font-medium">
              {marcados.size} serviço{marcados.size === 1 ? "" : "s"} — total do
              subsídio: {moeda(total)}{" "}
              <span className="text-muted-foreground font-normal">
                (impostos inclusos)
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">DANFE e vencimento</CardTitle>
          <CardDescription>
            A DANFE deve ser emitida no valor total do subsídio — o valor
            faturado já contém todos os impostos da operação, conforme o acordo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="danfe">DANFE (PDF) *</Label>
            <Input id="danfe" name="danfe" type="file" accept="application/pdf" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vencimento">Vencimento * (carência mínima de 4 dias)</Label>
            <Input
              id="vencimento"
              name="vencimento"
              type="date"
              min={vencimentoMinimo}
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forma de recebimento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-4">
            {FORMAS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="forma"
                  value={f}
                  checked={forma === f}
                  onChange={() => setForma(f)}
                  className="accent-primary"
                />
                {f}
              </label>
            ))}
          </div>

          {forma === "Boleto" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="boleto">Boleto (PDF) *</Label>
              <Input
                id="boleto"
                name="boleto"
                type="file"
                accept="application/pdf"
                required
                className="max-w-sm"
              />
              <p className="text-muted-foreground text-xs">
                O boleto fica anexado à ordem de pagamento do sindicato.
              </p>
            </div>
          ) : forma === "Pix (QR Code)" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="pix_codigo">Código Pix (copia e cola) *</Label>
              <textarea
                id="pix_codigo"
                name="pix_codigo"
                rows={4}
                required
                placeholder="Cole aqui o código do QR Code para pagamento"
                className="border-input bg-background text-foreground rounded-md border px-3 py-2 font-mono text-xs shadow-xs outline-none"
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="conta_id">
                Conta de recebimento ({forma === "Pix" ? "Pix" : "depósito"}) *
              </Label>
              {contasDaForma.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhuma conta {forma === "Pix" ? "Pix" : "de depósito"} ativa —{" "}
                  <Link href="/hotel/contas" className="underline underline-offset-4">
                    cadastre em Dados bancários
                  </Link>
                  .
                </p>
              ) : (
                <select id="conta_id" name="conta_id" required defaultValue="" className={SELECT}>
                  <option value="" disabled>
                    Escolha a conta
                  </option>
                  {contasDaForma.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/hotel/faturamento">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente || marcados.size === 0}>
          {pendente && <Loader2 className="animate-spin" />}
          Emitir fatura e gerar ordem
        </Button>
      </div>
    </form>
  )
}
