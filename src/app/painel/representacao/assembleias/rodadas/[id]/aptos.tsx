"use client"

import { useActionState, useState, type ReactNode } from "react"
import { FileUp, Loader2, Pencil, Trash2, UserPlus } from "lucide-react"

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
import type { AptoLinha } from "@/lib/db/assembleias"

import {
  cadastrarEleitor,
  excluirApto,
  importarAptosCsv,
  salvarEleitor,
} from "./actions"

/** Importação de aptos por CSV (colunas: cpf, nome, matricula, email). */
export function ImportarAptos({ rodadaId }: { rodadaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(importarAptosCsv, {})
  const r = estado.resultado

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <FileUp />
        Importar aptos (CSV)
      </Button>
    )
  }

  return (
    <div className="grid w-full gap-4 rounded-lg border border-dashed p-4">
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="rodada_id" value={rodadaId} />
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo-aptos">Planilha CSV</Label>
          <Input
            id="arquivo-aptos"
            name="arquivo"
            type="file"
            accept=".csv,text/csv"
            required
          />
          <p className="text-muted-foreground text-xs">
            Coluna obrigatória: cpf. Opcionais: nome, matricula, email. CPF já
            apto nesta rodada é ignorado. Limite de 20.000 linhas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
            {pendente ? "Importando…" : "Importar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAberto(false)}
          >
            Fechar
          </Button>
        </div>
      </form>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {r && (
        <div className="grid gap-3">
          <p className="text-sm font-medium">
            Importação concluída — {r.totalLinhas.toLocaleString("pt-BR")}{" "}
            linha{r.totalLinhas === 1 ? "" : "s"} processada
            {r.totalLinhas === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-1 text-sm sm:grid-cols-3">
            <li>
              <span className="text-2xl font-semibold tabular-nums">
                {r.inseridos.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                aptos incluídos
              </span>
            </li>
            <li>
              <span className="text-2xl font-semibold tabular-nums">
                {r.ignorados.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                ignorados (já aptos ou repetidos)
              </span>
            </li>
            <li>
              <span
                className={`text-2xl font-semibold tabular-nums ${r.erros.length > 0 ? "text-destructive" : ""}`}
              >
                {r.erros.length.toLocaleString("pt-BR")}
              </span>
              <span className="text-muted-foreground block text-xs">
                linhas com erro
              </span>
            </li>
          </ul>
          {r.erros.length > 0 && (
            <div className="grid gap-1 border-t pt-3">
              <p className="text-muted-foreground text-xs font-medium">
                Erros (linha da planilha · motivo):
              </p>
              <ul className="text-muted-foreground grid max-h-48 gap-0.5 overflow-y-auto text-xs">
                {r.erros.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="tabular-nums">linha {e.linha}</span> ·{" "}
                    {e.motivo}
                  </li>
                ))}
                {r.erros.length > 50 && (
                  <li>… e mais {r.erros.length - 50} erros</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Diálogo de cadastro/edição de eleitor. Sem `apto` cadastra um novo; com
 * `apto` edita o da lista. Fecha sozinho quando a action confirma.
 */
function EleitorDialog({
  rodadaId,
  apto,
  trigger,
}: {
  rodadaId: string
  apto?: AptoLinha
  trigger: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(
    apto ? salvarEleitor : cadastrarEleitor,
    {}
  )

  // Fecha ao salvar (ajuste de estado no render, via troca de identidade).
  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    if (estado.ok) setAberto(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{apto ? "Editar eleitor" : "Novo eleitor"}</DialogTitle>
          <DialogDescription>
            {apto
              ? "Corrija os dados deste eleitor da lista de aptos."
              : "Cadastre um eleitor apto a votar nesta rodada."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="rodada_id" value={rodadaId} />
          {apto && <input type="hidden" name="apto_id" value={apto.id} />}
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`cpf-${apto?.id ?? "novo"}`}>CPF *</Label>
            <Input
              id={`cpf-${apto?.id ?? "novo"}`}
              name="cpf"
              required
              inputMode="numeric"
              defaultValue={apto?.cpf ?? ""}
              placeholder="Somente números"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`nome-${apto?.id ?? "novo"}`}>Nome completo</Label>
            <Input
              id={`nome-${apto?.id ?? "novo"}`}
              name="nome"
              defaultValue={apto?.nome_completo ?? ""}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`matricula-${apto?.id ?? "novo"}`}>
                Matrícula
              </Label>
              <Input
                id={`matricula-${apto?.id ?? "novo"}`}
                name="matricula"
                defaultValue={apto?.matricula ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`email-${apto?.id ?? "novo"}`}>Email</Label>
              <Input
                id={`email-${apto?.id ?? "novo"}`}
                name="email"
                type="email"
                defaultValue={apto?.email_corporativo ?? ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAberto(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {apto ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Botão que abre o diálogo para cadastrar um novo eleitor. */
export function NovoEleitorBotao({ rodadaId }: { rodadaId: string }) {
  return (
    <EleitorDialog
      rodadaId={rodadaId}
      trigger={
        <Button variant="outline" size="sm">
          <UserPlus />
          Novo eleitor
        </Button>
      }
    />
  )
}

/** Ícone que abre o diálogo para editar um eleitor da lista. */
export function EditarEleitorBotao({
  rodadaId,
  apto,
}: {
  rodadaId: string
  apto: AptoLinha
}) {
  return (
    <EleitorDialog
      rodadaId={rodadaId}
      apto={apto}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Editar eleitor"
        >
          <Pencil />
        </Button>
      }
    />
  )
}

export function RemoverAptoBotao({
  rodadaId,
  aptoId,
  jaVotou,
}: {
  rodadaId: string
  aptoId: string
  jaVotou: boolean
}) {
  const [estado, formAction, pendente] = useActionState(excluirApto, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Remover este apto da lista?")) e.preventDefault()
      }}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <input type="hidden" name="apto_id" value={aptoId} />
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={pendente || jaVotou}
        aria-label="Remover apto"
        title={jaVotou ? "Já votou — não pode ser removido" : "Remover da lista"}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}
