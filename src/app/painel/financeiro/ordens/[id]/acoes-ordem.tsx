"use client"

import { useActionState, useState } from "react"
import { Ban, Loader2, PencilLine, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FORMAS_PAGAMENTO_COMPRAS } from "@/lib/compras-constantes"

import { cancelarOrdemAction, corrigirOrdemAction, reenviarOrdemAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

type Painel = "cancelar" | "corrigir" | "reenviar" | null

type Conta = { id: string; rotulo: string; pix: boolean; ted: boolean; favorito: boolean }

/** "pix" / "ted" pela forma (mesma leitura de ordens-destino); o resto não pede conta. */
function destinoDaFormaCliente(forma: string): "pix" | "ted" | null {
  const f = forma.trim().toLowerCase()
  if (!f || f.includes("qr")) return null
  if (f === "pix") return "pix"
  if (/ted|doc|dep[oó]sito|transfer/.test(f)) return "ted"
  return null
}

/**
 * Ações do Financeiro sobre uma ordem ainda não paga: corrigir (com motivo —
 * valor acima do aprovado devolve para autorização; o centro de custo é pela
 * reclassificação, no cartão "Centro de custo"), cancelar (com motivo) e reenviar
 * para autorização uma ordem devolvida. Tudo entra na trilha da ordem.
 */
export function AcoesOrdem({
  ordemId,
  situacao,
  podeCorrigir,
  podeCancelar,
  podeReenviar,
  atual,
  contas = [],
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
    formaPagamento: string
    dadosBancariosId: string
  }
  /** Contas/chaves do favorecido (para Pix/TED). */
  contas?: Conta[]
}) {
  const [aberto, setAberto] = useState<Painel>(null)
  const [forma, setForma] = useState(atual.formaPagamento)
  const destino = destinoDaFormaCliente(forma)
  const servem = destino ? contas.filter((c) => (destino === "pix" ? c.pix : c.ted)) : []
  // A conta atual, se serve; senão a favorita que serve; senão a primeira.
  const contaInicial =
    servem.find((c) => c.id === atual.dadosBancariosId)?.id ?? servem.find((c) => c.favorito)?.id ?? servem[0]?.id ?? ""
  const [estCancelar, acaoCancelar, pendCancelar] = useActionState(cancelarOrdemAction, {})
  const envio1 = useEnvioFormulario(acaoCancelar, estCancelar)
  const [estCorrigir, acaoCorrigir, pendCorrigir] = useActionState(corrigirOrdemAction, {})
  const envio2 = useEnvioFormulario(acaoCorrigir, estCorrigir)
  const [estReenviar, acaoReenviar, pendReenviar] = useActionState(reenviarOrdemAction, {})
  const envio3 = useEnvioFormulario(acaoReenviar, estReenviar)

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
        <form action={acaoReenviar} {...envio3} className="grid gap-3 rounded-md border p-3">
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
        <form action={acaoCorrigir} {...envio2} className="grid gap-3 rounded-md border p-3">
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
          <div className="grid gap-3 sm:grid-cols-3">
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
              <select
                id="corr_forma"
                name="forma_pagamento"
                value={forma}
                onChange={(e) => setForma(e.target.value)}
                className={SELECT}
              >
                <option value="" disabled>Escolha…</option>
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
          </div>
          {destino && (
            <div className="grid gap-1.5">
              <Label htmlFor="corr_conta">{destino === "pix" ? "Chave Pix do favorecido" : "Conta do favorecido"}</Label>
              {servem.length > 0 ? (
                <select
                  key={`${destino}-${contaInicial}`}
                  id="corr_conta"
                  name="dados_bancarios_id"
                  defaultValue={contaInicial}
                  className={SELECT}
                >
                  {servem.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-warning-fg text-xs">
                  O favorecido não tem {destino === "pix" ? "chave Pix" : "conta bancária"} cadastrada. Cadastre na ficha dele
                  ou escolha outra forma.
                </p>
              )}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="corr_motivo">Motivo da correção *</Label>
            <textarea id="corr_motivo" name="motivo" rows={2} required className={TEXTAREA} />
          </div>
          <p className="text-muted-foreground text-xs">
            {situacao === "A pagar" || situacao === "Processando"
              ? "Valor menor ou igual ao aprovado mantém a autorização; valor maior devolve a ordem para autorização."
              : "A correção fica registrada no histórico da ordem, com o antes e o depois."}
          </p>
          <Button type="submit" size="sm" disabled={pendCorrigir} className="justify-self-start">
            {pendCorrigir ? <Loader2 className="animate-spin" /> : <PencilLine />}
            Salvar correção
          </Button>
        </form>
      )}

      {aberto === "cancelar" && (
        <form action={acaoCancelar} {...envio1} className="border-destructive/40 grid gap-3 rounded-md border p-3">
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
            A ordem sai da fila de pagamento (o Financeiro pode desfazer o
            cancelamento depois). Se foi uma compra em dinheiro, o débito do
            caixa é cancelado junto.
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
