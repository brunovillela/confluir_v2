"use client"

import { useActionState, useEffect, useState, type ReactNode } from "react"
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
  excluirAptosEmMassa,
  importarAptosCsv,
  salvarEleitor,
} from "./actions"
import { confirmar, confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario";

/** Importação de aptos por CSV (colunas: cpf, nome, matricula, email, telefone). */
export function ImportarAptos({ rodadaId }: { rodadaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(importarAptosCsv, {})
  const envio1 = useEnvioFormulario(formAction, estado);
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
      <form action={formAction} {...envio1} className="grid gap-3">
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
            Colunas: cpf, nome, matricula, email, telefone — basta uma que
            identifique a pessoa (o telefone é opcional e serve para mandar o link
            por WhatsApp/Telegram). O CPF é opcional (as empresas não enviam); o eleitor informa no
            primeiro acesso à votação. CPF já apto nesta rodada é ignorado. Limite de
            20.000 linhas.{" "}
            <a
              href="/modelos/aptos-a-votar.csv"
              download
              className="text-primary font-medium underline underline-offset-2"
            >
              Baixar planilha modelo
            </a>{" "}
            (linhas com nome começando por “EXEMPLO” são ignoradas).
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
  const envio2 = useEnvioFormulario(formAction, estado);

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
        <form action={formAction} {...envio2} className="grid gap-3">
          <input type="hidden" name="rodada_id" value={rodadaId} />
          {apto && <input type="hidden" name="apto_id" value={apto.id} />}
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`cpf-${apto?.id ?? "novo"}`}>CPF (opcional)</Label>
            <Input
              id={`cpf-${apto?.id ?? "novo"}`}
              name="cpf"
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
            <div className="grid gap-1.5">
              <Label htmlFor={`telefone-${apto?.id ?? "novo"}`}>Telefone</Label>
              <Input
                id={`telefone-${apto?.id ?? "novo"}`}
                name="telefone"
                type="tel"
                placeholder="(22) 99999-0000"
                defaultValue={apto?.telefone ?? ""}
              />
              <p className="text-muted-foreground text-xs">
                Para mandar o link por WhatsApp ou Telegram quando o e-mail não chega.
              </p>
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
        confirmarEnvio(e, "Remover este apto da lista?")}}
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

/** Id do formulário que junta as caixas de seleção das linhas da tabela. */
const formExclusaoAptos = (rodadaId: string) => `exclusao-aptos-${rodadaId}`

/** Só as caixas visíveis: o streaming do Next pode deixar uma cópia escondida
 * da página, cujas caixas também se ligariam ao formulário. */
const caixas = (formId: string) =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="apto_ids"][form="${formId}"]`
    )
  ).filter((c) => !c.closest("[hidden]"))

/** Caixa do cabeçalho: marca/desmarca os aptos da página que ainda podem sair. */
export function MarcarTodosAptos({ rodadaId }: { rodadaId: string }) {
  const formId = formExclusaoAptos(rodadaId)
  return (
    <input
      type="checkbox"
      className="size-4"
      aria-label="Marcar todos os aptos desta página"
      title="Marcar todos desta página (quem já votou fica de fora)"
      onChange={(e) => {
        for (const c of caixas(formId)) if (!c.disabled) c.checked = e.target.checked
        document.dispatchEvent(new Event("aptos-selecao"))
      }}
    />
  )
}

/**
 * Exclusão em massa (16/10/2026): os marcados na página ou todos os que não
 * votaram na rodada. Quem já votou ou teve presença na urna nunca sai.
 */
export function ExclusaoEmMassaAptos({
  rodadaId,
  naoVotaram,
}: {
  rodadaId: string
  /** Aptos da rodada que ainda não votaram (o alvo de "todos"). */
  naoVotaram: number
}) {
  const formId = formExclusaoAptos(rodadaId)
  const [estado, formAction, pendente] = useActionState(excluirAptosEmMassa, {})
  const envio3 = useEnvioFormulario(formAction, estado);
  const [marcados, setMarcados] = useState(0)

  useEffect(() => {
    const contar = () => setMarcados(caixas(formId).filter((c) => c.checked).length)
    const aoMudar = (e: Event) => {
      const alvo = e.target as HTMLInputElement | null
      if (alvo?.name === "apto_ids") contar()
    }
    document.addEventListener("change", aoMudar)
    document.addEventListener("aptos-selecao", contar)
    contar()
    return () => {
      document.removeEventListener("change", aoMudar)
      document.removeEventListener("aptos-selecao", contar)
    }
  }, [formId])

  // Depois de excluir, a lista recarrega: zera a contagem.
  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    if (estado.ok) setMarcados(0)
  }

  const n = (v: number) => v.toLocaleString("pt-BR")

  async function enviar(modo: "selecionados" | "todos", e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const ok = await confirmar({
      titulo:
        modo === "todos"
          ? `Remover os ${n(naoVotaram)} aptos que ainda não votaram?`
          : `Remover os ${n(marcados)} aptos marcados?`,
      descricao:
        "Eles saem da lista desta rodada e perdem o acesso à votação. Quem já votou ou teve presença registrada numa urna fica. Para voltar, será preciso importar ou cadastrar de novo.",
      confirmar: "Remover",
      destrutivo: true,
    })
    if (!ok) return
    const modoCampo = form.elements.namedItem("modo") as HTMLInputElement | null
    if (modoCampo) modoCampo.value = modo
    form.requestSubmit()
  }

  return (
    <form id={formId} action={formAction} {...envio3} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <input type="hidden" name="modo" value="selecionados" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente || marcados === 0}
        onClick={(e) => enviar("selecionados", e)}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir marcados{marcados > 0 ? ` (${n(marcados)})` : ""}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={pendente || naoVotaram === 0}
        onClick={(e) => enviar("todos", e)}
      >
        <Trash2 />
        Excluir todos que não votaram ({n(naoVotaram)})
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}
