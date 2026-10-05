"use client"

import { useActionState, useState } from "react"
import { Ban, Check, Loader2, QrCode, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import type { ConfigCobranca } from "@/lib/db/cobrancas"

import { baixarCobrancaAction, cancelarCobrancaAction, gerarCobrancasAction, salvarConfigCobrancaAction } from "./actions"

function Recado({ estado }: { estado: EstadoForm }) {
  if (estado.erro && !estado.campo)
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  if (estado.ok)
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  return null
}

export function ConfigCobrancaForm({ config }: { config: ConfigCobranca }) {
  const [estado, action, salvando] = useActionState(salvarConfigCobrancaAction, {})
  return (
    <form action={action} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="valor_mensal">Valor mensal padrão (R$)</Label>
          <Input id="valor_mensal" name="valor_mensal" defaultValue={config.valorMensal === null ? "" : config.valorMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} placeholder="45,00" inputMode="decimal" />
          <p className="text-muted-foreground text-xs">Quem tem valor próprio na ficha (contribuição) usa o dela.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dia_vencimento">Dia do vencimento</Label>
          <Input id="dia_vencimento" name="dia_vencimento" type="number" min={1} max={28} defaultValue={config.diaVencimento} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="gerar_automatico" defaultChecked={config.gerarAutomatico} className="size-4" />
          Gerar no dia 1 de cada mês
        </label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mensagem">Mensagem ao filiado (opcional)</Label>
        <Textarea id="mensagem" name="mensagem" rows={2} defaultValue={config.mensagem ?? ""} placeholder="Aparece junto do QR no portal. Ex.: dúvidas pelo WhatsApp da secretaria." />
      </div>
      <Recado estado={estado} />
      <div>
        <Button type="submit" disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function GerarCobrancasForm({ competencia }: { competencia: string }) {
  const [estado, action, gerando] = useActionState(gerarCobrancasAction, {})
  return (
    <form action={action} className="grid gap-3" onSubmit={(e) => confirmarEnvio(e, "Gerar as cobranças Pix desta competência para todos os filiados ativos que pagam por Pix e avisá-los?")}>
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="competencia">Competência</Label>
          <Input id="competencia" name="competencia" type="month" defaultValue={competencia} className="w-44" />
        </div>
        <Button type="submit" disabled={gerando}>
          {gerando ? <Loader2 className="animate-spin" /> : <QrCode />}
          Gerar cobranças
        </Button>
      </div>
      <Recado estado={estado} />
    </form>
  )
}

export function BaixaCobrancaBotoes({ cobrancaId, valor, hoje }: { cobrancaId: string; valor: number; hoje: string }) {
  const [eBaixa, aBaixa, pBaixa] = useActionState(baixarCobrancaAction, {})
  const [eCanc, aCanc, pCanc] = useActionState(cancelarCobrancaAction, {})
  const [aberto, setAberto] = useState(false)
  if (eBaixa.ok || eCanc.ok) return <span className="text-success-fg text-xs">{eBaixa.ok ?? eCanc.ok}</span>
  return (
    <div className="flex flex-wrap items-center gap-2">
      {aberto ? (
        <form action={aBaixa} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="cobranca_id" value={cobrancaId} />
          <Input name="valor_pago" defaultValue={valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} className="h-8 w-24 text-xs" inputMode="decimal" aria-label="Valor recebido" />
          <Input name="data_pagamento" type="date" defaultValue={hoje} className="h-8 w-36 text-xs" aria-label="Data" />
          <Button type="submit" size="sm" disabled={pBaixa}>
            {pBaixa ? <Loader2 className="animate-spin" /> : <Check />}
            Confirmar
          </Button>
          {eBaixa.erro && <span className="text-destructive text-xs">{eBaixa.erro}</span>}
        </form>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)}>
          <Check />
          Dar baixa
        </Button>
      )}
      <form action={aCanc} onSubmit={(e) => confirmarEnvio(e, "Cancelar esta cobrança? O filiado não a verá mais no portal.")}>
        <input type="hidden" name="cobranca_id" value={cobrancaId} />
        <Button type="submit" size="sm" variant="ghost" disabled={pCanc}>
          {pCanc ? <Loader2 className="animate-spin" /> : <Ban />}
          Cancelar
        </Button>
        {eCanc.erro && <span className="text-destructive text-xs">{eCanc.erro}</span>}
      </form>
    </div>
  )
}
