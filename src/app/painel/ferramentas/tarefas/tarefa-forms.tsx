"use client"

import { type ReactNode, useActionState, useEffect, useState } from "react"
import { Check, Link2, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, Unlink, X } from "lucide-react"

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
import { type EstadoForm } from "@/lib/contas"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { type OpcaoPessoa, type TarefaAvulsa } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import {
  CLASSES_COR_ETIQUETA,
  PRIORIDADES_TAREFA,
  RECORRENCIAS_TAREFA,
  ROTULOS_PRIORIDADE_TAREFA,
  ROTULOS_RECORRENCIA_TAREFA,
  type CorEtiqueta,
  type PrioridadeTarefa,
  type RecorrenciaTarefa,
} from "@/lib/nucleo-constantes"

import {
  alternarConclusaoTarefaAction,
  criarTarefaAction,
  desvincularTarefaAction,
  editarTarefaAction,
  excluirTarefaAction,
  opcoesDeProcedimentoAction,
  vincularTarefaAction,
} from "./actions"
import { opcoesDeEtiquetaAction } from "./extras-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type PaiFixo = {
  campo: "demanda_id" | "projeto_id" | "anomalia_id"
  id: string
}

function SelectPrioridade({ id, padrao = "media" }: { id?: string; padrao?: PrioridadeTarefa }) {
  return (
    <select id={id} name="prioridade" defaultValue={padrao} className={SELECT} aria-label={id ? undefined : "Prioridade"}>
      {PRIORIDADES_TAREFA.map((p) => (
        <option key={p} value={p}>
          {id ? ROTULOS_PRIORIDADE_TAREFA[p] : `Prioridade ${ROTULOS_PRIORIDADE_TAREFA[p].toLowerCase()}`}
        </option>
      ))}
    </select>
  )
}

/** Repetição da tarefa: ao concluir, a próxima nasce com o prazo avançado. */
function SelectRecorrencia({ id, padrao = null }: { id?: string; padrao?: RecorrenciaTarefa | null }) {
  return (
    <select id={id} name="recorrencia" defaultValue={padrao ?? ""} className={SELECT} aria-label={id ? undefined : "Repetir"}>
      <option value="">Não repete</option>
      {RECORRENCIAS_TAREFA.map((r) => (
        <option key={r} value={r}>
          {id ? ROTULOS_RECORRENCIA_TAREFA[r] : `Repete: ${ROTULOS_RECORRENCIA_TAREFA[r].toLowerCase()}`}
        </option>
      ))}
    </select>
  )
}

/** Opções de procedimento: uma leitura por página, dividida entre os seletores. */
let opcoesProcedimento: Promise<{ id: string; nome: string }[]> | null = null

/**
 * Procedimento que a tarefa segue (um documento de Ferramentas → Documentos).
 * As opções carregam ao montar; a atual aparece mesmo antes de carregar.
 */
function SelectProcedimento({
  id,
  padrao = null,
  padraoNome = null,
}: {
  id?: string
  padrao?: string | null
  padraoNome?: string | null
}) {
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string }[] | null>(null)
  useEffect(() => {
    let vivo = true
    opcoesProcedimento ??= opcoesDeProcedimentoAction().catch(() => [])
    opcoesProcedimento.then((o) => vivo && setOpcoes(o))
    return () => {
      vivo = false
    }
  }, [])
  const lista = opcoes ?? (padrao ? [{ id: padrao, nome: padraoNome ?? "(procedimento atual)" }] : [])
  const comAtual = padrao && !lista.some((o) => o.id === padrao) ? [{ id: padrao, nome: padraoNome ?? "(procedimento atual)" }, ...lista] : lista
  return (
    <select
      id={id}
      name="procedimento_id"
      defaultValue={padrao ?? ""}
      key={opcoes ? "carregado" : "inicial"}
      className={SELECT}
      aria-label={id ? undefined : "Procedimento"}
    >
      <option value="">{id ? "Nenhum" : "Sem procedimento"}</option>
      {comAtual.map((o) => (
        <option key={o.id} value={o.id}>
          {id ? o.nome : `Procedimento: ${o.nome}`}
        </option>
      ))}
    </select>
  )
}

/** Etiquetas da entidade: uma leitura por página, dividida entre os seletores. */
let opcoesEtiqueta: Promise<{ id: string; nome: string; cor: CorEtiqueta }[]> | null = null

