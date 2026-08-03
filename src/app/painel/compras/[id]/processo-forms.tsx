"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  FORMAS_PAGAMENTO_COMPRAS,
  hojeLocalISO,
} from "@/lib/compras-constantes"

import {
  EmpresaCombobox as FornecedorCombobox,
  type EmpresaOpcao as FornecedorOpcao,
} from "@/components/empresa-combobox"
import {
  adicionarPropostaAction,
  cancelarProcessoAction,
  encerrarCotacaoAction,
  escolherPropostaAction,
  gerarOrdemAction,
  iniciarCotacaoAction,
  reabrirCotacaoAction,
  registrarCompraAction,
  registrarRecebimentoAction,
  removerPropostaAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

// Mesmo shape do EstadoForm do servidor (lib/contas é server-only).
type Estado = { erro?: string; ok?: string }
type AcaoServidor = (prev: Estado, formData: FormData) => Promise<Estado>

const ACOES: Record<string, AcaoServidor> = {
  cancelar: cancelarProcessoAction,
  iniciarCotacao: iniciarCotacaoAction,
  encerrarCotacao: encerrarCotacaoAction,
  reabrirCotacao: reabrirCotacaoAction,
  removerProposta: removerPropostaAction,
  escolherProposta: escolherPropostaAction,
}

/**
 * Botão que dispara uma ação simples do processo (sem campos além dos
 * hidden). `confirmacao` abre um confirm() nativo antes de enviar.
 */
export function BotaoAcaoProcesso({
  acao,
  campos,
  confirmacao,
  variant = "outline",
  size = "sm",
  children,
}: {
  acao: keyof typeof ACOES
  campos: Record<string, string>
  confirmacao?: string
  variant?: "default" | "outline" | "ghost" | "destructive"
  size?: "default" | "sm"
  children: React.ReactNode
}) {
  const [estado, formAction, pendente] = useActionState(ACOES[acao], {})
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (confirmacao && !confirm(confirmacao)) e.preventDefault()
      }}
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <Button type="submit" variant={variant} size={size} disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        {children}
      </Button>
      {estado.erro && (
        <span className="text-destructive max-w-64 text-right text-xs">
          {estado.erro}
        </span>
      )}
    </form>
  )
}

export function PropostaNovaForm({
  processoId,
  fornecedores,
}: {
  processoId: string
  fornecedores: FornecedorOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState(
    adicionarPropostaAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="processo_id" value={processoId} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Fornecedor consultado *</Label>
          <FornecedorCombobox empresas={fornecedores} name="fornecedor_id" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="proposta-valor">Valor proposto *</Label>
            <Input
              id="proposta-valor"
              name="valor"
              inputMode="decimal"
              required
              placeholder="0,00"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="proposta-previsao">Previsão de entrega</Label>
            <Input id="proposta-previsao" name="previsao_entrega" type="date" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="proposta-forma">Forma de pagamento</Label>
          <select
            id="proposta-forma"
            name="forma_pagamento"
            className={SELECT}
            defaultValue=""
          >
            <option value="">Não informada</option>
            {FORMAS_PAGAMENTO_COMPRAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="proposta-arquivo">Proposta (PDF, até 5 MB)</Label>
          <Input
            id="proposta-arquivo"
            name="arquivo"
            type="file"
            accept="application/pdf"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Registrar proposta
        </Button>
      </div>
    </form>
  )
}

export function RegistrarCompraForm({
  processoId,
  resumo,
}: {
  processoId: string
  resumo: string
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarCompraAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        if (!confirm(`Efetivar a compra? ${resumo}`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="processo_id" value={processoId} />
      <div className="grid gap-1.5">
        <Label htmlFor="compra-data">Data da compra *</Label>
        <Input
          id="compra-data"
          name="data_compra"
          type="date"
          required
          defaultValue={hojeLocalISO()}
        />
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Efetivar compra
      </Button>
      {estado.erro && (
        <span className="text-destructive w-full text-xs">{estado.erro}</span>
      )}
    </form>
  )
}

export function GerarOrdemForm({
  processoId,
  fornecimentoId,
}: {
  processoId: string
  fornecimentoId: string
}) {
  const [estado, formAction, pendente] = useActionState(gerarOrdemAction, {})
  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`vencimento-${fornecimentoId}`}>Vencimento</Label>
          <Input
            id={`vencimento-${fornecimentoId}`}
            name="vencimento"
            type="date"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`nota-${fornecimentoId}`}>
            Nota fiscal (PDF, opcional)
          </Label>
          <Input
            id={`nota-${fornecimentoId}`}
            name="nota_fiscal"
            type="file"
            accept="application/pdf"
          />
        </div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Gerar ordem de pagamento
        </Button>
      </div>
    </form>
  )
}

export function RecebimentoForm({
  processoId,
  fornecimentoId,
}: {
  /** Vazio quando o registro parte da área de recebimentos. */
  processoId: string
  fornecimentoId: string
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarRecebimentoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`receb-data-${fornecimentoId}`}>Recebido em *</Label>
          <Input
            id={`receb-data-${fornecimentoId}`}
            name="data"
            type="date"
            required
            defaultValue={hojeLocalISO()}
          />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Switch name="de_acordo" defaultChecked aria-label="Fornecimento adequado" />
          Fornecimento adequado à solicitação
        </label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`receb-obs-${fornecimentoId}`}>Observação</Label>
        <Input
          id={`receb-obs-${fornecimentoId}`}
          name="observacao"
          placeholder="Ex.: embalagem avariada, volume conferido…"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Registrar recebimento
        </Button>
      </div>
    </form>
  )
}
