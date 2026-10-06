"use client"

import { useActionState, useState } from "react"
import { Ban, Loader2, PencilLine, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FORMAS_PAGAMENTO_COMPRAS } from "@/lib/compras-constantes"

import { cancelarOrdemAction, corrigirOrdemAction, reenviarOrdemAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

type Painel = "cancelar" | "corrigir" | "reenviar" | null

/**
 * Ações do Financeiro sobre uma ordem ainda não paga: corrigir (com motivo —
 * mudar o valor devolve para autorização), cancelar (com motivo) e reenviar
 * para autorização uma ordem devolvida. Tudo entra na trilha da ordem.
 */
export function AcoesOrdem({
  ordemId,
  situacao,
  podeCorrigir,
  podeCancelar,
  podeReenviar,
  atual,
  centros,
}: {
  ordemId: string
  situacao: string
  podeCorrigir: boolean
  podeCancelar: boolean
  podeReenviar: boolean
  atual: {
    descricao: string
    valor: string
    vencimento: string
    centroCustoDespesaId: string
    formaPagamento: string
  }
  centros: { id: string; rotulo: string }[]
}) {
  const [aberto, setAberto] = useState<Painel>(null)
  const [estCancelar, acaoCancelar, pendCancelar] = useActionState(cancelarOrdemAction, {})
  const [estCorrigir, acaoCorrigir, pendCorrigir] = useActionState(corrigirOrdemAction, {})
  const [estReenviar, acaoReenviar, pendReenviar] = useActionState(reenviarOrdemAction, {})

  if (!podeCorrigir && !podeCancelar && !podeReenviar) return null
  const formas = FORMAS_PAGAMENTO_COMPRAS as readonly string[]

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {podeReenviar && (
          <Button variant="outline" size="sm" onClick={() => setAberto(aberto === "reenviar" ? null : "reenviar")}>
            <Send />
            Reenviar para autorização
          </Button>
        )}
        {podeCorrigir && (
          <Button variant="outline" size="sm" onClick={() => setAberto(aberto === "corrigir" ? null : "corrigir")}>
            <PencilLine />
            Corrigir ordem
          </Button>
        )}
        {podeCancelar && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setAberto(aberto === "cancelar" ? null : "cancelar")}
          >
            <Ban />
            Cancelar ordem
          </Button>
        )}
      </div>

      {aberto === "reenviar" && (
        <form action={acaoReenviar} className="grid gap-3 rounded-md border p-3">
          <input type="hidden" name="id" value={ordemId} />
          {estReenviar.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estReenviar.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="reenviar_obs">O que foi complementado ou corrigido? *</Label>
            <textarea id="reenviar_obs" name="observacao" rows={2} required className={TEXTAREA} />
          </div>
          <Button type="submit" size="sm" disabled={pendReenviar} className="justify-self-start">
            {pendReenviar ? <Loader2 className="animate-spin" /> : <Send />}
            Reenviar
          </Button>
        </form>
      )}

      {aberto === "corrigir" && (
        <form action={acaoCorrigir} className="grid gap-3 rounded-md border p-3">
          <input type="hidden" name="id" value={ordemId} />
          {estCorrigir.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estCorrigir.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="corr_descricao">Descrição</Label>
            <Input id="corr_descricao" name="descricao" defaultValue={atual.descricao} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label htmlFor="corr_valor">Valor da cobrança</Label>
              <Input id="corr_valor" name="valor" inputMode="decimal" defaultValue={atual.valor} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="corr_venc">Vencimento</Label>
              <Input id="corr_venc" name="vencimento" type="date" defaultValue={atual.vencimento} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="corr_forma">Forma de pagamento</Label>
              <select id="corr_forma" name="forma_pagamento" defaultValue={atual.formaPagamento} className={SELECT}>
                <option value="">Não informada</option>
                {!formas.includes(atual.formaPagamento) && atual.formaPagamento && (
                  <option value={atual.formaPagamento}>{atual.formaPagamento}</option>
                )}
                {formas.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="corr_centro">Centro de custo da despesa</Label>
              <select id="corr_centro" name="centro_custo_despesa_id" defaultValue={atual.centroCustoDespesaId} className={SELECT}>
                <option value="">Não informado</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="corr_motivo">Motivo da correção *</Label>
            <textarea id="corr_motivo" name="motivo" rows={2} required className={TEXTAREA} />
          </div>
          <p className="text-muted-foreground text-xs">
            {situacao === "A pagar" || situacao === "Processando"
              ? "Mudar o valor de uma ordem já autorizada a devolve para autorização."
              : "A correção fica registrada no histórico da ordem, com o antes e o depois."}
          </p>
          <Button type="submit" size="sm" disabled={pendCorrigir} className="justify-self-start">
            {pendCorrigir ? <Loader2 className="animate-spin" /> : <PencilLine />}
            Salvar correção
          </Button>
        </form>
      )}

      {aberto === "cancelar" && (
        <form action={acaoCancelar} className="border-destructive/40 grid gap-3 rounded-md border p-3">
          <input type="hidden" name="id" value={ordemId} />
          {estCancelar.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estCancelar.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="canc_motivo">Motivo do cancelamento *</Label>
            <textarea id="canc_motivo" name="motivo" rows={2} required className={TEXTAREA} />
          </div>
          <p className="text-muted-foreground text-xs">
            A ordem sai da fila de pagamento e não pode ser reaberta. Se foi uma
            compra em dinheiro, o débito do caixa é cancelado junto.
          </p>
          <Button type="submit" size="sm" variant="destructive" disabled={pendCancelar} className="justify-self-start">
            {pendCancelar ? <Loader2 className="animate-spin" /> : <Ban />}
            Confirmar cancelamento
          </Button>
        </form>
      )}
    </div>
  )
}