/** Marcar as etiquetas da tarefa (as da entidade; criar e renomear ficam em "Etiquetas", na página de Tarefas). */
function SelecaoEtiquetas({ marcadas }: { marcadas: { id: string; nome: string; cor: CorEtiqueta }[] }) {
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string; cor: CorEtiqueta }[] | null>(null)
  useEffect(() => {
    let vivo = true
    opcoesEtiqueta ??= opcoesDeEtiquetaAction().catch(() => [])
    opcoesEtiqueta.then((o) => vivo && setOpcoes(o))
    return () => {
      vivo = false
    }
  }, [])
  const lista = opcoes ?? marcadas
  const ids = new Set(marcadas.map((m) => m.id))
  return (
    <fieldset className="grid gap-1.5 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium">Etiquetas</legend>
      <input type="hidden" name="etiquetas_presente" value="1" />
      {lista.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          Nenhuma etiqueta criada. Crie em &quot;Etiquetas&quot;, na página de Tarefas.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5" key={opcoes ? "carregado" : "inicial"}>
          {lista.map((e) => (
            <label key={e.id} className="cursor-pointer">
              <input type="checkbox" name="etiqueta" value={e.id} defaultChecked={ids.has(e.id)} className="peer sr-only" />
              <span
                className={cn(
                  "inline-block rounded border-2 border-transparent px-2 py-1 text-xs font-medium opacity-50 peer-checked:border-current peer-checked:opacity-100 peer-focus-visible:ring-2",
                  CLASSES_COR_ETIQUETA[e.cor]
                )}
              >
                {e.nome}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function SelectPessoa({
  nome,
  rotulo,
  pessoas,
}: {
  nome: string
  rotulo: string
  pessoas: OpcaoPessoa[]
}) {
  return (
    <select name={nome} defaultValue="" className={SELECT} aria-label={rotulo}>
      <option value="">{rotulo}</option>
      {pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  )
}

/** Formulário compacto de nova tarefa. `pai` fixa o vínculo (demanda/anomalia/projeto). */
export function AdicionarTarefa({
  pessoas,
  pai,
}: {
  pessoas: OpcaoPessoa[]
  pai?: PaiFixo
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    criarTarefaAction,
    {}
  )

  // Campos não controlados: o React 19 reseta o form após a action concluir,
  // limpando os campos para o próximo lançamento sem precisar de key/efeito.
  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
      {pai && <input type="hidden" name={pai.campo} value={pai.id} />}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          name="titulo"
          required
          placeholder="Descreva a tarefa"
          className="sm:col-span-2 lg:col-span-4"
        />
        <SelectPessoa nome="demandado_id" rotulo="Responsável (demandado)" pessoas={pessoas} />
        <Input
          name="data_prazo_entrega"
          type="date"
          aria-label="Prazo"
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
        <SelectPrioridade />
        <SelectRecorrencia />
        <div className="sm:col-span-2 lg:col-span-4">
          <SelectProcedimento />
        </div>
      </div>
      <div className="flex items-start">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar
        </Button>
      </div>
      {estado.erro && (
        <p className="text-destructive text-sm sm:col-span-2">{estado.erro}</p>
      )}
    </form>
  )
}

/** Botão de concluir / reabrir uma tarefa. */
export function ToggleTarefa({
  tarefaId,
  concluido,
  pai,
}: {
  tarefaId: string
  concluido: boolean
  pai?: PaiFixo
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(async (prev, fd) => {
    const r = await alternarConclusaoTarefaAction(prev, fd)
    // Recorrente: avisa que a próxima já nasceu (a linha pode sair da tela).
    if (r.ok?.includes("próxima")) toast.success(r.ok)
    return r
  }, {})
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="tarefa_id" value={tarefaId} />
      <input type="hidden" name="concluir" value={concluido ? "0" : "1"} />
      {pai && <input type="hidden" name={pai.campo} value={pai.id} />}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        title={concluido ? "Reabrir" : "Concluir"}
        aria-label={concluido ? "Reabrir tarefa" : "Concluir tarefa"}
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : concluido ? (
          <RotateCcw />
        ) : (
          <Check />
        )}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/**
 * Traz uma tarefa avulsa (sem demanda, projeto nem anomalia) para a demanda ou
 * o projeto da tela. No projeto, ela entra também na demanda do projeto.
 */
export function VincularTarefa({ pai, avulsas }: { pai: PaiFixo; avulsas: TarefaAvulsa[] }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(vincularTarefaAction, {})
  if (avulsas.length === 0) return null
  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name={pai.campo} value={pai.id} />
      <select name="tarefa_id" defaultValue="" required className={SELECT} aria-label="Tarefa avulsa a vincular">
        <option value="">Vincular uma tarefa avulsa…</option>
        {avulsas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.titulo ?? "(sem título)"}
            {t.demandadoNome ? ` — ${t.demandadoNome}` : ""}
            {t.prazo ? ` · até ${formatarData(t.prazo)}` : ""}
          </option>
        ))}
      </select>
      <div className="flex items-start">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Vincular
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm sm:col-span-2">{estado.erro}</p>}
    </form>
  )
}

/**
 * Botões "Nova tarefa" e "Vincular avulsa" que abrem o formulário só quando
 * pedido (a lista fica limpa). O de nova tarefa continua aberto depois de
 * adicionar, para lançar várias em seguida; fecha no X.
 */
export function IncluirTarefas({
  pessoas,
  pai,
  avulsas,
  dica,
  cabecalho,
  rotuloNova = "Nova tarefa",
  abertoInicial = false,
}: {
  pessoas: OpcaoPessoa[]
  pai: PaiFixo
  avulsas: TarefaAvulsa[]
  dica?: string
  /** Fica à esquerda, na mesma linha dos botões (título do cartão). */
  cabecalho?: ReactNode
  rotuloNova?: string
  /** Já abre com o formulário da nova tarefa. */
  abertoInicial?: boolean
}) {
  const [aberto, setAberto] = useState<"nova" | "vincular" | null>(abertoInicial ? "nova" : null)
  const alternar = (qual: "nova" | "vincular") => setAberto((a) => (a === qual ? null : qual))
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {cabecalho}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={aberto === "nova" ? "secondary" : "default"}
            aria-expanded={aberto === "nova"}
            onClick={() => alternar("nova")}
          >
            <Plus />
            {rotuloNova}
          </Button>
          {avulsas.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant={aberto === "vincular" ? "secondary" : "outline"}
              aria-expanded={aberto === "vincular"}
              onClick={() => alternar("vincular")}
            >
              <Link2 />
              Vincular avulsa
            </Button>
          )}
        </div>
      </div>
      {aberto && (
        <div className="bg-muted/40 relative grid gap-2 rounded-md border p-3 pr-10">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 size-7"
            aria-label="Fechar o formulário"
            onClick={() => setAberto(null)}
          >
            <X />
          </Button>
          {aberto === "nova" ? (
            <AdicionarTarefa pessoas={pessoas} pai={pai} />
          ) : (
            <VincularTarefa pai={pai} avulsas={avulsas} />
          )}
          {dica && aberto === "nova" && <p className="text-muted-foreground text-xs">{dica}</p>}
        </div>
      )}
    </div>
  )
}

