"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { FileUp, Loader2, Trash2 } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { ACEITA_NOTA, prepararArquivo } from "../../nova/arquivo-envio"
import { excluirOrdensContratoAction, receberDocumentoOrdemAction } from "../actions"

/** Valor NUMERIC → texto pt-BR editável (sem símbolo). */
function valorParaTexto(valor: number | null): string {
  if (valor == null) return ""
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Nota de UMA parcela que aguarda documento fiscal. O valor vem da parcela;
 * se a nota veio com outro valor, corrija aqui (aí a ordem passa pela alçada).
 */
export function ReceberDocumentoForm({
  contratoId,
  ordemId,
  valor,
}: {
  contratoId: string
  ordemId: string
  valor: number | null
}) {
  const [estado, acao, pendente] = useActionState(receberDocumentoOrdemAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  if (estado.ok) {
    return <p className="text-success-fg text-xs">{estado.ok}</p>
  }
  return (
    <form
      ref={formRef}
      // Pelo onSubmit: a análise da auditoria pode devolver a nota para ajuste.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => acao(dados))
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pendente} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="ordem_id" value={ordemId} />
      <Input
        name="nota"
        type="file"
        required
        accept={ACEITA_NOTA}
        aria-label="Arquivo da nota"
        className="h-8 max-w-56 text-xs"
        onChange={async (e) => {
          const { erro } = await prepararArquivo(e.currentTarget)
          setErroArquivo(erro ?? null)
        }}
      />
      <Input
        name="valor"
        inputMode="decimal"
        defaultValue={valorParaTexto(valor)}
        aria-label="Valor da nota"
        title="Valor da nota — altere se veio diferente da parcela"
        className="h-8 w-28 text-right text-xs tabular-nums"
      />
      <Button type="submit" size="sm" disabled={pendente} className="h-8">
        {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
        Enviar nota
      </Button>
      {(erroArquivo ?? estado.erro) && (
        <span className="text-destructive basis-full text-xs">{erroArquivo ?? estado.erro}</span>
      )}
    </form>
  )
}

/** Caixas de seleção das linhas ficam fora do <form> e apontam para ele por `form`. */
function marcadas(formId: string): HTMLInputElement[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][form="${formId}"][name="ordem_ids"]`
    ),
  ]
}

/** Marca/desmarca todas as ordens selecionáveis da tabela. */
export function MarcarTodasOrdens({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Marcar todas as ordens não autorizadas"
      title="Marcar todas as não autorizadas"
      className="size-4 align-middle"
      onChange={(e) => {
        for (const c of marcadas(formId)) {
          c.checked = e.currentTarget.checked
          c.dispatchEvent(new Event("change", { bubbles: true }))
        }
      }}
    />
  )
}

/**
 * Barra da exclusão em massa: conta as ordens marcadas e exclui de uma vez
 * as que ainda não foram autorizadas (o servidor confere de novo).
 */
export function ExclusaoOrdensBarra({
  formId,
  contratoId,
}: {
  formId: string
  contratoId: string
}) {
  const [estado, acao, pendente] = useActionState(excluirOrdensContratoAction, {})
  const [quantas, setQuantas] = useState(0)

  useEffect(() => {
    const contar = () => setQuantas(marcadas(formId).filter((c) => c.checked).length)
    contar()
    document.addEventListener("change", contar)
    return () => document.removeEventListener("change", contar)
  }, [formId, estado])

  return (
    <form
      id={formId}
      action={acao}
      onSubmit={(e) => {
        if (!confirm(`Excluir ${quantas} ordem(ns) não autorizada(s)? Elas saem do contrato e do Financeiro.`)) {
          e.preventDefault()
        }
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {quantas > 0 && (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-sm">
            {quantas} ordem{quantas === 1 ? "" : "s"} marcada{quantas === 1 ? "" : "s"}
          </span>
          <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir marcadas
          </Button>
        </div>
      )}
    </form>
  )
}
