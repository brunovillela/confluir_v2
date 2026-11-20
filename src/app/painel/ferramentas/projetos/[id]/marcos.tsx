"use client"

import { useActionState, useState } from "react"
import { Check, Flag, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
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
import { type EstadoForm } from "@/lib/contas"
import type { MarcoProjeto } from "@/lib/db/projetos"
import { formatarData } from "@/lib/formato"
import { DIAS_AVISO_MARCO } from "@/lib/projetos-constantes"

import { alternarMarcoAction, criarMarcoAction, editarMarcoAction, excluirMarcoAction } from "../actions"

const DATA = "[color-scheme:light] dark:[color-scheme:dark]"

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000)
}

/** O selo do marco: cumprido, vencido, hoje ou em quantos dias. */
function SeloMarco({ marco, hoje }: { marco: MarcoProjeto; hoje: string }) {
  if (marco.concluidoEm) {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Cumprido em {formatarData(marco.concluidoEm)}
      </Badge>
    )
  }
  const dias = diasEntre(hoje, marco.dataPrevista)
  if (dias < 0) {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        Venceu há {-dias} dia{dias === -1 ? "" : "s"}
      </Badge>
    )
  }
  if (dias === 0) return <Badge variant="outline" className="border-warning/40 text-warning-fg">Vence hoje</Badge>
  return (
    <Badge variant="outline" className={dias <= DIAS_AVISO_MARCO ? "border-warning/40 text-warning-fg" : "text-muted-foreground"}>
      Em {dias} dia{dias === 1 ? "" : "s"}
    </Badge>
  )
}

function CamposMarco({ marco }: { marco?: MarcoProjeto }) {
  const sufixo = marco?.id ?? "novo"
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
      <div className="grid gap-1.5">
        <Label htmlFor={`marco-titulo-${sufixo}`} className="sr-only">
          O que deve estar pronto
        </Label>
        <Input
          id={`marco-titulo-${sufixo}`}
          name="titulo"
          required
          placeholder="O que deve estar pronto (ex.: Contratar o espaço)"
          defaultValue={marco?.titulo ?? ""}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`marco-data-${sufixo}`} className="sr-only">
          Data prevista
        </Label>
        <Input
          id={`marco-data-${sufixo}`}
          name="data_prevista"
          type="date"
          required
          aria-label="Data prevista"
          defaultValue={marco?.dataPrevista ?? ""}
          className={DATA}
        />
      </div>
    </div>
  )
}

function NovoMarco({ projetoId, aoFechar }: { projetoId: string; aoFechar: () => void }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(criarMarcoAction, {})
  return (
    <div className="bg-muted/40 relative grid gap-2 rounded-md border p-3 pr-10">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 size-7"
        aria-label="Fechar o formulário"
        onClick={aoFechar}
      >
        <X />
      </Button>
      <form action={acao} className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input type="hidden" name="projeto_id" value={projetoId} />
        <CamposMarco />
        <div className="flex items-start">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
            Adicionar
          </Button>
        </div>
        {estado.erro && <p className="text-destructive text-sm sm:col-span-2">{estado.erro}</p>}
      </form>
    </div>
  )
}

function AcoesMarco({ marco }: { marco: MarcoProjeto }) {
  const [aberto, setAberto] = useState(false)
  const [estado, salvar, salvando] = useActionState<EstadoForm, FormData>(async (prev, fd) => {
    const r = await editarMarcoAction(prev, fd)
    if (r.ok) setAberto(false)
    return r
  }, {})
  const [estadoAlternar, alternar, alternando] = useActionState<EstadoForm, FormData>(alternarMarcoAction, {})
  const [estadoExcluir, excluir, excluindo] = useActionState<EstadoForm, FormData>(excluirMarcoAction, {})
  const erro = estadoAlternar.erro ?? estadoExcluir.erro
  return (
    <span className="inline-flex items-center">
      <form action={alternar} className="inline">
        <input type="hidden" name="marco_id" value={marco.id} />
        <input type="hidden" name="concluir" value={marco.concluidoEm ? "0" : "1"} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={alternando}
          title={marco.concluidoEm ? "Reabrir o marco" : "Dar o marco por cumprido"}
          aria-label={marco.concluidoEm ? "Reabrir o marco" : "Dar o marco por cumprido"}
        >
          {alternando ? <Loader2 className="animate-spin" /> : marco.concluidoEm ? <RotateCcw /> : <Check />}
        </Button>
      </form>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" title="Editar o marco" aria-label="Editar o marco">
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar marco</DialogTitle>
            <DialogDescription>O que deve estar pronto e até quando.</DialogDescription>
          </DialogHeader>
          <form action={salvar} className="grid gap-3">
            <input type="hidden" name="marco_id" value={marco.id} />
            <CamposMarco marco={marco} />
            {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <form
        action={excluir}
        onSubmit={(e) =>
          confirmarEnvio(e, {
            titulo: "Excluir o marco?",
            descricao: `"${marco.titulo}" sai do projeto. Esta ação não pode ser desfeita.`,
            confirmar: "Excluir",
            destrutivo: true,
          })
        }
        className="inline"
      >
        <input type="hidden" name="marco_id" value={marco.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={excluindo}
          title="Excluir o marco"
          aria-label="Excluir o marco"
        >
          {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </form>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </span>
  )
}

/**
 * Marcos do projeto: etapas com data prevista. Marco vencido sem conclusão
 * põe o projeto em "Atrasado" na carteira. Quem edita o projeto cria, edita,
 * dá por cumprido e exclui; os demais só veem.
 */
export function MarcosProjeto({
  projetoId,
  marcos,
  hoje,
  editor,
}: {
  projetoId: string
  marcos: MarcoProjeto[]
  hoje: string
  editor: boolean
}) {
  const [novo, setNovo] = useState(false)
  const cumpridos = marcos.filter((m) => m.concluidoEm).length
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Marcos{" "}
          <span className="text-muted-foreground font-normal">
            ({cumpridos}/{marcos.length})
          </span>
        </p>
        {editor && (
          <Button
            type="button"
            size="sm"
            variant={novo ? "secondary" : "outline"}
            aria-expanded={novo}
            onClick={() => setNovo((v) => !v)}
          >
            <Flag />
            Novo marco
          </Button>
        )}
      </div>
      {novo && <NovoMarco projetoId={projetoId} aoFechar={() => setNovo(false)} />}
      {marcos.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Nenhum marco ainda. Marcos são as etapas com data (ex.: &quot;Contratar o espaço&quot; até 15/12) e
          mostram se o projeto está no prazo.
        </p>
      ) : (
        <ol className="grid gap-0 divide-y">
          {marcos.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-muted-foreground w-24 shrink-0 text-sm tabular-nums">{formatarData(m.dataPrevista)}</span>
                <span className={`min-w-0 text-sm ${m.concluidoEm ? "text-muted-foreground line-through" : "font-medium"}`}>
                  {m.titulo}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SeloMarco marco={m} hoje={hoje} />
                {editor && <AcoesMarco marco={m} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
