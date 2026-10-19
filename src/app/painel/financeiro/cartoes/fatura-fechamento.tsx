"use client"

import { useActionState, useState } from "react"
import { Loader2, Lock } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampoArquivo } from "@/components/ui/campo-arquivo"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ACEITA_NOTA, prepararArquivo } from "@/lib/arquivo-envio"
import { formatarMoeda } from "@/lib/formato"
import { parseValorBR } from "@/lib/valores"

import { fecharFaturaAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

/**
 * Fechamento da fatura: valor, vencimento, arquivo e forma. A diferença para a
 * soma das compras aparece ao vivo e pede o centro de custo dela.
 */
export function FaturaFechamento({
  faturaId,
  soma,
  compras,
  pendentes,
  centros,
}: {
  faturaId: string
  soma: number
  compras: number
  /** Compras ainda não autorizadas (a ordem da fatura vai para a alçada). */
  pendentes: number
  centros: { id: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(fecharFaturaAction, {})
  const [valorTexto, setValorTexto] = useState("")
  const [forma, setForma] = useState("Boleto")
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const valor = parseValorBR(valorTexto)
  const dif = valor === null ? null : Math.round((valor - soma) * 100) / 100
  const temDif = dif !== null && Math.abs(dif) >= 0.01
  const vaiParaAlcada = pendentes > 0 || temDif || compras === 0

  return (
    <form
      action={acao}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Fechar a fatura e gerar a ordem de pagamento?",
          descricao: `A ordem sai com ${valor === null ? "o valor informado" : formatarMoeda(valor)}, rateada pelos centros de custo das compras${
            temDif ? ` e a diferença de ${formatarMoeda(dif!)} no centro escolhido` : ""
          }. ${
            vaiParaAlcada
              ? "Ela vai para a autorização por alçada."
              : "As compras já foram autorizadas uma a uma e o valor bate: a ordem já sai \"A pagar\"."
          } As próximas compras no cartão entram na fatura seguinte.`,
          confirmar: "Fechar a fatura",
        })
      }
      className="grid gap-4"
    >
      <input type="hidden" name="fatura_id" value={faturaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fat_valor">Valor da fatura *</Label>
          <Input
            id="fat_valor"
            name="valor"
            inputMode="decimal"
            required
            placeholder={formatarMoeda(soma).replace("R$", "").trim()}
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
          />
          <p className={temDif ? "text-warning-fg text-xs" : "text-muted-foreground text-xs"}>
            Compras: {formatarMoeda(soma)}
            {dif !== null && (temDif ? ` · diferença ${formatarMoeda(dif)}` : " · bate com as compras")}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fat_venc">Vencimento *</Label>
          <Input id="fat_venc" name="vencimento" type="date" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fat_forma">Forma de pagamento *</Label>
          <select id="fat_forma" name="forma_pagamento" value={forma} onChange={(e) => setForma(e.target.value)} className={SELECT}>
            <option value="Boleto">Boleto (a própria fatura)</option>
            <option value="Pix (QR Code)">Pix (QR Code)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fat_arquivo">Fatura (PDF ou foto) *</Label>
        <CampoArquivo
          id="fat_arquivo"
          name="arquivo"
          required
          accept={ACEITA_NOTA}
          onChange={async (e) => {
            const { erro } = await prepararArquivo(e.currentTarget)
            setErroArquivo(erro ?? null)
          }}
        />
        {erroArquivo && <p className="text-destructive text-xs">{erroArquivo}</p>}
      </div>

      {forma === "Boleto" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="fat_linha">Linha digitável (opcional)</Label>
          <Input id="fat_linha" name="linha_digitavel" inputMode="numeric" placeholder="Para pagar por remessa bancária" />
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="fat_pix">Código Pix copia e cola *</Label>
          <textarea id="fat_pix" name="pix_codigo" rows={2} required className={TEXTAREA} />
        </div>
      )}

      {temDif && (
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="fat_centro">Centro de custo da diferença *</Label>
            <select id="fat_centro" name="centro_diferenca_id" required defaultValue="" className={SELECT}>
              <option value="" disabled>
                Escolha o centro
              </option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {dif! > 0 ? "Juros, IOF, anuidade, tarifas…" : "Estornos ou créditos na fatura."} Vira uma linha própria no rateio.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fat_obs">O que explica a diferença</Label>
            <textarea id="fat_obs" name="observacao" rows={2} className={TEXTAREA} />
          </div>
        </div>
      )}

      {pendentes > 0 && (
        <p className="text-muted-foreground text-xs">
          {pendentes} compra(s) desta fatura ainda não foram autorizadas — entram no rateio (o cartão já foi cobrado) e
          a ordem da fatura passa pela alçada.
        </p>
      )}

      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Lock />}
        Fechar a fatura e gerar a ordem
      </Button>
    </form>
  )
}
