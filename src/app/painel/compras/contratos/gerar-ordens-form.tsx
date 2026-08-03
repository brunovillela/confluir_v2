"use client"

import { useActionState, useState } from "react"
import { Loader2, Receipt } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EstadoForm } from "@/lib/contas"
import {
  PERIODICIDADES,
  parcelasSugeridas,
  type Periodicidade,
} from "@/lib/contratos-constantes"

import { gerarOrdensContratoAction } from "./actions"

type AcaoForm = (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Valor NUMERIC → texto pt-BR editável (sem símbolo). */
function valorParaTexto(valor: number | null): string {
  if (valor == null) return ""
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function GerarOrdensForm({
  contratoId,
  valorPadrao,
  vigenciaInicio,
  vigenciaTermino,
  hoje,
  temFornecedor,
  acao = gerarOrdensContratoAction,
  beneficiarioRotulo = "fornecedor",
}: {
  contratoId: string
  valorPadrao: number | null
  vigenciaInicio: string | null
  vigenciaTermino: string | null
  hoje: string
  temFornecedor: boolean
  /** Ação do submit — Contratos por padrão; Ajudas passa a sua. */
  acao?: AcaoForm
  /** "fornecedor" (contrato) ou "entidade apoiada" (ajuda). */
  beneficiarioRotulo?: string
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal")
  const primeiro = (vigenciaInicio ?? hoje).slice(0, 10)
  const [quantidade, setQuantidade] = useState(
    String(parcelasSugeridas(primeiro, vigenciaTermino, "mensal"))
  )

  function trocarPeriodicidade(p: Periodicidade) {
    setPeriodicidade(p)
    setQuantidade(String(parcelasSugeridas(primeiro, vigenciaTermino, p)))
  }

  if (!temFornecedor) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Defina o {beneficiarioRotulo} para gerar ordens de pagamento — ele é o
          favorecido das ordens.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="contrato_id" value={contratoId} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="periodicidade">Periodicidade</Label>
          <select
            id="periodicidade"
            name="periodicidade"
            className={SELECT}
            value={periodicidade}
            onChange={(e) =>
              trocarPeriodicidade(e.target.value as Periodicidade)
            }
          >
            {PERIODICIDADES.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="valor_parcela">Valor por parcela</Label>
          <Input
            id="valor_parcela"
            name="valor_parcela"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={valorParaTexto(valorPadrao)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="primeiro_vencimento">Primeiro vencimento</Label>
          <input
            id="primeiro_vencimento"
            name="primeiro_vencimento"
            type="date"
            className={DATA}
            defaultValue={primeiro}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="quantidade">Parcelas</Label>
          <Input
            id="quantidade"
            name="quantidade"
            type="number"
            min={1}
            max={120}
            value={periodicidade === "unica" ? "1" : quantidade}
            disabled={periodicidade === "unica"}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="forma_pagamento">Forma de pagamento (opcional)</Label>
        <Input
          id="forma_pagamento"
          name="forma_pagamento"
          placeholder="Ex.: Boleto, PIX, Transferência"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        As ordens nascem <strong>Em autorização</strong>, com o fornecedor do
        contrato como favorecido. Vencimentos que já têm ordem deste contrato
        são pulados — dá para rodar de novo sem duplicar.
      </p>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar ordens
        </Button>
      </div>
    </form>
  )
}
