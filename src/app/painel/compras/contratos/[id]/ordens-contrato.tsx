"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { FileUp, Loader2, Pencil, Trash2 } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { ACEITA_NOTA, prepararArquivo } from "../../nova/arquivo-envio"
import {
  editarOrdemContratoAction,
  excluirOrdemContratoAction,
  excluirOrdensContratoAction,
  receberDocumentoOrdemAction,
} from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

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
        confirmarEnvio(e, `Excluir ${quantas} ordem(ns) não autorizada(s)? Elas saem do contrato e do Financeiro.`)
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

/**
 * Editar e excluir UMA ordem do contrato, na linha da tabela. Só aparece para
 * ordem ainda não paga nem em processamento (o servidor confere de novo).
 */
export function AcoesLinhaOrdem({
  contratoId,
  ordem,
}: {
  contratoId: string
  ordem: {
    id: string
    codigo: string | null
    descricao: string | null
    valor: number | null
    vencimento: string | null
    situacao: string | null
  }
}) {
  const [aberto, setAberto] = useState(false)
  // Salvou: o diálogo fecha e a confirmação aparece na linha.
  const [estEditar, acaoEditar, pendEditar] = useActionState(
    async (prev: { erro?: string; ok?: string }, dados: FormData) => {
      const r = await editarOrdemContratoAction(prev, dados)
      if (r.ok) setAberto(false)
      return r
    },
    {}
  )
  const [estExcluir, acaoExcluir, pendExcluir] = useActionState(excluirOrdemContratoAction, {})
  const autorizada = ordem.situacao === "A pagar"

  return (
    <div className="flex items-center justify-end gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" title="Editar ordem" aria-label={`Editar a ordem ${ordem.codigo ?? ""}`}>
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar ordem {ordem.codigo ?? ""}</DialogTitle>
            <DialogDescription>
              {autorizada
                ? "Esta ordem já foi autorizada: mudar o valor a devolve para autorização."
                : "A alteração fica no histórico da ordem, com o antes e o depois."}
            </DialogDescription>
          </DialogHeader>
          <form action={acaoEditar} className="grid gap-3">
            <input type="hidden" name="contrato_id" value={contratoId} />
            <input type="hidden" name="ordem_id" value={ordem.id} />
            {estEditar.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estEditar.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`ed_desc_${ordem.id}`}>Descrição</Label>
              <Input id={`ed_desc_${ordem.id}`} name="descricao" defaultValue={ordem.descricao ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`ed_valor_${ordem.id}`}>Valor</Label>
                <Input id={`ed_valor_${ordem.id}`} name="valor" inputMode="decimal" defaultValue={valorParaTexto(ordem.valor)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`ed_venc_${ordem.id}`}>Vencimento</Label>
                <Input id={`ed_venc_${ordem.id}`} name="vencimento" type="date" defaultValue={(ordem.vencimento ?? "").slice(0, 10)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`ed_motivo_${ordem.id}`}>Motivo da alteração *</Label>
              <textarea
                id={`ed_motivo_${ordem.id}`}
                name="motivo"
                rows={2}
                required
                className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Voltar
              </Button>
              <Button type="submit" disabled={pendEditar}>
                {pendEditar && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <form
        action={acaoExcluir}
        onSubmit={(e) =>
          confirmarEnvio(
            e,
            `Excluir a ordem ${ordem.codigo ?? ""}? Ela sai do contrato e do Financeiro${autorizada ? " — e a autorização já dada é desfeita" : ""}. A exclusão fica no histórico.`
          )
        }
      >
        <input type="hidden" name="contrato_id" value={contratoId} />
        <input type="hidden" name="ordem_id" value={ordem.id} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive size-8"
          disabled={pendExcluir}
          title="Excluir ordem"
          aria-label={`Excluir a ordem ${ordem.codigo ?? ""}`}
        >
          {pendExcluir ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </form>
      {(estExcluir.erro || estEditar.ok) && (
        <span className={`max-w-48 text-xs ${estExcluir.erro ? "text-destructive" : "text-success-fg"}`}>
          {estExcluir.erro ?? estEditar.ok}
        </span>
      )}
    </div>
  )
}