/** Tira a tarefa da demanda ou do projeto: ela continua existindo, avulsa. */
export function DesvincularTarefa({ tarefaId, titulo, pai }: { tarefaId: string; titulo: string | null; pai: PaiFixo }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(desvincularTarefaAction, {})
  const onde = pai.campo === "projeto_id" ? "deste projeto" : "desta demanda"
  return (
    <form
      action={formAction}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Desvincular a tarefa?",
          descricao: `"${titulo ?? "(sem título)"}" deixa de ser ${onde} e continua existindo como tarefa avulsa, com o mesmo responsável e prazo.`,
          confirmar: "Desvincular",
        })
      }
      className="inline"
    >
      <input type="hidden" name="tarefa_id" value={tarefaId} />
      <input type="hidden" name={pai.campo} value={pai.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        title={`Desvincular ${onde}`}
        aria-label={`Desvincular a tarefa ${onde}`}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Unlink />}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

type TarefaEditavel = {
  id: string
  titulo: string | null
  demandadoId: string | null
  demandadoNome: string | null
  prazo: string | null
  prioridade: PrioridadeTarefa
  recorrencia: RecorrenciaTarefa | null
  procedimentoId: string | null
  procedimentoNome: string | null
  inicio: string | null
  dependeDe: string[]
  etiquetas: { id: string; nome: string; cor: CorEtiqueta }[]
}

/**
 * Editar (título, responsável e prazo) e excluir a tarefa. Responsável novo é
 * avisado; excluir pede confirmação e não tem volta.
 */
export function AcoesTarefa({
  tarefa,
  pessoas,
  irmas = [],
}: {
  tarefa: TarefaEditavel
  pessoas: OpcaoPessoa[]
  /** Tarefas do mesmo vínculo (demanda, projeto ou anomalia): as que esta pode esperar. */
  irmas?: { id: string; titulo: string | null }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(async (prev, fd) => {
    const r = await editarTarefaAction(prev, fd)
    if (r.ok) setAberto(false)
    return r
  }, {})
  const [estadoExcluir, excluir, excluindo] = useActionState<EstadoForm, FormData>(excluirTarefaAction, {})
  // Responsável que saiu da lista de pessoas continua escolhido.
  const opcoes =
    tarefa.demandadoId && !pessoas.some((p) => p.id === tarefa.demandadoId)
      ? [{ id: tarefa.demandadoId, nome: tarefa.demandadoNome ?? "(responsável atual)" }, ...pessoas]
      : pessoas

  return (
    <span className="inline-flex items-center">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" title="Editar a tarefa" aria-label="Editar a tarefa">
            <Pencil />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
            <DialogDescription>
              Se o responsável mudar, a pessoa nova é avisada. Tarefa que se repete cria a próxima ao ser concluída.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="grid gap-3">
            <input type="hidden" name="tarefa_id" value={tarefa.id} />
            <div className="grid gap-1.5">
              <Label htmlFor={`titulo-${tarefa.id}`}>Tarefa</Label>
              <Input id={`titulo-${tarefa.id}`} name="titulo" required defaultValue={tarefa.titulo ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`responsavel-${tarefa.id}`}>Responsável</Label>
                <select
                  id={`responsavel-${tarefa.id}`}
                  name="demandado_id"
                  defaultValue={tarefa.demandadoId ?? ""}
                  className={SELECT}
                >
                  <option value="">(sem responsável)</option>
                  {opcoes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`inicio-${tarefa.id}`}>Início</Label>
                <Input
                  id={`inicio-${tarefa.id}`}
                  name="data_inicio"
                  type="date"
                  defaultValue={tarefa.inicio ?? ""}
                  className="[color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`prazo-${tarefa.id}`}>Prazo</Label>
                <Input
                  id={`prazo-${tarefa.id}`}
                  name="data_prazo_entrega"
                  type="date"
                  defaultValue={tarefa.prazo ?? ""}
                  className="[color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`prioridade-${tarefa.id}`}>Prioridade</Label>
                <SelectPrioridade id={`prioridade-${tarefa.id}`} padrao={tarefa.prioridade} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`recorrencia-${tarefa.id}`}>Repetir</Label>
                <SelectRecorrencia id={`recorrencia-${tarefa.id}`} padrao={tarefa.recorrencia} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`procedimento-${tarefa.id}`}>Procedimento</Label>
                <SelectProcedimento
                  id={`procedimento-${tarefa.id}`}
                  padrao={tarefa.procedimentoId}
                  padraoNome={tarefa.procedimentoNome}
                />
              </div>
              <SelecaoEtiquetas marcadas={tarefa.etiquetas} />
              {irmas.length > 0 && (
                <fieldset className="grid gap-1.5 sm:col-span-2">
                  <legend className="mb-1 text-sm font-medium">Depende de</legend>
                  <p className="text-muted-foreground -mt-1 text-xs">
                    Esta tarefa só começa quando as marcadas terminarem; o responsável é avisado quando forem concluídas.
                  </p>
                  <input type="hidden" name="depende_de_presente" value="1" />
                  <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2">
                    {irmas.map((i) => (
                      <label key={i.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="depende_de"
                          value={i.id}
                          defaultChecked={tarefa.dependeDe.includes(i.id)}
                          className="size-4"
                        />
                        <span className="truncate">{i.titulo ?? "(sem título)"}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
            {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Save />}
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
            titulo: "Excluir a tarefa?",
            descricao: `"${tarefa.titulo ?? "(sem título)"}" será apagada de vez, também da demanda, do projeto ou da anomalia a que pertence. Esta ação não pode ser desfeita.`,
            confirmar: "Excluir",
            destrutivo: true,
          })
        }
        className="inline"
      >
        <input type="hidden" name="tarefa_id" value={tarefa.id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={excluindo}
          title="Excluir a tarefa"
          aria-label="Excluir a tarefa"
        >
          {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </form>
      {estadoExcluir.erro && <span className="text-destructive text-xs">{estadoExcluir.erro}</span>}
    </span>
  )
}
